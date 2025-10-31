# Docusaurus Status Plugin

A Docusaurus plugin that creates an Upptime-like status monitoring dashboard powered by GitHub Issues and Actions. Perfect for tracking both system uptime and process-based issues, all embedded directly in your Docusaurus documentation site.

## Features

- 🎯 **Status Dashboard**: Beautiful, real-time status display for your systems and processes
- 📊 **Incident Timeline**: Historical view of all incidents with severity tracking
- 🔄 **GitHub-Powered**: Uses GitHub Issues for incident tracking and Actions for monitoring
- ⚡ **Real-time Updates**: Automatically updates status via GitHub Actions (hourly by default)
- 🎨 **Customizable**: Fully themeable and configurable to match your site
- 📱 **Responsive**: Works perfectly on all devices
- 🔧 **Flexible**: Track both technical systems AND business/process issues

## Installation

```bash
npm install docusaurus-plugin-stentorosaur
# or
yarn add docusaurus-plugin-stentorosaur
```

## Configuration

### Basic Setup

Add the plugin to your `docusaurus.config.js`:

```javascript
module.exports = {
  // ... other config
  plugins: [
    [
      'docusaurus-plugin-stentorosaur',
      {
        // GitHub repository (defaults to site's organizationName/projectName)
        owner: 'your-org',
        repo: 'your-repo',
        
        // Systems/processes to track
        systemLabels: [
          'api',
          'website',
          'database',
          'authentication',
          'deployment',
          'documentation'
        ],
        
        // Optional: GitHub token for API requests
        // Best practice: use environment variable
        token: process.env.GITHUB_TOKEN,
        
        // Status page configuration
        title: 'System Status',
        description: 'Current status of our systems and services',
        
        // Display options
        showResponseTimes: true,
        showUptime: true,
        
        // NEW: Demo data control (useful for testing)
        // Default: true when no token, false when token provided
        useDemoData: !process.env.GITHUB_TOKEN,
        
        // NEW: Content visibility
        showServices: true,    // Show/hide services status board (default: true)
        showIncidents: true,   // Show/hide incident history (default: true)
        
        // Update interval in minutes (default: 60)
        updateInterval: 60,
      },
    ],
  ],
};
```

### GitHub Actions Setup

#### 1. Copy Workflow Templates

Copy the workflow files from `templates/workflows/` to your `.github/workflows/` directory:

```bash
mkdir -p .github/workflows
cp node_modules/docusaurus-plugin-stentorosaur/templates/workflows/*.yml .github/workflows/
```

#### 2. Configure Monitoring

Edit `.github/workflows/monitor-systems.yml` to define your endpoints:

```yaml
strategy:
  matrix:
    system: 
      - name: 'api'
        url: 'https://api.example.com/health'
      - name: 'website'
        url: 'https://example.com'
      - name: 'database'
        url: 'https://db.example.com/status'
```

#### 3. Setup Issue Templates (Optional)

Copy the issue template for manual status reporting:

```bash
mkdir -p .github/ISSUE_TEMPLATE
cp node_modules/docusaurus-plugin-stentorosaur/templates/ISSUE_TEMPLATE/*.yml .github/ISSUE_TEMPLATE/
```

## Usage

### Viewing the Status Page

Once configured, the plugin automatically creates a `/status` route on your Docusaurus site.

Visit `https://your-site.com/status` to see the status dashboard.

### Embedding Status Components

You can also embed status components in your docs or blog posts:

```mdx
---
title: System Status
---

import StatusBoard from '@theme/StatusBoard';
import IncidentHistory from '@theme/IncidentHistory';

# Our Systems

<StatusBoard 
  items={[
    { name: 'API', status: 'up', uptime: '99.9%' },
    { name: 'Website', status: 'up', uptime: '99.95%' },
    { name: 'Database', status: 'degraded', uptime: '98.5%' }
  ]}
/>

## Recent Incidents

<IncidentHistory 
  incidents={[
    // Your incident data
  ]}
  maxItems={5}
/>
```

### Issue Labeling

The plugin uses GitHub issue labels to track status:

**Required Labels:**
- `status` - Identifies status-related issues

**System Labels:**
- Use labels matching your `systemLabels` config to tag which system is affected
- Example: `api`, `website`, `database`, etc.

**Severity Labels:**
- `critical` - Complete outage
- `major` - Significant degradation
- `minor` - Partial issues  
- `maintenance` - Planned work

### Manual Status Updates

You can manually create status issues using:

1. **GitHub UI**: Use the issue template at `.github/ISSUE_TEMPLATE/status-issue.yml`
2. **API/CLI**: Create issues programmatically with appropriate labels
3. **Automation**: Trigger from your monitoring tools (PagerDuty, DataDog, etc.)

## Configuration Options

### Full Options Reference

```typescript
{
  // GitHub repository (required unless using demo data)
  owner: 'your-org',
  repo: 'your-repo',
  
  // System labels to track (optional, default: [])
  systemLabels: ['api', 'web', 'database'],
  
  // GitHub token (optional but recommended)
  token: process.env.GITHUB_TOKEN,
  
  // Page metadata
  title: 'System Status',                    // default: 'Status'
  description: 'Current operational status', // default: ''
  
  // Demo data control
  useDemoData: false,                        // default: true when no token
  
  // Content visibility
  showServices: true,                        // default: true
  showIncidents: true,                       // default: true
  
  // Display features
  showResponseTimes: true,                   // default: false
  showUptime: true,                          // default: false
  
  // Update frequency
  updateInterval: 60,                        // default: 60 minutes
}
```

### Common Configuration Patterns

**Development/Demo**:
```typescript
{
  title: 'Demo Status',
  useDemoData: true,  // Shows demo services and incidents
}
```

**Production**:
```typescript
{
  owner: 'your-org',
  repo: 'status-tracking',
  token: process.env.GITHUB_TOKEN,
  systemLabels: ['api', 'web', 'database'],
  useDemoData: false,  // Only show real data
}
```

**Services Only**:
```typescript
{
  owner: 'your-org',
  repo: 'status-tracking',
  token: process.env.GITHUB_TOKEN,
  showServices: true,
  showIncidents: false,  // Hide incident timeline
}
```

See [CONFIGURATION.md](./CONFIGURATION.md) for detailed examples.

## How It Works

### Architecture

```
GitHub Issues (Status Tracking)
    ↓
GitHub Actions (Monitoring + Data Collection)
    ↓
Plugin API (GitHub Service)
    ↓
Status Data (JSON)
    ↓
React Components (UI)
    ↓
Docusaurus Page (/status)
```

### Data Flow

1. **Monitoring**: GitHub Actions run on schedule (every 5 min for system checks)
2. **Issue Creation**: When a system goes down, an issue is automatically created
3. **Data Collection**: Hourly action fetches all status issues via GitHub API
4. **Status Generation**: Plugin processes issues and generates status items
5. **Build Integration**: Status data is included in Docusaurus build
6. **Display**: React components render the status dashboard

### Issue Lifecycle

```mermaid
graph LR
    A[System Check] -->|Down| B[Create Issue]
    B --> C[Label: critical]
    C --> D[Status: down]
    A -->|Up| E{Open Issues?}
    E -->|Yes| F[Close Issue]
    F --> G[Status: up]
    E -->|No| G
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `owner` | string | `organizationName` | GitHub repository owner |
| `repo` | string | `projectName` | GitHub repository name |
| `statusLabel` | string | `'status'` | Label to filter status issues |
| `systemLabels` | string[] | `[]` | Labels for systems to track |
| `token` | string | `process.env.GITHUB_TOKEN` | GitHub API token |
| `updateInterval` | number | `60` | Update frequency (minutes) |
| `dataPath` | string | `'status-data'` | Where to store status data |
| `title` | string | `'System Status'` | Status page title |
| `description` | string | `'Current status...'` | Status page description |
| `showResponseTimes` | boolean | `true` | Display response times |
| `showUptime` | boolean | `true` | Display uptime percentages |

## Components API

### StatusBoard

Displays the overall status of all systems.

```tsx
interface StatusBoardProps {
  items: StatusItem[];
  title?: string;
  description?: string;
}
```

### StatusItem

Displays a single system's status.

```tsx
interface StatusItemProps {
  item: StatusItem;
  showResponseTime?: boolean;
  showUptime?: boolean;
}
```

### IncidentHistory

Displays a timeline of incidents.

```tsx
interface IncidentHistoryProps {
  incidents: StatusIncident[];
  maxItems?: number;
}
```

## Examples

### Tracking Process Issues

Beyond technical systems, you can track business processes:

```javascript
systemLabels: [
  'onboarding',
  'support-tickets',
  'documentation-updates',
  'content-review',
  'deployment-approval'
]
```

Then create issues with these labels to track:
- Delayed onboarding processes
- Support ticket backlogs
- Documentation that needs updating
- Content awaiting review
- Deployment approvals pending

### Custom Severity Levels

Use labels creatively for your needs:

```yaml
labels: 
  - status
  - api
  - degraded  # Custom severity
  - investigating  # Custom status
```

## Best Practices

1. **Use Descriptive Titles**: Make issue titles clear and actionable
2. **Update Issues**: Add comments to issues with progress updates
3. **Close When Resolved**: Always close issues when problems are fixed
4. **Label Consistently**: Use the same labels across all status issues
5. **Monitor Regularly**: Review your monitoring workflow frequency
6. **Set Up Alerts**: Configure GitHub notifications for status issues

## Troubleshooting

### Status page shows no data

- Ensure GitHub Actions have run at least once
- Check that issues have the correct `status` label
- Verify `systemLabels` match your issue labels

### Authentication errors

- Make sure `GITHUB_TOKEN` is set correctly
- For private repos, ensure token has `repo` scope
- Check token hasn't expired

### Components not found

- Run `npm install` to ensure dependencies are installed
- Check TypeScript compilation succeeded
- Verify theme path configuration

## Comparison with Upptime

This plugin is inspired by [Upptime](https://upptime.js.org) but designed for Docusaurus:

| Feature | Upptime | This Plugin |
|---------|---------|-------------|
| Platform | Standalone site | Docusaurus plugin |
| Status Page | Separate | Embedded in docs |
| Data Source | GitHub Issues | GitHub Issues |
| Monitoring | GitHub Actions | GitHub Actions |
| UI Framework | Svelte | React |
| Customization | Limited | Full Docusaurus theming |
| Process Tracking | No | Yes |

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT © [Your Organization]

## Credits

Inspired by [Upptime](https://github.com/upptime/upptime) by Anand Chowdhary.
