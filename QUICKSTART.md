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
        systemLabels: ['api', 'website', 'database'],
        token: process.env.GITHUB_TOKEN,
        
        // Optional: Choose status page layout (v0.5.0+)
        statusView: 'upptime',  // 'default' | 'upptime'
        
        // Optional: Enable scheduled maintenance tracking (v0.5.0+)
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

### Option A: Automated Monitoring (New in v0.4.0)

Copy the monitoring workflows:

```bash
mkdir -p .github/workflows
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/monitor-systems.yml .github/workflows/
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/compress-archives.yml .github/workflows/
```

**Configure your endpoints** - edit `monitor-systems.yml`:

```yaml
system: 
  - name: 'api'
    url: 'https://api.example.com/health'
  - name: 'website'
    url: 'https://example.com'
```

**Or use a config file** - create `.monitorrc.json`:

```json
{
  "systems": [
    {
      "system": "api",
      "url": "https://api.example.com/health",
      "expectedCodes": [200],
      "maxResponseTime": 30000
    }
  ]
}
```

**Benefits of the new system:**
- ✅ Append-only data storage (no Git history pollution)
- ✅ Fast site loads (small current.json file)
- ✅ Automatic compression of old data
- ✅ Minimal Git commits with emoji messages (🟩/🟨/🟥)

See [MONITORING_SYSTEM.md](./MONITORING_SYSTEM.md) for details.

### Option B: Manual Status Updates

Copy the status update workflow:

```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/status-update.yml .github/workflows/
```

This workflow automatically updates status data when issues change using the CLI command:

```bash
npx stentorosaur-update-status
```

**CLI Options:**

- `--help` - Show usage information
- `--output-dir <path>` - Custom output directory (default: status-data)
- `--verbose` - Enable detailed logging
- `--commit` - Auto-commit changes with emoji messages (🟩🟨🟥📊)

You can also run this command locally to update status data:

```bash
# Basic usage
npx stentorosaur-update-status

# With custom output directory
npx stentorosaur-update-status --output-dir ./public/status

# With verbose logging and auto-commit
npx stentorosaur-update-status --verbose --commit
```

And optionally the issue template:

```bash
mkdir -p .github/ISSUE_TEMPLATE
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/ISSUE_TEMPLATE/status-issue.yml .github/ISSUE_TEMPLATE/
```

## Step 4: Create Your First Status Issue

Create a new GitHub issue with these labels:

- `status` (required)
- `api` (or whatever system label you configured)
- `critical` (or `major`, `minor`, `maintenance`)

Example:

- Title: "API experiencing high latency"
- Labels: `status`, `api`, `major`
- Body: Description of the issue

## Step 5: View Your Status Page

Start your Docusaurus dev server:

```bash
npm run start
```

Navigate to: `http://localhost:3000/status`

## Next Steps

### Choose Your Status Page Layout (v0.5.0+)

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

### Track Scheduled Maintenance (v0.5.0+)

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
  showPerformanceMetrics: true,  // v0.3.1+: Enable interactive charts
}
```

### Explore Interactive Features (v0.3.1+)

**Click System Cards**: When `showPerformanceMetrics` is enabled (default), click any system card to reveal detailed performance charts:

- Response time trends
- Uptime visualization
- SLI/SLO compliance tracking
- Error budget consumption

**Period Selection**: Toggle between 24h, 7d, 30d, or 90d views - all charts update simultaneously.

**Fullscreen Zoom**: Click any chart to view it fullscreen for detailed analysis.

**Keyboard Navigation**: Use Tab, Enter, and Space keys for full accessibility.

### Embed Charts in Your Docs (v0.3.1+)

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

### Monitor More Systems

Add more systems to track:

```javascript
systemLabels: [
  'api',
  'website',
  'database',
  'auth',
  'ci-cd',
  'support',
  'onboarding',
]
```

### Embed Status Components

Use the components in your docs:

```mdx
import StatusBoard from '@theme/StatusBoard';
import ChartPanel from '@theme/ChartPanel';

<!-- Status overview -->
<StatusBoard items={yourStatusItems} />

<!-- Performance charts (v0.3.1+) -->
<ChartPanel systemName="api" defaultPeriod="7d" />
```

## Troubleshooting

### No status data showing?

1. Check that GitHub Actions have run
2. Verify issues have the `status` label
3. Ensure `systemLabels` match your issue labels

### Build errors?

1. Run `npm install` to ensure all dependencies are installed
2. Check TypeScript compilation: `npm run build`
3. Verify your Node.js version (requires ≥18.0)

## Need Help?

- 📖 Read the [full documentation](README.md)
- 🐛 [Report an issue](https://github.com/your-org/docusaurus-plugin-stentorosaur/issues)
- 💬 [Join discussions](https://github.com/your-org/docusaurus-plugin-stentorosaur/discussions)
