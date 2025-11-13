# Quick Start Guide

Get your status page up and running in minutes!

## Step 1: Install the Plugin

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur
```

## Step 2: Setup GitHub Token (Optional)

**For local development**, create a `.env` file:

```bash
# .env
GITHUB_TOKEN=ghp_your_personal_access_token
```

Create a Personal Access Token at <https://github.com/settings/tokens> with `repo` or `public_repo` scope.

> **Note:**
>
> - For **GitHub Actions deployments**, you must pass the token via `env:` - see [README](./README.md#github-token-setup)
> - Without a token, the plugin shows **demo data** (useful for testing)
> - See the [README](./README.md#github-token-setup) for detailed token setup

## Step 2: Configure Docusaurus

Add to your `docusaurus.config.js`:

```javascript
module.exports = {
  plugins: [
    [
      '@amiable-dev/docusaurus-plugin-stentorosaur',
      {
        owner: 'your-github-org',
        repo: 'your-repo',
        entities: [
          { name: 'api', type: 'system' },
          { name: 'website', type: 'system' },
          { name: 'database', type: 'system' },
        ],
        token: process.env.GITHUB_TOKEN,
        
        // Optional: Choose status page layout
        statusView: 'upptime',  // 'default' | 'upptime'

        // Optional: Enable scheduled maintenance tracking
        scheduledMaintenance: {
          enabled: true,
          label: 'maintenance',
        },
      },
    ],
  ],
};
```

## Step 3: Set up GitHub Actions

The plugin uses three workflows that work together:

### Workflow 1: Monitor Systems (Required for Automated Monitoring)

Copy the monitoring workflows:

```bash
mkdir -p .github/workflows
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/monitor-systems.yml .github/workflows/
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/compress-archives.yml .github/workflows/
```

**Configure your endpoints** - create `.monitorrc.json` in your repository root:

```json
{
  "systems": [
    {
      "system": "api",
      "url": "https://api.example.com/health",
      "expectedCodes": [200],
      "maxResponseTime": 30000
    },
    {
      "system": "website",
      "url": "https://example.com"
    }
  ]
}
```

**What it does:**
- ✅ Checks endpoints every 5 minutes
- ✅ Updates `current.json` with response times and status
- ✅ Creates GitHub Issues for critical failures
- ✅ Commits with `[skip ci]` (doesn't trigger deployments)

### Workflow 2: Status Update (Required for Incident Tracking)

Copy the status update workflow:

```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/status-update.yml .github/workflows/
```

**What it does:**
- ✅ Runs when issues are created/updated/closed
- ✅ Runs hourly to catch any changes
- ✅ Generates `incidents.json` from issues with `status` label
- ✅ Generates `maintenance.json` from issues with `maintenance` label
- ✅ Triggers immediate deployment for critical incidents
- ✅ Uses CLI: `npx stentorosaur-update-status --write-incidents --write-maintenance`

**CLI Options:**

```bash
# Full command with all options
npx stentorosaur-update-status \
  --write-incidents \
  --write-maintenance \
  --output-dir status-data \
  --verbose

# Available options:
# --write-incidents    Generate incidents.json from 'status' labeled issues
# --write-maintenance  Generate maintenance.json from 'maintenance' labeled issues
# --output-dir <path>  Custom output directory (default: status-data)
# --verbose            Enable detailed logging
# --commit             Auto-commit changes with emoji messages
```

### Workflow 3: Deployment (Required)

Copy both deployment workflows:

```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/deploy.yml .github/workflows/
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/deploy-scheduled.yml .github/workflows/
```

**deploy.yml** - Immediate deployments:
- ✅ Triggered by code pushes to main
- ✅ Triggered by `repository_dispatch` events (critical incidents)
- ✅ Ignores monitoring data commits (via `paths-ignore`)
- ✅ Deploys within ~2 minutes for critical incidents

**deploy-scheduled.yml** - Scheduled deployments:
- ✅ Runs every hour (configurable)
- ✅ Picks up non-critical incident updates
- ✅ Picks up maintenance window changes
- ✅ Ensures regular updates even without critical issues

**Smart Deployment Logic:**

```
Critical Incident:
  Issue created with 'critical' + 'status' labels
    → status-update.yml runs
    → Generates incidents.json with critical incident
    → Triggers repository_dispatch event
    → deploy.yml runs immediately
    → Status page updated in ~2 minutes

Non-Critical Update:
  Issue created with 'major' or 'minor' label
    → status-update.yml runs
    → Generates incidents.json
    → Commits with [skip ci]
    → deploy-scheduled.yml runs within 1 hour
    → Status page updated

Monitoring Data:
  monitor-systems.yml runs every 5 minutes
    → Updates current.json
    → Commits with [skip ci]
    → NO deployment triggered (paths-ignore)
    → Data available for next scheduled deployment
```

### Complete Workflow Setup Summary

After copying all workflows, you'll have:

```
.github/
  workflows/
    monitor-systems.yml      # Every 5 min - Check endpoints, update current.json
    status-update.yml        # On issue events + hourly - Update incidents/maintenance
    deploy.yml               # On push + critical incidents - Immediate deployment
    deploy-scheduled.yml     # Hourly - Pick up non-critical updates
    compress-archives.yml    # Daily - Compress old monitoring data
```

**Data Flow:**

```
Every 5 min:
  monitor-systems.yml → current.json → [skip ci] → No deploy
  
Critical failure:
  monitor-systems.yml → Creates Issue → status-update.yml
    → incidents.json → repository_dispatch → deploy.yml → IMMEDIATE DEPLOY
  
Non-critical issue:
  GitHub Issue created → status-update.yml
    → incidents.json → [skip ci] → deploy-scheduled.yml (hourly) → DEPLOY

Maintenance:
  GitHub Issue with YAML frontmatter → status-update.yml
    → maintenance.json → [skip ci] → deploy-scheduled.yml (hourly) → DEPLOY
```

### Issue Template (Optional but Recommended)

```bash
mkdir -p .github/ISSUE_TEMPLATE
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/ISSUE_TEMPLATE/status-issue.yml .github/ISSUE_TEMPLATE/
```

## Step 4: Create Your First Status Issue

Create a new GitHub issue with these labels:

- `status` (required)
- `api` (or whatever system label you configured)
- `critical` (or `major`, `minor`)

Example:

- Title: "API experiencing high latency"
- Labels: `status`, `api`, `major`
- Body: Description of the issue

**For maintenance windows**, add YAML frontmatter with human-friendly dates:

```markdown
---
start: @tomorrow 2am UTC
end: @tomorrow 4am UTC
---

Scheduled database upgrade to improve performance.
```

**Labels for maintenance:** `maintenance`, `api`, `database` (affected entities)

💡 **Tip:** You can use simple entity labels (`api`) or namespaced (`system:api`). Both work!

## Step 5: View Your Status Page

Start your Docusaurus dev server:

```bash
npm run start
```

Navigate to: `http://localhost:3000/status`

## Next Steps

### Choose Your Status Page Layout

Pick the layout that works best for you:

**Default Layout** - Compact design with services and incidents:
```javascript
{
  statusView: 'default',  // or omit (this is the default)
}
```

**Upptime Layout** - Structured sections with maintenance support:
```javascript
{
  statusView: 'upptime',
  uptimeConfig: {
    sections: [
      { id: 'active-incidents', enabled: true },
      { id: 'live-status', enabled: true },
      { id: 'scheduled-maintenance', enabled: true },
      { id: 'past-maintenance', enabled: true },
      { id: 'past-incidents', enabled: true },
    ],
  },
  scheduledMaintenance: {
    enabled: true,
    label: 'maintenance',
  },
}
```

### Track Scheduled Maintenance

Create maintenance issues with special formatting:

1. Add labels: `maintenance` + system labels (e.g., `api`)
2. Include in the issue body:

```markdown
**Scheduled Start:** 2025-11-15T02:00:00Z
**Scheduled End:** 2025-11-15T04:00:00Z
**Status:** upcoming
**Affected Systems:** api, database

## Description
Database upgrade to improve performance.
```

### Customize Your Status Page

Edit the plugin configuration to customize:

```javascript
{
  title: 'Our System Status',
  description: 'Real-time status of all our services',
  showResponseTimes: true,
  showUptime: true,
  showPerformanceMetrics: true,  // Enable interactive charts
}
```

### Explore Interactive Features

**Click System Cards**: When `showPerformanceMetrics` is enabled (default), click any system card to reveal detailed performance charts:

- Response time trends
- Uptime visualization
- SLI/SLO compliance tracking
- Error budget consumption

**Period Selection**: Toggle between 24h, 7d, 30d, or 90d views - all charts update simultaneously.

**Fullscreen Zoom**: Click any chart to view it fullscreen for detailed analysis.

**Keyboard Navigation**: Use Tab, Enter, and Space keys for full accessibility.

### Embed Charts in Your Docs

Use the new `ChartPanel` component to embed performance charts anywhere:

```mdx
---
title: API Performance
---

import ChartPanel from '@theme/ChartPanel';

# API Monitoring

<ChartPanel 
  systemName="api"
  showCharts={['response', 'uptime', 'sli', 'errorBudget']}
  defaultPeriod="7d"
  layout="horizontal"
/>
```

**Individual Chart Types:**

```mdx
<!-- Response Time Only -->
<ChartPanel systemName="api" showCharts={['response']} />

<!-- SLI/SLO Compliance -->
<ChartPanel systemName="api" showCharts={['sli']} sloTarget={99.95} />

<!-- Error Budget -->
<ChartPanel systemName="api" showCharts={['errorBudget']} />
```

### Set Up Authentication

For private repositories, create a GitHub Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Add to your environment: `GITHUB_TOKEN=your_token_here`

### Monitor More Entities

Add more entities to track:

```javascript
entities: [
  { name: 'api', type: 'system' },
  { name: 'website', type: 'system' },
  { name: 'database', type: 'system' },
  { name: 'auth', type: 'system' },
  { name: 'ci-cd', type: 'system' },
  { name: 'support', type: 'process' },
  { name: 'onboarding', type: 'process' },
]
```

**Note:** The Entity model supports multiple types beyond just systems: `system`, `process`, `project`, `event`, `sla`, `custom`.

### Embed Status Components

Use the components in your docs:

```mdx
import StatusBoard from '@theme/StatusBoard';
import ChartPanel from '@theme/ChartPanel';

<!-- Status overview -->
<StatusBoard items={yourStatusItems} />

<!-- Performance charts -->
<ChartPanel systemName="api" defaultPeriod="7d" />
```

## Troubleshooting

### No status data showing?

1. Check that GitHub Actions have run
2. Verify issues have the `status` label
3. Ensure entity names match your issue labels (namespaced like `system:api` or legacy like `api`)

### Build errors?

1. Run `npm install` to ensure all dependencies are installed
2. Check TypeScript compilation: `npm run build`
3. Verify your Node.js version (requires ≥18.0)

## Need Help?

- 📖 Read the [full documentation](README.md)
- 🐛 [Report an issue](https://github.com/your-org/docusaurus-plugin-stentorosaur/issues)
- 💬 [Join discussions](https://github.com/your-org/docusaurus-plugin-stentorosaur/discussions)
