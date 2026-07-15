# Configuration Reference (v1)

v1 splits configuration in two, by consumer:

| File | Consumed by | Concerns |
|---|---|---|
| `stentorosaur.config.js` (site root) | the `stentorosaur` CLI (probe, issue sync, migrate) | **what to monitor and where data lives** |
| plugin options in `docusaurus.config.js` | this Docusaurus plugin | **display only** + the data endpoint |

Legacy 0.x plugin options (`token`, `useDemoData`, `entitiesSource`,
`statusLabel`, `scheduledMaintenance`, `sites`, `fetchUrl`,
`dataSource`, `updateInterval`) were removed at v1.0 and now fail
validation loudly. See
[MIGRATION_1.0](../setup/MIGRATION_1.0.md).

## `stentorosaur.config.js`

Created by `npx stentorosaur init`, or converted from a legacy
`.monitorrc.json` by `npx stentorosaur migrate`. TypeScript works too
(`stentorosaur.config.ts` with `defineConfig` from
`@stentorosaur/core`).

```js
/** @type {import('@stentorosaur/core').StentorosaurConfigInput} */
module.exports = {
  owner: 'your-org',            // required — GitHub owner of the status repo
  repo: 'your-repo',            // required — GitHub repo (issues + data branch)
  dataBranch: 'status-data',    // default

  entities: [                   // required, at least one
    {
      name: 'api',              // canonical id (slugged for file names)
      type: 'system',           // 'system' | 'process'
      displayName: 'API',       // optional
      description: '…',         // optional
      probe: {                  // present → the probe checks it;
        url: 'https://api.example.com/health', //   absent → issue-tracked only
        method: 'GET',          // GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS
        timeout: 10000,         // ms
        expectedCodes: [200],   // any other code → down
        maxResponseTime: 30000, // ms — slower → degraded
      },
    },
    {name: 'onboarding', type: 'process'},
  ],

  incidents: {
    statusLabel: 'status',            // default — label that marks status issues
    maintenanceLabels: ['maintenance'], // default
  },

  site: {
    title: 'System Status',     // default — used in the atom feed
    url: 'https://example.com', // optional — atom feed link base
  },

  labelScheme: {                // optional — issue label parsing
    separator: ':',             // 'system:api' style namespaced labels
    defaultType: 'system',      // type for un-namespaced labels
    allowUntyped: true,
  },
};
```

### `dataPlane` (optional — ADR-006 Profile C)

Absent means the git data branch (Profiles A/B) exactly as documented
above. Opting into the R2 object-storage profile:

```js
// absent → the whole block defaults to {kind: 'git'}
dataPlane: {
  kind: 'r2',
  bucket: 'status',
  endpoint: 'https://<account>.r2.cloudflarestorage.com', // S3 API (CLI writes)
  publicBaseUrl: 'https://status.example.com',            // what dataUrl points at (https only)
},
```

All three r2 fields are required together; extra fields on the git
profile are rejected (typos fail loudly instead of silently keeping
git). **Budget** (ADR-006 §1): class-A writes/month ≈
`runs_per_day × (N_entities + 3) × 30` — at 5-min cadence with 10
entities ≈ 112k (11% of R2's 1M free tier); 1-min cadence with 25
entities breaches it, which is why unchanged entity details are
skipped by content hash. Serve `publicBaseUrl` behind a Cloudflare
custom domain, never bare workers.dev (ADR-006 §2).

Validate any time with `npx stentorosaur doctor`.

## Plugin options (`docusaurus.config.js`)

```js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {/* options */}],
],
```

| Option | Default | Purpose |
|---|---|---|
| `dataUrl` | – | `status/v1/summary.json` endpoint. Absolute `http(s)` URLs are fetched at build time (SSG snapshot) **and** polled by the client; site-relative paths (`/…`) are client-only (self-served snapshot). |
| `dataPath` | `'status-data'` | Local directory containing `status/v1/` at build time — used when `dataUrl` is unset/unreachable. Private repos check the data branch out here in CI (ADR-005 §9). |
| `title` / `description` | `'System Status'` / … | Page header. |
| `entities` | `[]` | Display metadata (`{name, displayName?, description?}`) layered onto the data plane's entities. `name` must match the config entity name. |
| `showServices` | `true` | Status board section. |
| `showIncidents` | `true` | Incident history section. |
| `showPerformanceMetrics` | `true` | Charts on card expand + history pages. |
| `systemSLOs` | `{}` | Per-system SLO targets (%) for the SLI chart. |
| `defaultSLO` | `99.9` | Fallback SLO target. |
| `statusView` | `'default'` | `'default'` board or `'upptime'` structured layout. |
| `statusCardLayout` | `'minimal'` | `'minimal'` cards with uptime bars, or `'detailed'`. |
| `uptimeConfig` | all sections on | Section toggles/titles for the `'upptime'` view. |
| `owner` / `repo` | site `organizationName`/`projectName` | Base for incident issue links. |

## Routes

- `/status` — the dashboard
- `/status/history/<entity-slug>` — per-entity charts (data from
  `status/v1/entities/<slug>.json`)

## Data endpoint patterns

- **Public repo, Pages-served data branch** (the design center):
  `dataUrl: 'https://<user>.github.io/<repo>/status/v1/summary.json'` —
  clients see updates within one CDN TTL, no site redeploys.
- **Public repo, raw fallback**:
  `https://raw.githubusercontent.com/<owner>/<repo>/<dataBranch>/status/v1/summary.json`
  (~5 min undocumented cache, `text/plain` — tolerated by the client).
- **Private repo**: no public endpoint exists. Check the data branch out
  under `dataPath` in the deploy workflow; the plugin embeds the
  snapshot and republishes `status/v1/` with the site, so clients
  refresh from the site's own copy (fresh per deploy).
