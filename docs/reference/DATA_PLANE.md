# The status/v1 Data Plane (v1)

Everything the status page renders comes from ONE schema-validated
contract — by default on a dedicated git branch (default
`status-data`), written by `@stentorosaur/probe` and read by the
plugin. Full rationale: ADR-005. The same contract can live in an R2
bucket instead (ADR-006 Profile C, below).

```
status/v1/
├── summary.json          # THE file clients fetch (~2–10 KB)
├── entities/<slug>.json  # recent readings per entity (chart drill-down)
├── raw/<issue>.json      # original incident markdown (re-render provenance, §7)
├── incidents.atom        # feed for mail bridges / Slack RSS / Zapier
└── archives/YYYY/MM/history-YYYY-MM-DD.jsonl[.gz]  # append-only readings
```

`summary.json` carries per-entity status, uptime windows (d1/d7/d90),
compact 90-day day tuples for the uptime bars, open/recent incidents
(sanitized HTML rendered at write time), and upcoming/in-progress
maintenance. Day rollups are REBUILT from the archives on every write —
the summary is a pure function of on-branch inputs, which is what makes
concurrent writers safe (regenerate-and-retry, ADR-005 §5).

## The `stentorosaur` CLI (ships with `@stentorosaur/probe`)

| Command | What it does |
|---|---|
| `init` | scaffold `stentorosaur.config.js` + print data-branch bootstrap steps |
| `doctor` | validate config, slugs, and data-plane health |
| `probe` | run HTTP checks in parallel, write readings + details, regenerate, push |
| `update-incidents` | sync GitHub issues → incidents/maintenance inputs + `raw/`, regenerate, push |
| `regenerate` | §7 runbook: re-render every body from `raw/` with the current sanitizer |
| `migrate` | one-time 0.x → v1 conversion (config + full history, zero loss) |
| `migrate --to r2` / `--to git` | move the whole plane between git and an R2 bucket (verbatim copy, merge-by-content, `--dry-run` plans) |
| `ingest --payload <file>` | receive a `repository_dispatch` probe payload (schema-gated) |

All data-branch writers accept `--config <site>`, `--workdir <data
worktree>`, `--branch <name>`, `--no-push`.

## Workflows (templates in `templates/workflows/`)

| Template | Trigger | Purpose |
|---|---|---|
| `probe-v1.yml` | cron */5 | checks → readings → push |
| `status-update-v1.yml` | issue events | issues → incidents → push |
| `probe-dispatch-v1.yml` | `repository_dispatch` | ingest readings from an external prober |
| `compact-data-branch-v1.yml` | monthly | orphan-reset the branch to one commit (§10) |
| `deploy-v1.yml` | push to main | plain docs deploys — status never redeploys the site |

See [templates/workflows/README](../../packages/docusaurus-plugin-stentorosaur/templates/workflows/README.md)
for serving options, the Cloudflare Worker probe (1-minute resolution
without a write credential in the Worker — ADR-005 §6), and quota math.

## Incident lifecycle

1. Open a GitHub issue with the `status` label + entity labels
   (`system:api` or `api`) + severity (`critical`/`major`/`minor`).
2. `status-update-v1.yml` converts it: markdown is sanitized to HTML at
   WRITE time; the original markdown is kept under `raw/`.
3. Status math: `critical` → down; `major`/`minor` → degraded; worst
   wins against the probe state.
4. Close the issue → it moves to `incidents.recent`.

Maintenance windows: issues with a `maintenance` label and a
`start:`/`end:` frontmatter block (human-friendly dates like
`@tomorrow 2am UTC` are parsed server-side).

## Profile C: the same contract in an R2 bucket (ADR-006)

Opting into `dataPlane: {kind: 'r2', …}` moves the plane to object
storage: a Cloudflare Worker probes and writes directly through a
bucket binding (zero GitHub Actions in the monitoring loop) and a
serving route publishes `status/v1/*` with `Cache-Control`/ETag/CORS
behind a **required custom domain**. Two storage-shape differences
from git — the contract itself is identical:

```
status/v1/
├── readings/<ts>-<runid>.json   # ONE immutable batch per probe run
│                                # (R2 cannot append) — folded into
│                                # archives/ by the daily compaction
│                                # cron and then deleted
└── compaction-state.json        # compaction health (lastRun,
                                 # lastSuccess, quarantine count) —
                                 # `stentorosaur doctor` reads it
```

Write-order consistency (ADR-006 §3): git's multi-file commit is
replaced by a strict order — entity details → atom → **summary.json
LAST, `If-Match`-guarded** — so a client never sees a summary newer
than the inputs it references; the loser of a concurrent write
re-reads everything and retries. Compaction (§5) is fenced (a day is
only touched once closed plus 1 hour), verifies the archive byte-wise
before deleting any batch, and converges on re-run after any crash.
Both properties are enforced by concurrency tests (epic #97, ticket
#103) and the r2 leg of the e2e matrix runs the full pipeline —
Worker probe → compaction → serving route → built site — on every CI
run.

Setup runbook, budget math, and lifecycle guardrails:
[templates/workflows/README](../../packages/docusaurus-plugin-stentorosaur/templates/workflows/README.md)
§"Profile C". Config reference:
[CONFIGURATION.md](./CONFIGURATION.md) §`dataPlane`.
