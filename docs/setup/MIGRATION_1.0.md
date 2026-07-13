# Migrating to v1.0 (ADR-005)

v1.0 is a **hard cutover** (ADR-005 Migration Phase 1): the legacy data
paths, notification system, chart.js charts, and the nine per-task bin
scripts are deleted in the same release the new architecture lands.
There is no dual-write or compatibility mode — that duplication is the
defect class ADR-005 exists to remove.

**Your history is not reset.** The one-time `stentorosaur migrate`
command converts every legacy data generation (`current.json`,
`daily-summary.json`, `systems/*.json`, `archives/**`) into `status/v1/`
files with day-level uptime and latency preserved exactly (verified by a
golden test over 90 days of data).

## TL;DR

```bash
# 1. Upgrade (plugin + the new CLI)
npm install @amiable-dev/docusaurus-plugin-stentorosaur@^1.0.0
npm install -D @stentorosaur/probe

# 2. Convert config (.monitorrc.json → stentorosaur.config.js)
npx stentorosaur migrate            # first run converts config, then stops
# …fill in owner/repo in stentorosaur.config.js…

# 3. Preview, then migrate the historical data onto the data branch
npx stentorosaur migrate --dry-run  # prints the exact file plan, writes nothing
npx stentorosaur migrate            # converts + pushes to the status-data branch

# 4. Verify
npx stentorosaur doctor
```

Then update `docusaurus.config.js` (see below), install the v1 workflow
templates, serve the data branch, and delete the legacy workflows.

## Plugin options: before → after

```js
// v1.0 plugin options — display concerns + the data endpoint only
[
  '@amiable-dev/docusaurus-plugin-stentorosaur',
  {
    title: 'System Status',
    // Where the client (and the build) reads status/v1/summary.json:
    dataUrl: 'https://<user>.github.io/<repo>/status/v1/summary.json',
    // Optional display metadata layered onto the data plane's entities:
    entities: [{name: 'api', displayName: 'API', description: 'Public API'}],
  },
]
```

Removed options (build fails loudly if present): `token`, `useDemoData`,
`entitiesSource`, `labelScheme`, `statusLabel`, `scheduledMaintenance`,
`sites`, `fetchUrl`, `dataSource`, `updateInterval`,
`showResponseTimes`, `showUptime`. Monitoring configuration lives in
`stentorosaur.config.js` (consumed by the probe CLI); the plugin only
renders.

## Workflows

Replace the legacy workflows with the v1 templates from
`templates/workflows/` (see the README there for details):

| Delete | Install |
|---|---|
| `monitor-systems.yml` | `probe-v1.yml` (or the Cloudflare Worker + `probe-dispatch-v1.yml`) |
| `status-update.yml` | `status-update-v1.yml` |
| `deploy.yml` path-filter gymnastics | `deploy-v1.yml` |
| — | `compact-data-branch-v1.yml` (monthly history compaction) |

Status data lives on the `status-data` branch and is served via GitHub
Pages (or `raw.githubusercontent.com` as a fallback) — status updates no
longer redeploy your site.

## Notifications are gone (honestly)

v1.0 removes `src/notifications/` and nodemailer (ADR-005 §11). GitHub
issue subscriptions still notify repo watchers, but end-customers
without GitHub accounts lose email notifications. The substitute is the
**`status/v1/incidents.atom`** feed published on the data branch —
consumable by mail bridges, Slack RSS apps, and Zapier-class tools.
Direct email/webhook notification is deferred to a separate optional
package, not silently abandoned.

## v0.22 maintenance policy

The `v0.22-maintenance` branch receives **critical fixes only for 90
days** after the v1.0.0 release. No new features land there. Pin
`@amiable-dev/docusaurus-plugin-stentorosaur@~0.22` if you cannot cut
over yet.

## Edge cases `stentorosaur migrate` handles

- **Pre-0.17 sites** (no `daily-summary.json`): migrated from archives
  and `current.json` alone.
- **Pruned archives**: days covered only by `daily-summary.json` are
  synthesized as readings that reproduce the recorded uptime/latency
  exactly under the v1 aggregation.
- **Ghost entities** (data for systems not in your config, the #62
  shape): preserved in the archives, excluded from the rendered summary,
  and reported in the migration output.
- **Corrupt JSONL lines**: skipped and counted, never fatal.
- **Idempotent**: re-running after a partial failure converges; legacy
  files are never modified or deleted — remove `status-data/` legacy
  files yourself after verifying the site renders.
