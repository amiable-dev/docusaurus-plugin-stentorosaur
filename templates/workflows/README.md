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

Syncs GitHub Issues to status page (for incident tracking) and generates incidents/maintenance data files.

- **Triggers**: 
  - On issue events (opened, closed, labeled, edited)
  - Hourly schedule
  - Manual workflow_dispatch
- **Creates**: `status-data/incidents.json` and `status-data/maintenance.json`
- **Action**: 
  - Fetches issues labeled with "status" and configured system labels
  - Generates `incidents.json` from issues with `status` label
  - Generates `maintenance.json` from issues with `maintenance` label
  - Triggers `repository_dispatch` event for critical incidents (immediate deployment)
- **Environment**: Requires `GITHUB_TOKEN` (automatically provided by GitHub Actions)
- **CLI Command**: `npx stentorosaur-update-status --write-incidents --write-maintenance`

**Configuration Required:**
- Ensure your `docusaurus.config.js` has correct `owner` and `repo` settings
- Configure system labels in plugin options if using custom labels

**Smart Deployment (v0.4.13+):**
- Critical incidents trigger `repository_dispatch` → immediate deployment (~2 min)
- Non-critical incidents wait for hourly scheduled deployment
- Uses `[skip ci]` tag to avoid duplicate deployments

### 3. `deploy.yml` or `deploy-scheduled.yml` ⭐ REQUIRED (use BOTH)

Builds and deploys your status page with updated data.

**deploy.yml** - Immediate deployments:
- **Triggers**:
  - Push to `main` branch (code changes)
  - `repository_dispatch` event type `status-updated` (critical incidents)
  - Manual `workflow_dispatch`
- **Path Filtering (v0.4.13+)**:
  - Ignores `status-data/current.json` (monitoring data)
  - Ignores `status-data/archives/**` (historical archives)
- **Result**: Critical incidents deploy within ~2 minutes

**deploy-scheduled.yml** - Scheduled deployments:
- **Triggers**: Hourly cron schedule (configurable)
- **Purpose**: Pick up non-critical incident updates and maintenance changes
- **Result**: Non-critical updates deploy within 1 hour

**Why Both?**
- `deploy.yml` provides instant response to critical incidents
- `deploy-scheduled.yml` ensures regular updates without excessive Actions usage
- Monitoring commits (every 5 min) don't trigger any deployments (paths-ignore)

**Recommended Setup:**
```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/deploy.yml .github/workflows/
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/deploy-scheduled.yml .github/workflows/
```

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

Here's how the workflows work together to provide real-time monitoring with smart deployments:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MONITORING (Every 5 minutes): monitor-systems.yml                       │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐      ┌─────────────────┐      ┌─────────────────────┐   │
│  │ Check URLs │─────>│ Record to JSONL │─────>│ Rebuild current.json│   │
│  │(Sequential)│      │   (Append-only) │      │  (14-day window)    │   │
│  └────────────┘      └─────────────────┘      └─────────────────────┘   │
│                              │                           │               │
│                              v                           v               │
│                   archives/YYYY/MM/            status-data/              │
│                   history-YYYY-MM-DD.jsonl     current.json              │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Git Commit: "Update monitoring data [skip ci]"                   │   │
│  │ → Does NOT trigger deployment (paths-ignore in deploy.yml)       │   │
│  │ → If critical failure: Creates GitHub Issue                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  INCIDENT TRACKING (On issue events + hourly): status-update.yml         │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌──────────────────────────────────────┐      │
│  │ Fetch GH Issues │─────>│ Generate incidents.json              │      │
│  │ (status labels) │      │ Generate maintenance.json            │      │
│  └─────────────────┘      └──────────────────────────────────────┘      │
│                                           │                              │
│                                           v                              │
│                                  status-data/                            │
│                                  ├─ incidents.json                       │
│                                  └─ maintenance.json                     │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Git Commit: "Update status data [skip ci]"                       │   │
│  │ → If CRITICAL incident: Trigger repository_dispatch              │   │
│  │   → deploy.yml runs IMMEDIATELY (~2 min)                         │   │
│  │ → If non-critical: Wait for hourly deploy-scheduled.yml          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT: deploy.yml + deploy-scheduled.yml                           │
├──────────────────────────────────────────────────────────────────────────┤
│  deploy.yml (IMMEDIATE):                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Triggers:                                                        │    │
│  │   • Push to main (code changes)                                 │    │
│  │   • repository_dispatch: status-updated (critical incidents)    │    │
│  │   • workflow_dispatch (manual)                                  │    │
│  │                                                                  │    │
│  │ Filters (paths-ignore):                                         │    │
│  │   • status-data/current.json → IGNORED                          │    │
│  │   • status-data/archives/** → IGNORED                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  deploy-scheduled.yml (HOURLY):                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Triggers: Hourly cron schedule                                  │    │
│  │ Purpose: Pick up non-critical updates                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  ┌───────────┐     ┌─────────────────────┐     ┌──────────────┐         │
│  │ Build Site│────>│ Read all 3 files:   │────>│ Deploy Pages │         │
│  └───────────┘     │ • current.json      │     └──────────────┘         │
│                    │ • incidents.json    │                               │
│                    │ • maintenance.json  │                               │
│                    └─────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Three-File Data Architecture (v0.4.11+)

The plugin uses three separate data files for optimal performance and smart deployments:

| File | Purpose | Updated By | Frequency | Triggers Deployment? |
|------|---------|------------|-----------|---------------------|
| `current.json` | Time-series monitoring data (14-day rolling window) | `monitor-systems.yml` | Every 5 min | ❌ No (paths-ignore) |
| `incidents.json` | Active and resolved incidents from GitHub Issues | `status-update.yml` | On issue events + hourly | ⚡ Yes if critical |
| `maintenance.json` | Scheduled maintenance windows | `status-update.yml` | On issue events + hourly | ⏰ Hourly deploy |

**Smart Deployment Logic:**
- 🚨 **Critical incidents** → `repository_dispatch` → deploy.yml → **~2 minute deployment**
- 📋 **Non-critical incidents** → Waits for deploy-scheduled.yml → **~1 hour deployment**
- 📊 **Monitoring data** → paths-ignore filter → **No deployment triggered**

### Data Flow Summary

| Event | Workflow | Files Updated | Deployment | Latency |
|-------|----------|---------------|------------|---------|
| Endpoint check (every 5m) | `monitor-systems.yml` | `current.json` | None | N/A |
| Critical endpoint down | `monitor-systems.yml` | `current.json` + creates Issue | Via `status-update.yml` → `deploy.yml` | ~2 min |
| Issue opened/closed | `status-update.yml` | `incidents.json`, `maintenance.json` | `deploy.yml` if critical, else hourly | 2 min / 1 hour |
| Hourly check | `status-update.yml` | `incidents.json`, `maintenance.json` | `deploy-scheduled.yml` | 1 hour |
| Code push to main | N/A | N/A | `deploy.yml` | ~5 min |

## Setup Checklist

When setting up monitoring for the first time:

- [ ] Copy workflow files to `.github/workflows/`
- [ ] Create `.monitorrc.json` in repository root with your endpoints
- [ ] Edit `monitor-systems.yml` if needed (defaults work for most cases)
- [ ] Verify URLs are publicly accessible (test in browser or with `curl`)
- [ ] Ensure `docusaurus.config.js` has correct repo settings
- [ ] Copy BOTH deployment workflows: `deploy.yml` AND `deploy-scheduled.yml`
- [ ] Configure `entities` in plugin config (v0.11.0+) to define tracked items
- [ ] (Optional) Enable `compress-archives.yml` to save space
- [ ] Delete or disable `calculate-metrics.yml` (deprecated, not needed)
- [ ] Commit and push workflows
- [ ] Verify first workflow run succeeds
- [ ] Check that `status-data/` is being populated with 3 files:
  - [ ] `current.json` (from monitor-systems.yml)
  - [ ] `incidents.json` (from status-update.yml)
  - [ ] `maintenance.json` (from status-update.yml)
- [ ] Ensure `status-data/` is NOT in `.gitignore`
- [ ] Test critical incident flow:
  - [ ] Create issue with `status` + `critical` + system label
  - [ ] Verify `repository_dispatch` triggers immediate deployment
  - [ ] Check deployment completes within ~2 minutes

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
