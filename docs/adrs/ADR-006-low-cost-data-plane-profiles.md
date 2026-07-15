# ADR-006: Low-Cost Data-Plane Profiles (Object Storage + Zero-Actions Probe)

## Status

**IMPLEMENTED** — 2026-07-15 (epic #97: tickets #98–#104; approved with
council conditions the same day, all five honored in implementation).
Extends ADR-005 (IMPLEMENTED); changes no default behavior. Everything
here is an **optional deployment profile**.

Implementation map: `dataPlane` config (#98, PR #105) · R2 object store
+ §3 write-order writer (#99, PR #106) · Worker R2-writer mode +
serving route + Workers-safe core split (#100, PR #107) · §5 compaction
cron + lifecycle guardrails + doctor health (#101, PR #108) ·
`migrate --to r2` / `--to git` (#102, PR #109) · Profile C e2e leg +
condition-5 concurrency tests (#103, PR #110) · docs + this closeout
(#104).

Two corrections the implementation fed back into the design, both found
by the condition-5 concurrency tests (PR #110):
- the bounded read set must consume **batches before archives** — the
  reverse order had a torn window against a concurrent compactor (a
  freshly-archived day could vanish from one regenerate cycle); §3's
  consistency argument now rests on compaction's delete-after-verify
  ordering, which makes batch-first structurally lossless;
- immutable batch creates retry once under a suffixed run id on a key
  collision instead of failing the probe cycle.

## Council Review

Reviewed by LLM Council (2026-07-15, high tier). Verdict: approval with
required revisions — "exceptionally pragmatic, well-reasoned, and
contract-disciplined", but the draft "overstated its equivalence to
git-backed semantics and underspecified operational boundary
conditions". Conditions, all incorporated in this revision:

1. **Multi-object consistency model** — git commits were multi-file
   atomic; R2 `If-Match` protects single objects only. The draft's
   equivalence claim was wrong. → §3 now defines the write-order
   consistency model (summary-last commit point) and names the manifest
   pattern as the upgrade path.
2. **Compaction safety and idempotence** — fencing against late batch
   writes; delete only after verified archive write. → §5.
3. **Lifecycle expiry windows strictly longer than compaction lag +
   alerting window** (≥ 3 days) so a failed cron cannot cause silent
   data destruction. → §5.
4. **Parameterized cost model** — include entity count N and class-B
   (read/list) ops; mandate a Cloudflare custom domain so the CDN cache
   shields the Workers 100k req/day free ceiling. → §1–§2.
5. **Concurrency e2e tests** in the miniflare/wrangler leg (probe
   overlap with incident regenerate; compaction across a day
   boundary). → Implementation sketch.

The council also required the trade-offs section to state the loss of
write atomicity, the move from one metered ceiling to two, and the
clock-boundary trust between probe and compaction crons — added.

## Date

2026-07-15 (drafted and council-reviewed)

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

Budget model (council condition 4 — parameterized, not point
estimates). Per probe run: `1` batch write + `1` summary + `1` atom +
`N` entity details = `N + 3` class-A writes, plus `~1` list + `~R`
reads (class B) for the regenerate step, where `R` is the archive
window actually re-read (bounded by day-file count, ≤ 90):

- class A/month ≈ `runs_per_day × (N + 3) × 30`
- class B/month ≈ `runs_per_day × (R_list + R_get) × 30`

At 5-min cadence with N=10 entities: ~112k class-A/month (11% of the
1M free tier); at 1-min cadence with N=10: ~562k (56%) — inside, but
**N and cadence multiply**: 1-min with N=25 breaches the tier. The
implementation must therefore skip unchanged entity-detail writes
(content-hash guard) and document the formula in the profile chooser.
Class-B stays comfortably inside 10M/month in all realistic shapes,
but the regenerate step must read day archives, not raw batches, to
keep `R` bounded.

### 2. Serving: a Worker route, not r2.dev

`summary.json` is served by a small Worker route bound to the bucket,
setting `Cache-Control: max-age=60`, `ETag`, and CORS. The §4 client
protocol (SWR, `If-None-Match`, backoff) was designed for exactly this
and needs no changes. r2.dev public buckets are explicitly not the
serving path (no cache-control authority, hard rate limits).

**A Cloudflare custom domain is REQUIRED, not optional** (council
condition 4): on `workers.dev` every client poll invokes the Worker,
and the free plan caps Workers at ~100k requests/day — a public status
page polled by many browsers can exhaust it. Behind a custom domain the
CDN cache tier absorbs polls within `max-age`, so Worker invocations
scale with cache misses, not clients. The template refuses to document
a `workers.dev` serving setup.

**This solves the private-repo freshness gap**: the repo stays private;
the *status endpoint* is public (status data is public-by-intent — the
same posture ADR-005 took for Pages). Sites set `dataUrl` to the Worker
URL and get live updates with zero deploys and zero Actions.

### 3. Concurrency: same purity rule, simpler writer set

§5's purity insight carries over — `summary.json` is a pure function
of the stored inputs — but the atomicity does NOT (council condition
1): a git push committed summary + entity details + atom as one
snapshot; R2 writes them as individual objects, and `If-Match` guards
only single objects. A reader could observe a torn state between
objects of the same regenerate.

**Consistency model (write-order, Option A):** derived objects are
written in dependency order with **`summary.json` written LAST — it is
the commit point**. Clients (per the §4 protocol) always read the
summary first and treat entity details as enhancement-only, so the
worst observable skew is a drill-down chart one cycle staler than the
summary — the same staleness the CDN already permits. Each derived
object embeds the shared `generatedAt`, so skew is detectable. The
readings batch is immutable input, written before any derived object.

`If-Match` conditional puts remain the per-object race guard for the
rare concurrent-regenerate case (probe overlapping incident sync):
lose the race → re-list inputs → regenerate → retry, mirroring §5.
Writer set: one scheduled probe Worker + rare incident writes; no
Durable Object lock is required at these rates.

**Upgrade path (Option B, not now):** if torn reads ever matter,
switch to generation-prefixed derived objects plus a single atomically
swapped manifest pointer resolved by the serving Worker. This is a
serving-Worker change only — the contract and clients are unaffected —
which is why Option A is acceptable today.

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
has no commit history: the daily batch→JSONL compaction plus lifecycle
rules replace `compact-data-branch-v1.yml`. Council conditions 2–3
make the compaction contract explicit:

- **Fencing:** compaction only touches batch partitions strictly older
  than the previous UTC day boundary **plus a 1-hour buffer**, so a
  delayed probe write can never race the delete phase.
- **Delete-after-verify:** batch fragments are deleted only after the
  day's archive JSONL has been written AND read back
  successfully. The cron is idempotent and crash-safe: a re-run
  re-lists surviving batches, regenerates the same archive bytes
  (deterministic input set), and resumes deletion.
- **Lifecycle expiry is a backstop, never the mechanism:** any R2
  lifecycle rule on `readings/` must be **≥ 3 days** — strictly longer
  than the maximum tolerated compaction outage plus the monitoring
  alerting window — so a broken cron surfaces as an alert, not as
  silent data destruction. Archive expiry (beyond the 90-day window)
  stays optional and user-configured.

Auditability changes shape: from git commits to R2 object versioning
(optional) — accepted trade-off, stated honestly.

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
- **Loss of multi-object write atomicity** (council): git's commit
  snapshot becomes write-ordered eventual consistency with
  summary-last as the commit point; torn reads are bounded and
  detectable (shared `generatedAt`) but possible
- **One metered ceiling becomes two**: Actions minutes are replaced by
  R2 operation classes AND Workers request limits — both generous, but
  both require the parameterized budget in §1 and the custom-domain
  mandate in §2 to stay free
- **Clock-boundary trust**: correctness of day partitioning depends on
  UTC clock agreement between the probe and compaction crons —
  mitigated by the 1-hour compaction buffer
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
   (miniflare/wrangler dev) so both profiles stay covered — MUST
   include concurrency cases (council condition 5): probe run
   overlapping an incident regenerate, and compaction racing a
   day-boundary probe write; assert no torn/lost state

## References

- ADR-005 (data plane, §4 client protocol, §5 concurrency, §6 Worker
  trust model, §7 provenance, §9 private repos, §10 compaction)
- Epic #63 ticket #76 (Worker dispatch profile — shipped)
- GitHub Actions billing: per-job minute rounding; free-tier allotments
- Cloudflare R2/Workers free-tier limits (verify at adoption time)
