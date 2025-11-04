# Monitoring Workflow Templates

This directory contains GitHub Actions workflow templates for monitoring your services and updating your status page.

## Required Workflows

These workflows are **required** for a functioning status page:

### 1. `monitor-systems.yml` ⭐ REQUIRED

Monitors your endpoints and records response times using **sequential monitoring** (v0.4.10+).

- **Schedule**: Every 5 minutes
- **Creates**: `status-data/current.json` and `status-data/archives/YYYY/MM/history-YYYY-MM-DD.jsonl`
- **Action**: Makes HTTP requests to your endpoints sequentially, records status and response time
- **Commits**: Single commit with all systems' data (e.g., "Update monitoring data [skip ci]")
- **Important**: Uses `status-data/` directory (NOT in `build/`) to ensure Git tracks the monitoring data

**Configuration Required:**

1. **Create `.monitorrc.json`** in your repository root:

```json
{
  "systems": [
    {"system": "api", "url": "https://api.example.com/health"},
    {"system": "website", "url": "https://example.com"}
  ]
}
```

2. **Verify URLs are valid and publicly accessible**
   - Invalid URLs (like `null.example.com` or `localhost`) will always fail
   - Private/internal URLs are not accessible from GitHub Actions runners

**Why Sequential Monitoring?**

- ✅ **Zero data loss** - All systems captured in single commit
- ✅ **No race conditions** - Only one git push operation
- ✅ **No merge conflicts** - Single job eliminates concurrent operations
- ✅ **Scales reliably** - Works with 10+ systems without data loss
- ⚠️ **Trade-off**: ~5s per system (but guarantees 100% data capture)

### 2. `status-update.yml` ⭐ REQUIRED

Syncs GitHub Issues to status page (for incident tracking).

- **Schedule**: Every hour (plus on issue changes and code pushes)
- **Creates**: `status-data/status.json` and `status-data/summary.json`
- **Action**: Fetches issues labeled with "status" and configured system labels
- **Environment**: Requires `GITHUB_TOKEN` (automatically provided by GitHub Actions)

**Configuration Required:**
- Ensure your `docusaurus.config.js` has correct `owner` and `repo` settings
- Configure system labels in plugin options if using custom labels

### 3. `deploy.yml` or `deploy-scheduled.yml` ⭐ REQUIRED (choose one)

Builds and deploys your status page with updated data.

- **deploy.yml**: Triggers on code pushes (immediate deployment)
- **deploy-scheduled.yml**: Runs daily (delayed deployment, saves Actions minutes)

**Choose based on your needs:**
- Want instant status updates? Use `deploy.yml`
- OK with daily updates? Use `deploy-scheduled.yml` (recommended)

## Optional Workflows

### `compress-archives.yml` (Recommended)

Compresses old JSONL archive files to save space.

- **Schedule**: Daily
- **Action**: Finds yesterday's JSONL file and gzips it
- **Benefit**: Reduces repository size over time

### `calculate-metrics.yml` ⚠️ DEPRECATED

**Do NOT use this workflow for new installations!**

This workflow is for the legacy data format only (systems/*.json files). The new monitoring system (`monitor-systems.yml`) already includes all metrics in `current.json`.

**Only enable this if:**

1. You have existing `build/status-data/systems/*.json` files from a legacy setup
2. You are NOT using the `stentorosaur-monitor` script
3. You want to calculate metrics from git commit history

For new installations, **delete this file** or leave it disabled.

## Data Flow Architecture

Here's how the workflows work together:

```
┌──────────────────────────────────────────────────────────────┐
│  Every 5 minutes: monitor-systems.yml                        │
│  ┌────────────┐      ┌─────────────┐                         │
│  │ Check URLs │─────>│ Record Data │─────> Git Commit        │
│  └────────────┘      └─────────────┘                         │
│                             │                                 │
│                             v                                 │
│                   status-data/                                │
│                   ├─ current.json (14-day rolling window)    │
│                   └─ archives/YYYY/MM/                        │
│                      └─ history-YYYY-MM-DD.jsonl              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Every hour: status-update.yml                               │
│  ┌─────────────────┐      ┌──────────────┐                   │
│  │ Fetch GH Issues │─────>│ Process Data │─────> No Commit   │
│  └─────────────────┘      └──────────────┘                   │
│  (labels: status, ...)           │                            │
│                                  v                            │
│                         status-data/                          │
│                         ├─ status.json (full data)            │
│                         └─ summary.json (systems overview)    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Daily (or on push): deploy.yml / deploy-scheduled.yml       │
│  ┌───────────┐     ┌───────────┐     ┌──────────────┐       │
│  │ Build Site│────>│ Bundle All│────>│ Deploy Pages │       │
│  └───────────┘     │    Data   │     └──────────────┘       │
│                    └───────────┘                             │
│                         │                                     │
│                         v                                     │
│              Includes all *.json files                        │
│              from status-data/ → build/status-data/           │
└──────────────────────────────────────────────────────────────┘
```

## Setup Checklist

When setting up monitoring for the first time:

- [ ] Copy workflow files to `.github/workflows/`
- [ ] Edit `monitor-systems.yml` - replace example URLs with your actual endpoints
- [ ] Verify URLs are publicly accessible (test in browser or with `curl`)
- [ ] Ensure `docusaurus.config.js` has correct repo settings
- [ ] Choose deployment strategy: `deploy.yml` OR `deploy-scheduled.yml`
- [ ] (Optional) Enable `compress-archives.yml` to save space
- [ ] Delete or disable `calculate-metrics.yml` (not needed for new format)
- [ ] Commit and push workflows
- [ ] Verify first workflow run succeeds
- [ ] Check that `status-data/` is being populated and commits are being made
- [ ] Ensure `status-data/` is NOT in `.gitignore`

## Troubleshooting

### "Website is down" false alerts

- Check that URLs in `monitor-systems.yml` are valid and publicly accessible
- Invalid URLs (like `null.example.com` or `localhost`) will always fail
- Private/internal URLs are not accessible from GitHub Actions runners

### No data appearing on status page

- Verify workflows are running (check Actions tab)
- Check that `status-data/` directory exists and has data files
- **CRITICAL**: Ensure `status-data/` is NOT in `.gitignore`
- Verify monitoring commits are appearing in Git history (every 5 minutes)
- Ensure deployment workflow includes status data in build
- Check browser console for fetch errors

### Status showing stale data

- Verify `status-update.yml` is running regularly
- Check that GitHub Issues have correct labels
- Ensure `GITHUB_TOKEN` is available (should be automatic)

### Metrics not calculating

- If using new format (current.json): Metrics are already included, no action needed
- If using legacy format (systems/*.json): Enable `calculate-metrics.yml`
- Don't mix formats - use one or the other

## Migration from Legacy Format

If you have existing `systems/*.json` files:

1. Keep both formats temporarily for comparison
2. Run `monitor-systems.yml` to start collecting new format data
3. Compare data accuracy over a few days
4. Once satisfied, disable `calculate-metrics.yml`
5. Clean up old `systems/*.json` files

## Need Help?

- Check the [main documentation](../../README.md)
- Review workflow logs in GitHub Actions tab
- Open an issue: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues
