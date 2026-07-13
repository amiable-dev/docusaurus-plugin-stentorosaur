# Monitoring Workflow Templates

This directory contains GitHub Actions workflow templates for monitoring your services and updating your status page.

## Architecture Overview

The optimized architecture decouples **data collection** from **site builds**, enabling 5-minute monitoring at low cost:

```
┌─────────────────────────────────────────────────────────────────┐
│  DATA COLLECTION (every 5 min via monitor-systems.yml)          │
│  ─────────────────────────────────────────────────────────────  │
│  1. Health checks → current.json, archives/                     │
│  2. Issue sync → incidents.json, maintenance.json               │
│  3. Commit to status-data branch                                │
│  4. Critical incidents trigger immediate deployment             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  DATA DISPLAY (runtime fetch - $0 GitHub Actions cost)          │
│  ─────────────────────────────────────────────────────────────  │
│  Browser fetches current.json from raw.githubusercontent.com    │
│  (Configure fetchUrl in plugin options for live data)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SITE BUILD (only on content changes to main)                   │
│  ─────────────────────────────────────────────────────────────  │
│  Triggers: push to main, critical incidents, manual dispatch    │
└─────────────────────────────────────────────────────────────────┘
```

## Required Workflows

### 1. `monitor-systems.yml` - Status Monitor

**This single workflow handles all status monitoring needs:**

- **Schedule**: Every 5 minutes (configurable)
- **Also triggers on**: Issue events (opened, closed, labeled, edited)
- **Functions**:
  1. Health checks for all configured endpoints
  2. Syncs GitHub Issues to incidents.json and maintenance.json
  3. Creates/closes issues for automatic downtime detection
  4. Sends notifications (if configured)
  5. Triggers immediate deployment for critical incidents

**Configuration Required:**

1. Create `.monitorrc.json` in your repository root:

```json
{
  "systems": [
    {"system": "api", "url": "https://api.example.com/health"},
    {"system": "website", "url": "https://example.com"}
  ]
}
```

2. Ensure URLs are valid and publicly accessible

### 2. `deploy.yml` - Deployment

Builds and deploys your status page.

**Triggers:**
- Push to `main` branch (code/content changes)
- `repository_dispatch: status-updated` (critical incidents)
- Manual `workflow_dispatch`

**Does NOT trigger on:**
- Monitoring workflow file changes (paths-ignore)

## Optional Workflow

### `compress-archives.yml` (Recommended)

Compresses old JSONL archive files daily to save repository space.

- **Schedule**: Daily at 00:05 UTC
- **Action**: Gzips yesterday's JSONL file
- **Benefit**: Reduces repository size over time

## Deleted Workflows (v0.15.0+)

These workflows are no longer needed and have been removed:

| Workflow | Reason |
|----------|--------|
| `status-update.yml` | Merged into `monitor-systems.yml` |
| `deploy-scheduled.yml` | Not needed with runtime data fetching |
| `calculate-metrics.yml` | Deprecated - metrics included in `current.json` |

## Runtime Data Fetching

For live status updates without rebuilding the site, configure `fetchUrl` in your plugin options:

```javascript
// docusaurus.config.js
plugins: [
  [
    '@amiable-dev/docusaurus-plugin-stentorosaur',
    {
      owner: 'your-org',
      repo: 'your-repo',
      entities: [...],
      // Enable runtime fetch for live data
      fetchUrl: 'https://raw.githubusercontent.com/your-org/your-repo/status-data',
    },
  ],
],
```

With `fetchUrl` configured:
- Status page fetches live data on each page view
- No site rebuild needed for status updates
- 5-minute monitoring updates appear immediately
- Site only rebuilds for content changes or critical incidents

## Three-File Data Architecture

| File | Purpose | Updated By | Frequency |
|------|---------|------------|-----------|
| `current.json` | Time-series monitoring data (14-day window) | Health checks | Every 5 min |
| `incidents.json` | Active/resolved incidents from GitHub Issues | Issue sync | On change + 5 min |
| `maintenance.json` | Scheduled maintenance windows | Issue sync | On change + 5 min |

## Setup Checklist

1. [ ] Copy workflow files to `.github/workflows/`:
   ```bash
   mkdir -p .github/workflows
   cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/monitor-systems.yml .github/workflows/
   cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/deploy.yml .github/workflows/
   cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/compress-archives.yml .github/workflows/
   ```

2. [ ] Create `.monitorrc.json` with your endpoints

3. [ ] Create the orphaned status-data branch:
   ```bash
   npm run setup-status-branch
   ```

4. [ ] Configure `fetchUrl` in `docusaurus.config.js` for live data

5. [ ] Commit and push workflows

6. [ ] Verify first workflow run succeeds

## Troubleshooting

### "Website is down" false alerts
- Check that URLs are valid and publicly accessible
- Invalid URLs (like `localhost`) always fail from GitHub Actions

### No data on status page
- Verify workflows are running (check Actions tab)
- Ensure `status-data` branch exists
- Check that `fetchUrl` is configured correctly
- Look for fetch errors in browser console

### Stale data
- If using runtime fetch: Check network tab for successful JSON fetch
- Verify monitoring commits are appearing on status-data branch
- Ensure no caching issues with raw.githubusercontent.com

## Migration from Previous Versions

If upgrading from v0.14.x or earlier:

1. Delete deprecated workflow files from your `.github/workflows/`:
   - `status-update.yml`
   - `deploy-scheduled.yml`
   - `calculate-metrics.yml`

2. Copy the new consolidated `monitor-systems.yml`

3. Add `fetchUrl` to plugin config for live data

4. Remove hourly deploy schedule (no longer needed)

## Need Help?

- Check the [main documentation](../../README.md)
- Review workflow logs in GitHub Actions tab
- Open an issue: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues

---

## status/v1 templates (ADR-005 — plugin >= 0.22)

> ⚠️ The `*-v1.yml` templates target the ADR-005 architecture and the
> `stentorosaur` unified CLI shipping with plugin **0.22**. Do not
> install `probe-v1.yml` / `status-update-v1.yml` against an older
> release — `compact-data-branch-v1.yml` and `deploy-v1.yml` are pure
> git/Pages and work with any version.

| Template | Trigger | Purpose |
|---|---|---|
| `probe-v1.yml` | every 5 min | parallel checks → per-entity files + JSONL archives → regenerate `summary.json` → push (§5 retry) |
| `status-update-v1.yml` | issue events | issues → incident/maintenance inputs + `raw/` provenance → regenerate → push |
| `compact-data-branch-v1.yml` | monthly | orphan-reset the data branch to 1 commit, tree byte-identical (§10; the one sanctioned force-push, leased) |
| `deploy-v1.yml` | push to main | docs deploy WITHOUT paths-ignore/[skip ci]/hourly-schedule gymnastics — status never redeploys the site |
| `probe-dispatch-v1.yml` | `repository_dispatch` | receive Worker readings → schema-validate → `stentorosaur ingest` → push (§5 retry) |

### Serving the data branch (ADR-005 §3)

GitHub Pages is the primary endpoint for `status/v1/summary.json`
(correct `application/json`, predictable `max-age=600` caching):

1. Create the `status-data` branch (bootstrap: `stentorosaur init`, or
   `git switch --orphan status-data && git commit --allow-empty -m init && git push -u origin status-data`).
2. If the docs site does NOT use Pages: repo Settings → Pages → Deploy
   from branch → `status-data` / root. Point the plugin's `dataUrl` at
   `https://<user>.github.io/<repo>/status/v1/summary.json`.
3. If the docs site DOES use Pages: serve the data branch from a small
   sibling repo, or keep `raw.githubusercontent.com/<owner>/<repo>/status-data/status/v1/summary.json`
   as the (fallback-quality) endpoint — undocumented cache (~5 min) and
   `text/plain`, tolerated by the client's content-type-agnostic parser.

Honest propagation bound: one CDN TTL (≤ ~10 min) from issue event to
client — not seconds, and dramatically better than redeploy-on-change.

### Workflow concurrency

All data-branch writers share `concurrency: status-data-writer`
so same-workflow runs serialize; cross-workflow races are handled by the
§5 regenerate-and-retry rule in the writer itself.

### Cloudflare Worker probe (ADR-005 §6, optional graduation path)

For sub-5-minute resolution without burning Actions minutes on the
checks themselves, run the probe as a Cloudflare Worker
(`../worker/wrangler.toml` + `worker.mjs`).

**Trust model (council condition):** the Worker never writes to git. It
runs the checks and sends a `repository_dispatch` event with the
readings; `probe-dispatch-v1.yml` validates the payload against the
schema (`stentorosaur ingest` rejects malformed payloads and unknown
entities without writing) and commits with its ephemeral
`GITHUB_TOKEN`.

Setup:

1. Install `probe-dispatch-v1.yml` in `.github/workflows/` and REMOVE
   the `schedule:` trigger from `probe-v1.yml` (one prober per entity —
   ingest appends readings, so double-probing doubles check counts).
2. Create the dispatch token: GitHub → Settings → Developer settings →
   Fine-grained personal access tokens → scope it to **only the status
   repo** with **Contents: Read and write** (the minimum GitHub
   requires for the `dispatches` endpoint) and nothing else. The Worker
   code only ever calls `POST /repos/{owner}/{repo}/dispatches`; the
   receiving Action is what writes, and a leaked token is revocable and
   confined to this one repo.
3. Copy `templates/worker/` into a Worker project,
   `npm i @stentorosaur/probe`, fill in `[vars]`, then
   `wrangler secret put GITHUB_TOKEN` and `wrangler deploy`.

**Quota math:** each dispatch triggers one ingest workflow run
(~30–60 s). At `*/5` cron that is ~288 runs/day ≈ 150–300 Actions
minutes/month — comparable to the Actions-cron probe it replaces, but
the checks themselves (and their 1-minute upper bound on resolution)
are free on the Workers side (100k invocations/day free tier vs 1,440
used at 1-minute cron). At `* * * * *` expect ~5× the Actions usage of
the 5-minute default; public repos get Actions minutes free, private
repos should do the math against their plan.

**Opt-in alternative — direct write:** a Worker holding a fine-grained
PAT (data repo only, Contents read/write) may push readings itself,
skipping dispatch+Action entirely. This trades the ephemeral-token
model for a long-lived write credential in Worker secrets — acceptable
for some, but not the default (ADR-005 §6). If you choose it, reuse the
same token scope as step 2 and write via `stentorosaur probe` in any
git-capable runtime instead of the Worker.
