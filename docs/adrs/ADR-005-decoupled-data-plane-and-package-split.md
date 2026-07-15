# ADR-005: Decoupled Data Plane, Single Data Contract, and Package Split

## Status

**IMPLEMENTED** - 2026-07-13 (epic #63: tickets #64–#77; approved with
council conditions 2026-07-12, all conditions honored in implementation)

Extended by [ADR-006](./ADR-006-low-cost-data-plane-profiles.md)
(IMPLEMENTED, epic #97): optional object-storage/zero-Actions
deployment profiles; no change to this ADR's defaults or contract.

## Council Review

Reviewed by LLM Council (2026-07-12, high confidence tier).

- **Verdict**: Approved with conditions. Core direction confirmed sound:
  decoupling the data plane from site deploys, one versioned contract with
  write-time aggregation, and the three-package split "are exactly the
  right moves to eliminate the primary defect class."
- **Conditions** (all incorporated in this revision):
  1. Private-repo runtime fetching declared **out of scope for v1.0** —
     no client-side tokens; private sites use the build-time snapshot
  2. Formal client fetch/cache protocol defined; propagation-latency
     claims corrected ("seconds" contradicted the CDN cache TTL)
  3. Git compaction policy for the data branch (commit-volume growth)
  4. Hot-file concurrency handling for `summary.json` (it is still a
     shared file even with per-entity probe outputs)
  5. Sanitization provenance: raw markdown retained alongside rendered
     HTML, plus a documented re-render runbook for sanitizer CVEs
  6. Migration compressed: safety-net phase + single hard cutover with
     one-time historical-data migration; dual-write and dual-render
     transition phases eliminated (they recreate the defect class this
     ADR exists to remove)

## Date

2026-07-12

## Context

### Problem Statement

Stentorosaur has evolved through four architectural generations (ADR-001
runtime data fetching, ADR-002 historical aggregation, ADR-003 monitorrc
single-source-of-truth, ADR-004 minimal cards) while keeping every prior
generation alive for backward compatibility. The compatibility surface now
generates more defects than the features.

Evidence from v0.21.1–v0.21.10 (ten patch releases in under a month):

- **#62 fixed twice** (v0.21.9, v0.21.10) because entity filtering is
  duplicated in `loadContent()` and `postBuild()`
- **Debug logging shipped to npm** (v0.21.6, v0.21.7) because there is no
  way to observe the data pipeline locally end-to-end
- **Three loading-state fixes** (v0.21.2, v0.21.5, v0.21.8) because the same
  UI is fed by two delivery paths (build-time props and runtime fetch) that
  must be kept consistent by hand
- **Option threading bugs** (v0.21.1, v0.21.3) because plugin options pass
  through multiple hand-copied data envelopes

### Root Causes

**1. Too many sources of truth.** `loadContent()` in `src/index.ts` is a
~330-line conditional ladder across six data paths:

| Path | Introduced | Still live? |
|------|-----------|-------------|
| Explicit demo data (`useDemoData: true`) | v0.1 | Yes |
| Implicit demo-on-empty / demo-on-error | v0.1 | Yes |
| Live GitHub API fetch at build time | v0.1 | Yes |
| Legacy `systems/*.json` files | v0.2 | Yes |
| Committed `current.json` + `incidents.json` + `maintenance.json` | v0.4 | Yes |
| Runtime fetch via `StatusDataProvider` (`daily-summary.json`, `current.json`) | v0.16/v0.21 | Yes |

Every fix must be applied to every path that can produce the affected data.

**2. Aggregation logic is duplicated, not shared.** Uptime percentage and
average response time are computed independently in `loadContent()`,
`convertReadingsToSystemFiles()`, `readSystemFiles()`, and again client-side
in `StatusDataProvider` / hooks — over `any[]`-typed readings, despite zod
being a dependency.

**3. One package doing four jobs.** The npm package ships:

- A Docusaurus plugin (`src/`)
- A monitoring engine (`scripts/monitor.js`, 685 lines of untested JS)
- A notification service (`src/notifications/`, with **nodemailer as a hard
  dependency of a docs-site plugin**)
- Nine `bin` entries including branch-migration tooling

~3,500 lines of plain JS in `scripts/` sit outside the TypeScript/Jest
safety net, while tested `src/` is ~3,700 lines.

**4. Deploy economics fight the free tier.** Status changes require full
Docusaurus rebuilds. Hourly scheduled deploys plus 5-minute monitoring
commits burn GitHub Actions minutes — the existence of
`scripts/calculate-actions-minutes.js` is the symptom.

**5. Heavy client payload.** chart.js + chartjs-plugin-annotation + marked +
dompurify are shipped to render uptime bars, sparklines, and incident text —
all achievable with plain SVG and write-time-sanitized HTML.

### Industry Context (2026)

- **Upptime** (our reference implementation) is essentially dormant
- **Self-hosted servers** (Uptime Kuma, Gatus) own the "I'll run a
  container" segment; **hosted services** (BetterStack, Instatus,
  Statuspage) own the paid segment
- The zero-infra, git-native niche Stentorosaur targets remains valid and
  underserved, but the modern pattern within it is **static site + runtime-
  fetched JSON from a decoupled data plane**, not "rebuild the site when
  status changes"
- GitHub Actions cron is a poor probe: ≥5-minute granularity with
  significant jitter, single-region (measures Azure's network), and burns
  minutes. Cloudflare Workers cron (free tier, 1-minute resolution) is
  where serious zero-infra monitoring has moved
- Modern status pages are consumed by machines: a stable JSON endpoint and
  RSS/Atom incident feed are table stakes

### What Is Working (Keep)

- **GitHub Issues as the incident system-of-record** — auditable,
  subscribable, free; the best idea inherited from Upptime
- **Namespaced entity labels** (`system:api`, `process:onboarding`) and the
  system/process entity model — the genuine differentiator
- **JSONL append-only archives with compression** (ADR-002)
- **Minimal cards with 90-day bars** (ADR-004)
- **Swizzleable theme components**
- **The status-branch direction** — `setup-status-branch.js` /
  `migrate-to-status-branch.js` already point at the right architecture;
  this ADR makes it the *only* path instead of the fifth

## Decision Drivers

1. **One source of truth**: a fix applied once must fix the whole pipeline
2. **Zero-infra**: must keep working on GitHub free tier with no servers
3. **Deploy decoupling**: status changes must never require a site rebuild
4. **Type safety end-to-end**: probe output through rendered DOM validated
   against one schema
5. **Small client payload**: a docs site should not pay 200KB+ for a status
   widget
6. **Graduation path**: users should be able to move probes from GH Actions
   to Cloudflare Workers without touching their site
7. **Testability**: the full pipeline must be exercisable in CI against
   fixtures

## Decision

### 1. Split into three packages (monorepo)

```
┌──────────────────────────────────────────────────────────────────┐
│  @stentorosaur/core                                              │
│  - Versioned zod schemas (status/v1/*)                           │
│  - ALL aggregation: readings → daily rollups, uptime math        │
│  - GitHub issue payload → incident/maintenance transforms        │
│  - Markdown → sanitized HTML (write-time)                        │
│  - No I/O. Pure functions over already-fetched data.             │
│    100% unit-testable.                                           │
└──────────────┬─────────────────────────────┬─────────────────────┘
               │ imports                     │ imports
┌──────────────┴──────────────┐  ┌───────────┴─────────────────────┐
│  @stentorosaur/probe        │  │  docusaurus-plugin-stentorosaur │
│  - ALL I/O lives here:      │  │  - Route registration           │
│    HTTP checks, GitHub API  │  │  - Theme components (SVG)       │
│    calls, git/branch writes │  │  - One data hook                │
│  - check(config)→readings   │  │  - SSG snapshot fallback        │
│  - Pluggable writers:       │  │  - No Octokit, no nodemailer,   │
│    · git-commit (Actions)   │  │    no monitoring code           │
│    · repository_dispatch    │  │                                 │
│      (Worker → Action)      │  │                                 │
│  - Issue-event handler      │  │                                 │
│  - CLI: init | doctor |     │  │                                 │
│    migrate | regenerate     │  │                                 │
└─────────────────────────────┘  └─────────────────────────────────┘
```

Boundary rule (council condition): **fetching is I/O and lives in
`probe`; transformation is logic and lives in `core`.** Core functions
accept already-fetched payloads (issue JSON, readings) and return
schema-validated outputs. Probe orchestrates: fetch → core transform →
write. The plugin performs exactly one kind of I/O: reading/fetching the
published contract files.

### 2. One canonical data contract: `status/v1/`

All status data lives on a dedicated **data branch** (default:
`status-data`):

```
status/v1/
├── summary.json          # THE file the client fetches (~2–10 KB)
│   {
│     "schemaVersion": 1,
│     "generatedAt": "...",        # required operational metadata
│     "generatedBy": "probe@x.y.z",
│     "entities": [
│       {
│         "name": "api", "type": "system", "displayName": "API",
│         "status": "up",
│         "uptime": { "d1": 100, "d7": 99.98, "d90": 99.95 },
│         "responseTimeMs": { "d1": 182 },
│         "days": [ {"date": "2026-07-12", "uptime": 100,
│                    "avgMs": 180, "worst": "up"}, ... 90 entries ]
│       }
│     ],
│     "incidents": { "open": [...], "recent": [...] },
│     "maintenance": { "upcoming": [...], "inProgress": [...] }
│   }
├── entities/<name>.json  # Per-entity detail (raw recent readings)
│                         # fetched only when a card is expanded
├── incidents.atom        # Machine-readable incident feed
├── raw/                  # Provenance: original issue markdown bodies
│                         # (enables re-rendering; see §7)
└── archives/YYYY/MM/     # JSONL archives (unchanged from ADR-002)
```

Rules:

- **All aggregation happens at write time** (in the probe / issue handler),
  never in the plugin, never in the client. This eliminates the v0.21.x bug
  class structurally.
- **Incident/maintenance markdown is sanitized and rendered to HTML at
  write time**, and the **original markdown is retained under `raw/`**
  so every derived artifact can be regenerated (see §7 on sanitizer CVEs).
- Every file is validated against the `@stentorosaur/core` zod schema on
  write *and* on read. `schemaVersion` gates future migrations.
- Per-entity reading files are keyed by entity, so probes can run **in
  parallel** — the sequential-monitoring tradeoff (v0.4.10) existed
  only because of the shared hot file. `summary.json` remains a shared
  derived file; §5 defines how concurrent writers handle it.

### 3. Decouple the data plane from site deploys

```
┌─────────────┐   readings    ┌──────────────┐
│ Probe       │──────────────▶│ status-data  │
│ (Actions or │               │ branch       │
│  CF Worker) │               │ status/v1/*  │
└─────────────┘               └──────┬───────┘
┌─────────────┐  issue event         │ served via GitHub Pages
│ GitHub      │──────────────────────┤ (primary) or raw.github-
│ Issues      │  (Action regenerates │ usercontent.com (fallback)
└─────────────┘   summary.json)      ▼
┌─────────────┐                  ┌──────────────────┐
│ Docs deploy │─── only on ─────▶│ Docusaurus site  │
│ (main)      │    code/docs     │ /status route    │
└─────────────┘    changes       │ SSG snapshot +   │
                                 │ hydrate from     │
                                 │ summary.json     │
                                 └──────────────────┘
```

- The docs site **never redeploys for status changes**. The client fetches
  `summary.json` at runtime; the build embeds a snapshot only as an
  SEO / no-JS fallback (rendered from the same schema via the same
  components).
- **Serving surface** (council condition): GitHub Pages on the data branch
  is the *primary* endpoint — correct `application/json` content type,
  documented behavior, predictable `max-age=600` caching.
  `raw.githubusercontent.com` is a *fallback only*: it is undocumented,
  serves `text/plain`, is rate-limited, and caches for ~5 minutes on its
  own schedule.
- **Honest propagation bound** (council condition): incident updates
  propagate in **one CDN TTL — up to ~10 minutes** (issue event → Action →
  data branch → Pages cache expiry → next client fetch). This replaces
  waiting up to an hour for a scheduled redeploy; it is *not*
  second-level propagation, and documentation must not claim otherwise.
- Monitoring commits never touch `main`; `paths-ignore` gymnastics and
  `[skip ci]` conventions in the deploy workflow disappear.

### 4. Client fetch protocol (council condition)

The plugin's single data hook implements, and the ADR mandates:

1. **Render immediately from the SSG snapshot** (stale-while-revalidate):
   the page is never blank and never shows a loading skeleton for the
   initial view — this also retires the v0.21.x loading-state bug family.
2. **Background fetch** of `summary.json` with `If-None-Match`/ETag;
   on 200, validate against the zod schema and swap state in place;
   on 304 or validation failure, keep the snapshot.
3. **Failure handling**: exponential backoff with full jitter
   (base 30s, cap 15min); a 429 or 403 pauses refetching for the
   `Retry-After`/rate-limit window; the snapshot remains on screen.
   The status page must never hard-fail because the data plane is
   unreachable.
4. **Refresh cadence**: refetch on tab focus and on a timer no more
   aggressive than the serving cache TTL (default 5 min) — polling
   faster than the CDN TTL only produces cache hits.
5. **Content-type tolerance**: parse responses as JSON regardless of
   `Content-Type` (required for the raw.githubusercontent fallback).

### 5. Concurrency on `summary.json` (council condition)

`summary.json` is a **derived** file: a deterministic pure function
(`core.buildSummary`) of the per-entity reading files, the archives, and
the issue set. Because it is derivable, concurrent writers do not need
locks — they need a regenerate-and-retry rule:

- Every writer (probe run, issue-event Action) follows:
  fetch latest data branch → write its own inputs (per-entity readings
  or issue snapshot) → regenerate `summary.json` from all inputs →
  push. On non-fast-forward rejection: fetch, rebase inputs, regenerate,
  retry (max 3, jittered). Regeneration after rebase is always correct
  because the summary is a pure function of the now-merged inputs.
- Workflow-level `concurrency` groups serialize probe runs against each
  other; the retry rule covers the probe-vs-issue-event race that
  `concurrency` groups can't (different workflows).

### 6. Probe portability and the Worker trust model

`@stentorosaur/probe` is a pure `check(config) → readings` engine with
pluggable writers. Default deployment remains GitHub Actions (the target
audience's platform, ephemeral `GITHUB_TOKEN`, zero secret management).

For Cloudflare Worker deployment (1-minute resolution, no Actions
minutes), the council flagged that a Worker holding a long-lived PAT with
`contents: write` is a materially different trust model. Therefore the
**default Worker writer does not write to git**: it performs the checks
and sends a `repository_dispatch` event carrying the readings; a
lightweight Action receives them and commits with its ephemeral token.
Direct-write via a fine-grained PAT (scoped to the data repo,
contents-only) is documented as an opt-in for users who accept the
trade-off. Either way, users graduate without changing their site or
their data.

### 7. Sanitization provenance (council condition)

Rendering markdown → HTML at write time bakes the output into git
history. If a sanitizer vulnerability is later patched, historical
payloads must be re-renderable:

- Original markdown bodies are always stored under `status/v1/raw/`
  (see §2) — sanitized HTML is never the only copy.
- `stentorosaur regenerate` re-runs all `core` transforms over the raw
  inputs and rewrites every derived file on the data branch. The
  security runbook for a sanitizer CVE is: bump the sanitizer in `core`,
  run `regenerate`, push. This is also the mechanism for future
  `schemaVersion` migrations.

### 8. One config file

A single `stentorosaur.config.ts` (or `.json`) consumed by both the probe
and the plugin:

```ts
export default defineConfig({
  owner: 'your-org',
  repo: 'your-repo',
  dataBranch: 'status-data',
  entities: [
    { name: 'api', type: 'system', displayName: 'API',
      probe: { url: 'https://api.example.com/health', timeout: 10000 } },
    { name: 'onboarding', type: 'process' },   // issue-tracked only
  ],
  incidents: { statusLabel: 'status', maintenanceLabels: ['maintenance'] },
});
```

This kills the `entitiesSource: 'config' | 'monitorrc' | 'hybrid'`
tri-state, the merge logic, and the mismatch-warning machinery
(`src/index.ts:108-197`). `.monitorrc.json` is retired;
`stentorosaur migrate` converts it.

### 9. Private repositories (council condition)

**Runtime fetching for private repositories is out of scope for v1.0.**
There is no safe zero-infra way to do it: `raw.githubusercontent.com`
does not accept auth headers, and shipping any token in a client bundle
is a credential leak regardless of scope. Private-repo sites use the
**build-time SSG snapshot exclusively** — their data freshness equals
their deploy cadence, and `stentorosaur doctor` says so explicitly.
A future authenticated proxy (e.g., a user-deployed Worker) may lift
this; it is deliberately not promised here. All prior references to a
"token header" runtime option (ADR-001 lineage) are withdrawn.

### 10. Data-branch compaction (council condition)

Five-minute probes produce ~100k commits/year; unbounded history slows
clones and Actions checkouts. Policy:

- The data branch's **files are authoritative; its history is not** —
  JSONL archives already carry the full time series, so old commits are
  redundant.
- A monthly scheduled workflow resets the branch to a single orphan
  commit containing the current tree (`git checkout --orphan` + force
  push), keeping history bounded at roughly one month of commits.
- All probe/Action checkouts use `fetch-depth: 1`.

### 11. Scope cuts

| Removed | Replacement |
|---------|-------------|
| `src/notifications/` + nodemailer dependency | See note below — this is a real capability gap, deliberately deferred |
| chart.js + react-chartjs-2 + annotation plugin | Lightweight inline SVG (bars, heatmaps, sparklines). **Cut completely at v1.0 — no `charts` compatibility option** (council: a dual-render option reinstates the defect class) |
| marked + dompurify (client) | Write-time rendering in `@stentorosaur/core`, raw markdown retained (§7) |
| Legacy `systems/*.json` read/write paths | `status/v1/entities/*.json` |
| Demo-data special cases in `loadContent()` | `dataUrl` pointing at a hosted sample data branch (`stentorosaur-demo`); demo = same code path as production |
| axios | Native `fetch` (formalized in `engines`: Node ≥ 20) |
| date-fns v2 | Native `Intl` date handling in core |
| `scripts/generate-version.js` + `src/version.ts` | Bundler define (tsup) reading `package.json` |
| 9 `bin` scripts | One CLI: `stentorosaur init \| doctor \| migrate \| regenerate \| probe \| update-incidents` |

**Notifications note** (council): dropping the notifier is the right
architectural cut but an honest functionality loss — GitHub issue
subscriptions notify *repo watchers*, not end-customers who visit the
status page and have no GitHub account. The v1.0 substitute is the
`incidents.atom` feed (consumable by mail bridges, Slack RSS apps, and
Zapier-class tools). Direct email/webhook notification is a deferred
capability for a separate optional package, not silently abandoned.

### 12. Testing strategy

- `@stentorosaur/core`: pure functions, exhaustive unit tests (the current
  Jest suite's aggregation tests move here)
- **Pipeline fixture test**: CI job that runs the probe against a mock HTTP
  server, writes `status/v1/` to a temp dir, builds a fixture Docusaurus
  site against it, and asserts on the rendered DOM (Playwright smoke).
  This single job would have caught every one of the ten v0.21.x patches
  before publish.
- Schema round-trip tests: every writer output must parse under the reader
  schema.
- Concurrency test: simulated probe-vs-issue-event race asserting the
  regenerate-and-retry rule converges (§5).

## Consequences

### Positive

- The v0.21.x defect class (state duplicated across N paths) is eliminated
  structurally, not by vigilance
- Status updates propagate within one CDN TTL (≤ ~10 min) without deploys;
  Actions minutes usage drops by an order of magnitude
- Client bundle shrinks substantially (chart.js + marked + dompurify +
  axios leave the dependency tree)
- Plugin package becomes reviewable: route + components + one hook
- Clear graduation path (Actions → Worker via `repository_dispatch`)
  widens the addressable audience without a new trust model by default
- Machine-readable `summary.json` + Atom feed make the status page
  integrable
- Stale-while-revalidate rendering retires the loading-state bug family

### Negative

- **Breaking change** — hard cutover at v1.0; users must run
  `stentorosaur migrate` once (mitigated: it converts config *and*
  historical data, and `doctor` verifies the result)
- End-customer notifications regress to the Atom feed until a separate
  notifier package exists
- Monorepo tooling overhead (workspaces, changesets or similar)
- Live data requires JS (mitigated by the SSG snapshot, which now renders
  first in all cases)
- Private repos lose runtime freshness entirely in v1.0 (explicit,
  documented trade — previously it was implicitly broken)

### Neutral

- ADR-001's dataSource strategies collapse into a single `dataUrl` —
  public-only at runtime; private = snapshot (see §9)
- ADR-002's archive format is unchanged; only its location moves
- ADR-004's components are kept, re-rendered over the new schema

## Migration Path (0.21.x → 1.0)

Council directive: no dual-write phase, no deprecation-warning release,
no transitional render options — each of those maintains two contracts
simultaneously, which is the disease this ADR treats. Two releases total.

### Phase 0 — v0.22: Safety net (non-breaking)

- Create monorepo layout; move existing code unchanged into
  `packages/docusaurus-plugin-stentorosaur`
- Extract aggregation functions into `packages/core`; existing call sites
  import them (behavior-preserving refactor, golden-file tests first)
- Add the pipeline fixture test against the **current** architecture —
  this is the regression harness the cutover will be validated against

### Phase 1 — v1.0: Hard cutover

- Implement `status/v1/` writers in probe and the single new read path in
  the plugin
- `stentorosaur migrate` performs the **one-time conversion**:
  - `.monitorrc.json` (+ plugin options) → `stentorosaur.config.ts`
  - Bootstraps the data branch (reusing `setup-status-branch.js` logic)
  - **Historical data**: `current.json`, `daily-summary.json`, and
    existing archives are transformed into `status/v1/` files so users'
    90-day history is intact at cutover — no visible reset
    (council condition)
- Same release deletes: all legacy read paths, `src/notifications/`,
  nodemailer, axios, chart.js, seven bin scripts. `loadContent()` shrinks
  to read + validate + register.
- `stentorosaur doctor` validates a migrated site end-to-end
- v0.22 lives on a maintenance branch for **90 days** (critical fixes
  only), then archives

### Compatibility matrix

| Version | Old data files | status/v1/ | .monitorrc.json | stentorosaur.config |
|---------|---------------|------------|-----------------|---------------------|
| 0.22    | read+write    | —          | read            | —                   |
| 1.0     | `migrate` converts once | only | `migrate` converts once | only     |

## Alternatives Considered

### A. Keep the monolith, just refactor loadContent()

Rejected: reduces line count but not path count. The defect class comes
from multiple delivery paths, not messy code within one path.

### B. Drop the git data plane; require Cloudflare Worker + KV

Rejected: abandons the zero-infra, GitHub-native positioning that is the
project's reason to exist. Workers become the *graduation* path, not the
entry point.

### C. Runtime-fetch GitHub Issues directly from the client

Rejected: unauthenticated API is rate-limited (60/hr/IP), shape is not
under our control, and it reintroduces client-side transformation of
untrusted markdown. Mirroring issues into `summary.json` via the
issue-event Action keeps Issues as the system of record with none of the
client cost.

### D. Adopt an existing OSS status server (Uptime Kuma/Gatus) as backend

Rejected: requires users to run infrastructure, and neither models
business-process entities or embeds in Docusaurus.

### E. Gradual 4-phase migration with dual-write (original proposal)

Rejected by council review: dual-writing two schemas and a
`charts: 'svg' | 'chartjs'` option each maintain parallel contracts —
"a superset of the compatibility burden this ADR aims to fix" — and a
multi-quarter tax a solo maintainer cannot afford. Replaced by
Phase 0 safety net + single hard cutover with one-time data migration.

## References

- LLM Council review, 2026-07-12 (high tier) — verdict and conditions
  recorded in the Council Review section above
- ADR-001: Configurable Data Fetching Strategies (superseded by `dataUrl`;
  private-repo token headers withdrawn per §9)
- ADR-002: Historical Data Aggregation (retained; archives relocate)
- ADR-003: monitorrc Single Source of Truth (superseded by
  `stentorosaur.config.ts`)
- ADR-004: Simplified Status Card UX (retained; re-rendered over v1 schema)
- Issue #62 — entity filtering fixed twice (motivating defect)
- v0.21.1–v0.21.10 changelog entries (motivating defect cluster)
- Upptime architecture: https://github.com/upptime/upptime
