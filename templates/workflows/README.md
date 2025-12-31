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
