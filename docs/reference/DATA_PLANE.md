# The status/v1 Data Plane (v1)

Everything the status page renders comes from ONE schema-validated
contract on a dedicated git branch (default `status-data`), written by
`@stentorosaur/probe` and read by the plugin. Full rationale: ADR-005.

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
