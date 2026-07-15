# Quick Start (v1)

A live status page in your Docusaurus site in ~10 minutes. Upgrading
from 0.x instead? → [MIGRATION_1.0](./docs/setup/MIGRATION_1.0.md).

## 1. Install

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur
npm install -D @stentorosaur/probe
```

## 2. Configure monitoring

```bash
npx stentorosaur init
```

This scaffolds `stentorosaur.config.js` — fill in `owner`, `repo`, and
your `entities` (see the
[configuration reference](./docs/reference/CONFIGURATION.md)).

## 3. Create the data branch and first readings

```bash
git switch --orphan status-data
git commit --allow-empty -m init
git push -u origin status-data
git switch -

npx stentorosaur probe     # first checks → status/v1 on the data branch
npx stentorosaur doctor    # verify config + data plane health
```

## 4. Serve the data

**Public repo (recommended):** repo Settings → Pages → Deploy from
branch → `status-data` / root. Your data endpoint is
`https://<user>.github.io/<repo>/status/v1/summary.json`.

**Private repo:** skip Pages; your deploy workflow checks the data
branch out into `./status-data` before building (see
[CONFIGURATION → Data endpoint patterns](./docs/reference/CONFIGURATION.md#data-endpoint-patterns)).

## 5. Add the plugin to Docusaurus

```js
// docusaurus.config.js
plugins: [
  [
    '@amiable-dev/docusaurus-plugin-stentorosaur',
    {
      title: 'System Status',
      dataUrl: 'https://<user>.github.io/<repo>/status/v1/summary.json',
    },
  ],
],
```

Visit `/status` — the page renders the build-time snapshot instantly
and refreshes live from `dataUrl` without redeploys.

## 6. Automate

Copy the workflow templates from
`node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/`
into `.github/workflows/`:

- `probe-v1.yml` — checks every 5 minutes
- `status-update-v1.yml` — GitHub issues → incidents
- `compact-data-branch-v1.yml` — monthly history compaction

## 7. Report an incident

Open a GitHub issue labeled `status` + an entity label (`api`) + a
severity (`critical` | `major` | `minor`). It appears on the status
page within one data-refresh cycle — no deploy. Close the issue to
resolve it.

## Where to next

- [Configuration reference](./docs/reference/CONFIGURATION.md)
- [The data plane & CLI](./docs/reference/DATA_PLANE.md)
- [Notifications (atom feed)](./docs/reference/NOTIFICATIONS.md)
- [Workflow templates & Cloudflare Worker probe](./packages/docusaurus-plugin-stentorosaur/templates/workflows/README.md)
