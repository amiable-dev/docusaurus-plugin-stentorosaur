# Stentorosaur

Status monitoring for Docusaurus sites, powered by GitHub Issues and
GitHub Actions — similar to [Upptime](https://github.com/upptime/upptime),
but embedded in your docs site and able to track business processes as
well as technical systems.

This repository is a monorepo (see
[ADR-005](docs/adrs/ADR-005-decoupled-data-plane-and-package-split.md)):

| Package | Description |
|---------|-------------|
| [`@amiable-dev/docusaurus-plugin-stentorosaur`](packages/docusaurus-plugin-stentorosaur/) | The Docusaurus plugin (published to npm) — **full documentation lives in its [README](packages/docusaurus-plugin-stentorosaur/README.md)** |
| [`@stentorosaur/core`](packages/core/) | Pure schemas and aggregation logic |
| [`@stentorosaur/probe`](packages/probe/) | Monitoring engine, `stentorosaur` CLI, and the Cloudflare Worker probe |

## Deployment profiles

One data contract (`status/v1`), three ways to run it
([ADR-005](docs/adrs/ADR-005-decoupled-data-plane-and-package-split.md),
[ADR-006](docs/adrs/ADR-006-low-cost-data-plane-profiles.md)):

| Profile | Probe runs on | Data lives in | Monthly cost driver |
|---|---|---|---|
| **A** (default) | GitHub Actions cron | git data branch | Actions minutes: each run bills ≥1 min — `*/5` cron ≈ 8,640 min/month, free on public repos, over the 2,000 free-tier on private |
| **B** | Cloudflare Worker → `repository_dispatch` → Actions ingest | git data branch | ~288 short ingest runs/day; Worker checks free; no write credential in the Worker |
| **C** | Cloudflare Worker → R2 bucket binding | R2 bucket (served via a **required custom domain**) | zero Actions in the monitoring loop; R2 class-A writes ≈ `runs_per_day × (N_entities + 3) × 30` — ~11% of the 1M free tier at 5-min cadence with 10 entities |

Incident sync (GitHub issues → incidents) stays on Actions in every
profile; its cost is a few minutes per incident event. Profiles are
portable both ways with `stentorosaur migrate --to r2 | --to git`.
Chooser details and setup runbooks:
[templates/workflows/README](packages/docusaurus-plugin-stentorosaur/templates/workflows/README.md).

## Development

```bash
npm install        # installs all workspaces
npm run build      # builds all packages
npm test           # tests all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) for
workflow details, and [docs/adrs/](docs/adrs/) for architecture decisions.

## License

MIT © [Amiable Development](https://amiable.dev)
