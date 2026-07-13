# Docusaurus Status Plugin (Stentorosaur)

A Docusaurus plugin that renders an Upptime-style status dashboard from
a **published data contract** (`status/v1/`), with monitoring and
GitHub-issue incident tracking handled by the companion
[`@stentorosaur/probe`](https://www.npmjs.com/package/@stentorosaur/probe)
CLI and GitHub Actions. Track both system uptime and business-process
issues, embedded directly in your documentation site.

[![CI](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions/workflows/ci.yml/badge.svg)](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions/workflows/ci.yml)
[![Publish to npm](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions/workflows/publish.yml/badge.svg)](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions/workflows/publish.yml)

> **Upgrading from 0.x?** v1.0 is a hard cutover with a one-time
> migration that preserves your full history — see
> [MIGRATION_1.0](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/blob/main/docs/setup/MIGRATION_1.0.md).

## How it works (ADR-005)

```
┌────────────┐  checks   ┌──────────────────┐  git push   ┌──────────────┐
│ probe      ├──────────▶│ status/v1/ files │────────────▶│ status-data  │
│ (Actions   │           │ summary.json     │             │ branch       │
│ cron or CF │  issues   │ entities/*.json  │             │ (Pages/CDN)  │
│ Worker)    ├──────────▶│ incidents.atom   │             └──────┬───────┘
└────────────┘           └──────────────────┘                    │ fetch
                                                                 ▼
                                             ┌───────────────────────────┐
                                             │ this plugin: SSG snapshot │
                                             │ + live client refresh     │
                                             │ (SWR, ETag, backoff)      │
                                             └───────────────────────────┘
```

- **One data contract**: everything the page renders comes from
  `status/v1/summary.json` (schema-validated, ~2–10 KB), served from a
  dedicated `status-data` branch. Status updates propagate within one
  CDN TTL — **no site redeploys**.
- **One read path**: the plugin embeds a build-time snapshot for instant
  SSG render, then refreshes live in the client with ETag-aware polling
  and exponential backoff.
- **All I/O lives in the probe**: HTTP checks, GitHub-issue sync,
  markdown sanitization (at write time), and git writes are the
  `stentorosaur` CLI's job — the plugin has no Octokit, no chart.js, no
  monitoring code.

## Features

- 🎯 Status dashboard at `/status` — minimal cards with 90-day uptime
  bars, or the Upptime-style structured layout (`statusView: 'upptime'`)
- 📊 Live refresh without rebuilds (snapshot-first SWR client)
- 📈 Lightweight inline **SVG charts** (response time, uptime bars,
  SLI/SLO) — no charting library in your bundle
- 📅 Scheduled maintenance windows from GitHub issues with
  human-friendly dates (`@tomorrow 2am UTC`)
- 📰 `incidents.atom` feed published with the data (mail bridges, Slack
  RSS, Zapier)
- 🔧 Business processes tracked alongside systems (`type: 'process'`)
- ⚡ Cloudflare Worker probe option for 1-minute resolution without a
  write credential in the Worker (repository_dispatch trust model)

## Quick start (new site)

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur
npm install -D @stentorosaur/probe

npx stentorosaur init          # scaffolds stentorosaur.config.js
# fill in owner/repo/entities, create the data branch (init prints the commands)
npx stentorosaur probe         # first readings → status/v1 on the data branch
npx stentorosaur doctor        # validates config + data plane health
```

Serve the `status-data` branch (GitHub Pages → deploy from branch), then
configure the plugin:

```js
// docusaurus.config.js
plugins: [
  [
    '@amiable-dev/docusaurus-plugin-stentorosaur',
    {
      title: 'System Status',
      dataUrl: 'https://<user>.github.io/<repo>/status/v1/summary.json',
      entities: [
        {name: 'api', displayName: 'API', description: 'Public API'},
      ],
    },
  ],
],
```

Install the workflow templates from
[`templates/workflows/`](./templates/workflows/README.md):
`probe-v1.yml` (5-minute checks), `status-update-v1.yml` (issue events →
incidents), `compact-data-branch-v1.yml` (monthly history compaction),
`deploy-v1.yml` (plain docs deploys). For 1-minute resolution, deploy
the Cloudflare Worker from [`templates/worker/`](./templates/worker/)
with `probe-dispatch-v1.yml`.

## Plugin options

| Option | Default | Purpose |
|---|---|---|
| `dataUrl` | – | `status/v1/summary.json` endpoint (absolute http(s), or site-relative for self-served snapshots) |
| `dataPath` | `status-data` | Local directory holding `status/v1` at build time (private repos / CI checkouts) |
| `title`, `description` | `System Status`, … | Page header |
| `entities` | `[]` | Display metadata (`{name, displayName?, description?}`) layered onto the data plane's entities |
| `showServices` / `showIncidents` / `showPerformanceMetrics` | `true` | Section toggles |
| `statusView` | `default` | `default` board or `upptime` structured layout |
| `statusCardLayout` | `minimal` | `minimal` cards with uptime bars, or `detailed` |
| `systemSLOs`, `defaultSLO` | `{}`, `99.9` | SLO targets for the SLI chart |
| `owner`, `repo` | site org/project | Issue-link base |

Monitoring configuration (what to check, how often, incident labels)
lives in **`stentorosaur.config.js`**, consumed by the probe CLI — not
in the plugin options.

## Incident tracking

Open a GitHub issue with the `status` label plus entity labels
(`system:api` or plain `api`) and a severity label
(`critical`/`major`/`minor`). The `status-update-v1.yml` workflow
converts issues to incidents on the data branch; incident bodies are
rendered to sanitized HTML **at write time** (raw markdown is retained
under `status/v1/raw/` for re-rendering after sanitizer updates).

Maintenance windows are issues with a `maintenance` label and a
frontmatter block:

```markdown
---
start: @tomorrow 2am UTC
end: @tomorrow 4am UTC
---
Database migration. API in read-only mode.
```

## Notifications

v1.0 has no built-in email/webhook notifier (see ADR-005 §11). The
substitute is the **`status/v1/incidents.atom`** feed published with the
data — point mail bridges, Slack RSS apps, or Zapier at it. GitHub
watchers of the status repo still get issue notifications natively.

## Private repos

Public data endpoints are the design center. For private repos, check
the data branch out in CI (e.g. `actions/checkout` with `ref:
status-data, path: status-data`) and build with the local snapshot via
`dataPath` — the page renders the build-time snapshot without a live
refresh endpoint.

## Versioning and support

- **v1.x** — active development.
- **v0.22-maintenance** branch — critical fixes only for 90 days after
  the v1.0.0 release. Pin `~0.22` if you cannot cut over yet.

## Development

This package lives in a monorepo with `@stentorosaur/core` (pure
schemas + aggregation) and `@stentorosaur/probe` (checks, git writes,
the CLI).

```bash
npm run build        # all workspaces
npm test             # jest suites per package
npm run test:e2e     # real pipeline → fixture site → Playwright DOM
```

MIT © Amiable Development
