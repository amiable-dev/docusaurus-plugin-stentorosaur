# ADR-006: Low-Cost Data-Plane Profiles (Object Storage + Zero-Actions Probe)

## Status

**PROPOSED** — 2026-07-15. Extends ADR-005 (IMPLEMENTED); changes no
default behavior. Everything here is an **optional deployment profile**.

## Date

2026-07-15

## Context

### The cost problem, quantified

GitHub Actions bills **per job, rounded up to the minute**. A probe run
takes ~30–50 s of wall clock but bills as 1 minute. That rounding, not
the work itself, dominates the cost of any high-frequency loop:

| Loop | Cadence | Runs/month | Billed min/month |
|---|---|---|---|
| `probe-v1.yml` | every 5 min | ~8,640 | **~8,640** |
| `probe-dispatch-v1.yml` (Worker → ingest) | every 5 min | ~8,640 | **~8,640** |
| Hourly deploy (for §9 private-repo freshness) | hourly | 720 | ~2,160 (3-min builds) |

Free-plan private repos get **2,000 min/month**; Pro gets 3,000. The
default 5-minute probe alone is 4.3× the free tier on a private repo.
Public repos get free minutes, but the same rounding makes 1-minute
resolution (~43,200 min/month equivalent) unreasonable everywhere.

The ADR-005 §6 Worker profile moved the *checks* off Actions but kept
the *write path* on Actions (one ingest job per dispatch) — so its
Actions bill is identical. **The write path, not the checks, is the
cost center.**

### The freshness problem it drags along

For private repos, ADR-005 §9 serves the build-time snapshot: status
freshness = deploy cadence. Buying freshness with scheduled deploys is
the most expensive option on the table (site builds are the longest
jobs). A public data endpoint decoupled from both the repo and the site
would give ≤ minutes-level freshness for free.

### What the git branch actually provides

Any replacement must supply equivalents for what `status-data` (the git
branch) gives ADR-005:

1. **Serving** — Pages/raw URLs at zero cost
2. **Concurrency** — §5 regenerate-and-retry (summary is a pure
   function of on-branch inputs)
3. **History + provenance** — append-only archives; `raw/` markdown for
   the §7 sanitizer re-render runbook
4. **Auditability** — every write is a commit
5. **Zero accounts** — nothing beyond GitHub

## Decision

Introduce **deployment profiles** for the data plane. The `status/v1`
contract (schemas, file layout, client protocol) is **identical across
profiles** — the plugin never knows or cares which profile produced the
bytes behind `dataUrl`. Profiles change only who runs the checks and
where the files live.

| Profile | Checks | Write path | Storage/serving | Actions min/month | Freshness (private repo) |
|---|---|---|---|---|---|
| **A — Actions + git** (default, ADR-005) | Actions cron | git push | data branch via Pages/raw | ~8.6k at 5-min | deploy cadence |
| **B — Worker + dispatch** (ADR-005 §6) | CF Worker | dispatch → Actions ingest → git | data branch | ~8.6k at 5-min | deploy cadence |
| **C — Worker + object storage** (this ADR) | CF Worker | Worker writes storage directly | R2, served by a Worker route | **~0** (incidents only) | **≤ probe cadence, even for private repos** |

Profiles A and B remain fully supported and default. Profile C is
opt-in for users who accept one Cloudflare account.

### 1. Storage: Cloudflare R2, same layout, same schemas

R2 is the S3-equivalent with the decisive property for status pages:
**zero egress fees** and a generous free tier (10 GB storage, ~1M
class-A writes/month, ~10M reads/month — verify current limits at
adoption time). The bucket mirrors the branch layout byte-for-byte:

```
status/v1/summary.json
status/v1/entities/<slug>.json
status/v1/raw/<issue>.json
status/v1/incidents.atom
status/v1/readings/<ISO-timestamp>-<runid>.json   # NEW: per-run batches
status/v1/archives/YYYY/MM/history-YYYY-MM-DD.jsonl  # daily compaction output
```

One deviation: R2 objects cannot be appended, so the probe writes one
immutable **readings batch object per run** instead of appending JSONL
lines. A daily Worker cron compacts the previous day's batches into the
standard `archives/` JSONL file and deletes the batches — the archive
format stays identical, so `stentorosaur migrate` (in either direction)
and all core readers keep working.

Budget check at 5-minute cadence: 288 batch writes + 1 summary + N
entity details per run ≈ ~2,000 class-A ops/day ≈ 60k/month — 6% of the
free tier. At 1-minute cadence: ~300k/month, still inside it.

### 2. Serving: a Worker route, not r2.dev

`summary.json` is served by a small Worker route bound to the bucket
(custom domain or `workers.dev`), setting `Cache-Control: max-age=60`,
`ETag`, and CORS. The §4 client protocol (SWR, `If-None-Match`,
backoff) was designed for exactly this and needs no changes. r2.dev
public buckets are explicitly not the serving path (no cache-control
authority, hard rate limits).

**This solves the private-repo freshness gap**: the repo stays private;
the *status endpoint* is public (status data is public-by-intent — the
same posture ADR-005 took for Pages). Sites set `dataUrl` to the Worker
URL and get live updates with zero deploys and zero Actions.

### 3. Concurrency: same purity rule, simpler writer set

§5's insight carries over unchanged: `summary.json` is a pure function
of the stored inputs. In Profile C the writer set shrinks to one
scheduled Worker (readings) plus rare incident writes. Writes of
distinct objects never conflict; the regenerate step lists inputs and
rewrites derived files, so concurrent regenerates converge on the same
bytes. R2 conditional puts (`If-Match` on ETag) provide the
retry-on-race guard where the branch used non-fast-forward rejection.
No Durable Object lock is required at these write rates; one may be
added later without contract changes.

### 4. Incidents: hybrid on purpose (the jsdom constraint)

Write-time sanitization (§7) uses jsdom + DOMPurify — **not
Workers-compatible** (no DOM in the Workers runtime). Rather than adopt
a second sanitizer (divergent output would poison the §7 provenance
story), incident sync stays on GitHub Actions in all profiles:

- `status-update-v1.yml` continues to run on issue events — these are
  **rare** (a few billed minutes/month, not thousands; the cost table
  above is about the 5-minute loops).
- In Profile C its write step targets R2 via the S3-compatible API
  (`stentorosaur update-incidents --data-plane r2`) instead of git.
- `raw/` provenance and the `regenerate` re-render runbook work
  identically — raw markdown objects live next to the rendered output.

If Workers-native sanitization is ever wanted, that is its own ADR with
output-equivalence tests against the jsdom pipeline.

### 5. History lifecycle replaces git compaction

§10's monthly orphan-reset exists because git accumulates commits. R2
has no commit history: the daily batch→JSONL compaction (above) plus an
optional R2 lifecycle rule (expire `readings/` leftovers; optionally
expire archives beyond N days) replaces `compact-data-branch-v1.yml`
entirely. Auditability changes shape: from git commits to R2 object
versioning (optional) — accepted trade-off, stated honestly.

### 6. Configuration and packaging

`stentorosaur.config.js` grows one optional block; absence means
Profile A/B exactly as today:

```js
dataPlane: {
  kind: 'r2',                        // default: 'git'
  bucket: 'status',
  endpoint: 'https://<account>.r2.cloudflarestorage.com', // S3 API (CLI writes)
  publicBaseUrl: 'https://status.example.com',            // what dataUrl points at
},
```

- `@stentorosaur/probe/worker` gains an R2-writer mode (bucket binding
  in `wrangler.toml`; the existing dispatch mode remains).
- The CLI writers (`probe`, `update-incidents`, `regenerate`,
  `migrate`) gain an R2 backend behind the same commands, using the
  S3-compatible API with credentials from env — so migration between
  profiles is `stentorosaur migrate --to r2` copying the branch tree
  into the bucket (idempotent, same golden-comparison guarantees as the
  0.x→v1 migration).
- The compaction Worker cron ships in `templates/worker/`.

### 7. What is explicitly NOT changing

- No new default. Profile A remains the zero-accounts path.
- No plugin changes at all — `dataUrl` already abstracts the endpoint.
- No schema changes — `status/v1` is the contract, everywhere.
- No client-side tokens; Profile C endpoints are public (private
  *dashboards* remain out of scope, as in ADR-005 condition 1).

## Cost after adoption (Profile C, 5-min cadence, private repo)

| Item | Before | After |
|---|---|---|
| Probe Actions minutes | ~8,640/month | 0 |
| Incident-sync Actions minutes | ~10–50/month | ~10–50/month |
| Freshness deploys | up to 720/month | 0 (live endpoint) |
| Cloudflare | — | free tier (Workers + R2), single account |
| GitHub plan pressure | over free tier ×4 | comfortably inside free tier |

1-minute resolution becomes a config change (cron `* * * * *`) with no
Actions cost at all.

## Consequences

### Positive

- High-frequency monitoring decoupled from per-job minute billing
- Private repos get live status freshness without deploys — closes the
  ADR-005 §9 gap without violating its no-client-tokens condition
- The contract-first design of ADR-005 is validated: a whole storage
  swap without touching the plugin or schemas

### Negative

- One external account and two secrets (R2 keys for the CLI; bucket
  binding for the Worker) — exactly the dependency Profile A avoids
- Git-commit auditability replaced by weaker object-versioning
- Two write backends to maintain in probe (mitigated: shared
  transforms; backends are thin I/O adapters behind the §5 regenerate)
- The hybrid incident path means Profile C is "zero-Actions" only for
  the high-frequency loop, not literally

## Alternatives considered

- **Workers KV as primary store**: free-tier write limits (~1k/day) are
  below a 5-minute multi-entity cadence, values are eventually
  consistent, and no S3 API for the CLI. Rejected as primary; fine as a
  cache in front of R2 later.
- **D1 / Durable Objects as the store**: adds query capability nobody
  needs (the contract is files) and a bigger runtime surface. Rejected.
- **AWS S3 + Lambda/CloudFront**: functionally equivalent but egress
  billing, more IAM surface, and no free always-on cron tier as clean
  as Workers. Not precluded (the CLI speaks S3 API), just not the
  documented path.
- **Self-hosted runner for Actions**: removes minute billing but adds a
  server to operate — worse than the thing it replaces for this
  audience. Rejected.
- **Longer cron on Actions (15–30 min)**: the do-nothing option;
  documented as tuning guidance for Profile A, but it trades resolution
  for cost instead of removing the coupling.

## Implementation sketch (if accepted)

1. `@stentorosaur/probe`: R2 write backend (S3 API) behind the existing
   CLI commands + `dataPlane` config block (core schema)
2. `@stentorosaur/probe/worker`: R2-writer mode + daily compaction cron
3. `templates/worker/`: wrangler.toml with bucket binding + serving
   route (Cache-Control/ETag/CORS)
4. `stentorosaur migrate --to r2` / `--to git` (profile portability,
   golden-tested both directions)
5. Docs: profile chooser table in the README; runbook updates
6. Pipeline e2e: Profile C leg using an R2-compatible local emulator
   (miniflare/wrangler dev) so both profiles stay covered

## References

- ADR-005 (data plane, §4 client protocol, §5 concurrency, §6 Worker
  trust model, §7 provenance, §9 private repos, §10 compaction)
- Epic #63 ticket #76 (Worker dispatch profile — shipped)
- GitHub Actions billing: per-job minute rounding; free-tier allotments
- Cloudflare R2/Workers free-tier limits (verify at adoption time)
