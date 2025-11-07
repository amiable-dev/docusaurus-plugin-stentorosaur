# Status Plugin Configuration Options

You now have full control over what's displayed on your status page!

## CLI Tools (v0.4.12+)

### stentorosaur-update-status

Command-line tool for generating status data files from GitHub Issues.

**Usage:**

```bash
npx stentorosaur-update-status [options]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output-dir <path>` | string | `status-data` | Directory to write status files |
| `--write-incidents` | boolean | `false` | Generate incidents.json from issues with 'status' label |
| `--write-maintenance` | boolean | `false` | Generate maintenance.json from issues with 'maintenance' label |
| `--verbose` | boolean | `false` | Enable detailed logging |
| `--commit` | boolean | `false` | Auto-commit changes with emoji messages |
| `--help` | - | - | Show help message |

**Examples:**

```bash
# Generate all data files (v0.4.12+)
npx stentorosaur-update-status --write-incidents --write-maintenance

# With verbose logging
npx stentorosaur-update-status --write-incidents --write-maintenance --verbose

# Custom output directory
npx stentorosaur-update-status \
  --output-dir ./public/status \
  --write-incidents \
  --write-maintenance

# Auto-commit with emoji messages
npx stentorosaur-update-status \
  --write-incidents \
  --write-maintenance \
  --commit
```

**GitHub Action Usage:**

```yaml
- name: Update status data
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    npx stentorosaur-update-status \
      --write-incidents \
      --write-maintenance \
      --verbose
```

**Output Files:**

When `--write-incidents` is used:
- Creates `status-data/incidents.json` with active and resolved incidents
- Includes issues with `status` label
- Contains last 30 days of resolved incidents

When `--write-maintenance` is used:
- Creates `status-data/maintenance.json` with maintenance windows
- Includes issues with `maintenance` label
- Parses YAML frontmatter for start/end times
- Calculates status: upcoming, in-progress, or completed

**Environment Variables:**

- `GITHUB_TOKEN` - Required for fetching issues from GitHub API
- `GITHUB_REPOSITORY` - Auto-detected in GitHub Actions, or use `--owner` and `--repo` options (coming soon)

## Quick Reference (v0.5.0)

```typescript
{
  // Layout Options
  statusView?: 'default' | 'upptime';           // Choose status page style
  
  // Upptime Configuration
  uptimeConfig?: {
    sections: Array<{
      id: 'active-incidents' | 'live-status' | 'charts' | 
          'scheduled-maintenance' | 'past-maintenance' | 'past-incidents';
      enabled: boolean;
    }>;
    sectionTitles?: Record<string, string>;      // Override section titles
  };
  
  // Scheduled Maintenance
  scheduledMaintenance?: {
    enabled?: boolean;                           // Enable maintenance tracking (default: true)
    label?: string;                              // Single GitHub label (default: 'maintenance', deprecated)
    labels?: string[];                           // Multiple GitHub labels (overrides 'label')
    displayDuration?: number;                    // Show completed maintenance for N days
    timezone?: string;                           // Display timezone (default: 'UTC')
  };
}
```

## New Configuration Options

### Demo Data Control

```typescript
{
  // Explicitly use demo data (overrides auto-detection)
  // Default: undefined (auto: true if no token, false if token provided)
  useDemoData?: boolean;
}
```

**Examples:**
```typescript
// Force demo data even with a token
useDemoData: true

// Never use demo data, show empty page if no GitHub data
useDemoData: false

// Auto mode: use demo data only when no token provided (default)
// (omit the option)
```

### Performance Metrics Control (v0.3.1+)

```typescript
{
  // Show/hide interactive performance metrics on the status page
  // Default: true
  showPerformanceMetrics?: boolean;
  
  // Default SLO target for all systems (percentage, e.g., 99.9 for 99.9% uptime)
  // Default: 99.9
  defaultSLO?: number;
  
  // Per-system SLO targets (overrides defaultSLO)
  // Key is the system name, value is the SLO target percentage
  // Default: {}
  systemSLOs?: Record<string, number>;
}
```

When enabled (default), system cards become clickable to show/hide detailed performance charts:
- Response Time trends
- Uptime visualization (bar/heatmap)
- SLI/SLO compliance tracking
- Error budget consumption

Charts display in a responsive 2x2 grid (desktop) or vertical stack (mobile), with fullscreen zoom capability.

**Examples:**
```typescript
// Enable performance metrics with default 99.9% SLO (default)
showPerformanceMetrics: true

// Disable interactive charts - show only system status cards
showPerformanceMetrics: false

// Set a different default SLO for all systems
defaultSLO: 99.95

// Configure different SLO targets per system
systemSLOs: {
  'Main Website': 99.99,  // Higher SLO for critical service
  'API Service': 99.9,
  'Documentation': 99.5,   // Lower SLO for non-critical service
}

// Combine default with per-system overrides
defaultSLO: 99.9,
systemSLOs: {
  'Main Website': 99.99,  // Only override the critical one
}
```

### Visibility Control

```typescript
{
  // Show/hide the services status board
  // Default: true
  showServices?: boolean;

  // Show/hide the incident history
  // Default: true  
  showIncidents?: boolean;
}
```

**Examples:**

```typescript
// Show only services, no incidents
showServices: true,
showIncidents: false,

// Show only incidents, no services  
showServices: false,
showIncidents: true,

// Show both (default)
showServices: true,
showIncidents: true,

// Show neither (empty status page)
showServices: false,
showIncidents: false,
```

## Complete Configuration Example

```typescript
// docusaurus.config.ts
plugins: [
  [
    'docusaurus-plugin-stentorosaur',
    {
      // GitHub source
      owner: 'facebook',
      repo: 'docusaurus',
      systemLabels: ['website', 'docs', 'api'],
      token: process.env.GITHUB_TOKEN,
      
      // Page content
      title: 'System Status',
      description: 'Current operational status',
      
      // Data source control
      useDemoData: false,               // Don't use demo data
      
      // Visibility control  
      showServices: true,               // Show services board
      showIncidents: true,              // Show incident history
      
      // Display options
      showResponseTimes: true,          // Show response time metrics
      showUptime: true,                 // Show uptime percentages
      showPerformanceMetrics: true,     // Enable interactive charts (v0.3.1+)
      
      // Update frequency
      updateInterval: 60,               // Update every 60 minutes
    },
  ],
]
```

## Direct Site/Endpoint Configuration

### Overview

Instead of (or in addition to) using GitHub Issues for monitoring configuration, you can configure endpoints directly in the plugin options. This matches [Upptime's endpoint configuration](https://upptime.js.org/docs/configuration#endpoints) and supports all monitoring options.

### Basic Site Configuration

```typescript
{
  sites: [
    {
      name: 'Main Website',
      url: 'https://example.com',
    },
    {
      name: 'API Service',
      url: 'https://api.example.com',
    },
  ],
}
```

### HTTP Method Configuration

```typescript
{
  sites: [
    {
      name: 'REST API - GET',
      url: 'https://api.example.com/health',
      method: 'GET',
    },
    {
      name: 'GraphQL API - POST',
      url: 'https://api.example.com/graphql',
      method: 'POST',
      body: '{"query":"{health}"}',
      headers: ['Content-Type: application/json'],
    },
    {
      name: 'Webhook - POST',
      url: 'https://api.example.com/webhook',
      method: 'POST',
      body: '{"event":"health_check"}',
    },
  ],
}
```

**Supported HTTP Methods:**
- `GET` (default)
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `HEAD`
- `OPTIONS`

### Check Type Configuration

```typescript
{
  sites: [
    {
      name: 'Website HTTP Check',
      url: 'https://example.com',
      check: 'http',  // Default
    },
    {
      name: 'Database TCP Check',
      url: 'db.example.com',
      check: 'tcp-ping',
      port: 5432,
    },
    {
      name: 'WebSocket Check',
      url: 'wss://ws.example.com',
      check: 'ws',
    },
    {
      name: 'SSL Certificate Check',
      url: 'https://secure.example.com',
      check: 'ssl',
    },
  ],
}
```

**Supported Check Types:**
- `http` - HTTP/HTTPS request (default)
- `tcp-ping` - TCP port check (requires `port` option)
- `ws` - WebSocket connection check
- `ssl` - SSL certificate validation check

### Authentication with Headers

```typescript
{
  sites: [
    {
      name: 'Authenticated API',
      url: 'https://api.example.com/private',
      headers: [
        'Authorization: Bearer $API_TOKEN',
        'X-API-Key: $API_KEY',
        'Content-Type: application/json',
      ],
    },
    {
      name: 'Basic Auth',
      url: 'https://admin.example.com',
      headers: [
        'Authorization: Basic $BASIC_AUTH_TOKEN',
      ],
    },
  ],
}
```

**Note:** Use `$SECRET_NAME` syntax to reference environment variables. The monitoring system will substitute these values at runtime.

### Expected Status Codes

```typescript
{
  sites: [
    {
      name: 'API with Multiple Valid Codes',
      url: 'https://api.example.com',
      expectedStatusCodes: [200, 201, 202],
    },
    {
      name: 'Redirect Endpoint',
      url: 'https://example.com/redirect',
      expectedStatusCodes: [301, 302, 307, 308],
    },
    {
      name: 'Default (200 only)',
      url: 'https://example.com',
      // expectedStatusCodes: [200]  // Default
    },
  ],
}
```

### Response Time Thresholds

```typescript
{
  sites: [
    {
      name: 'Fast API',
      url: 'https://api.example.com',
      maxResponseTime: 1000,  // 1 second - mark degraded if slower
    },
    {
      name: 'Database Query',
      url: 'https://db-api.example.com/query',
      maxResponseTime: 5000,  // 5 seconds
    },
  ],
}
```

### Custom Status Detection (Body Content)

```typescript
{
  sites: [
    {
      name: 'Health Endpoint with JSON Check',
      url: 'https://api.example.com/health',
      __dangerous__body_down_if_text_missing: '"status":"UP"',
      __dangerous__body_degraded_if_text_missing: '"all_systems":"operational"',
    },
    {
      name: 'Service with Error Detection',
      url: 'https://service.example.com/status',
      __dangerous__body_down: '"error"',
      __dangerous__body_degraded: '"warning"',
    },
  ],
}
```

**Body Check Options:**
- `__dangerous__body_down` - Mark as DOWN if response contains this text
- `__dangerous__body_degraded` - Mark as DEGRADED if response contains this text
- `__dangerous__body_down_if_text_missing` - Mark as DOWN if response DOESN'T contain this text
- `__dangerous__body_degraded_if_text_missing` - Mark as DEGRADED if response DOESN'T contain this text

### SSL Configuration

```typescript
{
  sites: [
    {
      name: 'Internal Service (Self-Signed SSL)',
      url: 'https://internal.example.com',
      __dangerous__insecure: true,  // Disable all SSL verification
    },
    {
      name: 'Dev Environment',
      url: 'https://dev.example.com',
      __dangerous__disable_verify_peer: true,  // Disable peer verification
      __dangerous__disable_verify_host: true,  // Disable host verification
    },
  ],
}
```

**⚠️ Warning:** SSL verification options should only be used in development or for internal services. They reduce security.

### Display Options

```typescript
{
  sites: [
    {
      name: 'Main Website',
      url: 'https://example.com',
      icon: '🌐',                    // Emoji or icon URL
      slug: 'main-website',          // Custom URL slug
      assignees: ['devops', 'admin'], // GitHub users to assign issues
    },
    {
      name: 'API Service',
      url: 'https://api.example.com',
      icon: '⚡',
      slug: 'api',
    },
  ],
}
```

### IPv6 Support

```typescript
{
  sites: [
    {
      name: 'IPv6 Enabled Site',
      url: 'https://ipv6.example.com',
      ipv6: true,
    },
  ],
}
```

### Complete Site Configuration Example

```typescript
{
  sites: [
    // Simple HTTP check
    {
      name: 'Main Website',
      url: 'https://example.com',
      icon: '🌐',
      slug: 'website',
      maxResponseTime: 2000,
    },
    
    // Authenticated API
    {
      name: 'REST API',
      url: 'https://api.example.com/v1/health',
      method: 'GET',
      headers: [
        'Authorization: Bearer $API_TOKEN',
        'Accept: application/json',
      ],
      expectedStatusCodes: [200, 204],
      maxResponseTime: 1000,
      icon: '⚡',
      slug: 'api',
    },
    
    // Database TCP check
    {
      name: 'PostgreSQL Database',
      url: 'db.example.com',
      check: 'tcp-ping',
      port: 5432,
      icon: '🗄️',
      slug: 'database',
    },
    
    // GraphQL with body check
    {
      name: 'GraphQL API',
      url: 'https://graphql.example.com',
      method: 'POST',
      headers: ['Content-Type: application/json'],
      body: '{"query":"{__schema{queryType{name}}}"}',
      __dangerous__body_down_if_text_missing: '"queryType"',
      maxResponseTime: 3000,
      icon: '📊',
    },
    
    // WebSocket
    {
      name: 'WebSocket Server',
      url: 'wss://ws.example.com',
      check: 'ws',
      icon: '🔌',
      slug: 'websocket',
    },
    
    // Internal service with self-signed SSL
    {
      name: 'Internal Admin',
      url: 'https://admin.internal',
      __dangerous__insecure: true,
      headers: ['X-Internal-Token: $INTERNAL_TOKEN'],
      assignees: ['ops-team'],
    },
  ],
}
```

### Environment Variable Substitution

All site configuration fields support environment variable substitution using `$VARIABLE_NAME` syntax:

```typescript
{
  sites: [
    {
      name: 'Production API',
      url: '$API_BASE_URL/health',  // e.g., process.env.API_BASE_URL
      headers: [
        'Authorization: Bearer $API_TOKEN',
        'X-Tenant-ID: $TENANT_ID',
      ],
      body: '$REQUEST_BODY',
    },
  ],
}
```

**Common environment variables:**
- `$API_TOKEN` - API authentication tokens
- `$API_KEY` - API keys
- `$BASIC_AUTH_TOKEN` - Base64-encoded basic auth
- `$API_BASE_URL` - Base URLs for APIs
- Custom variables specific to your infrastructure

### Sites Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | **required** | Display name for the site |
| `url` | `string` | **required** | URL to monitor (supports `$SECRET` syntax) |
| `method` | `string` | `'GET'` | HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS |
| `check` | `string` | `'http'` | Check type: http, tcp-ping, ws, ssl |
| `port` | `number` | - | Port number for TCP ping checks |
| `ipv6` | `boolean` | `false` | Use IPv6 for checks |
| `headers` | `string[]` | - | HTTP headers (format: `'Header: value'`) |
| `body` | `string` | - | Request body for POST/PUT/PATCH |
| `expectedStatusCodes` | `number[]` | `[200]` | Valid HTTP status codes |
| `maxResponseTime` | `number` | - | Max response time in ms before marking degraded |
| `__dangerous__insecure` | `boolean` | `false` | Disable SSL verification ⚠️ |
| `__dangerous__disable_verify_peer` | `boolean` | `false` | Disable SSL peer verification ⚠️ |
| `__dangerous__disable_verify_host` | `boolean` | `false` | Disable SSL host verification ⚠️ |
| `__dangerous__body_down` | `string` | - | Mark DOWN if response contains text |
| `__dangerous__body_degraded` | `string` | - | Mark DEGRADED if response contains text |
| `__dangerous__body_down_if_text_missing` | `string` | - | Mark DOWN if text missing |
| `__dangerous__body_degraded_if_text_missing` | `string` | - | Mark DEGRADED if text missing |
| `icon` | `string` | - | Emoji or icon URL |
| `slug` | `string` | - | Custom URL slug (lowercase, hyphens only) |
| `assignees` | `string[]` | - | GitHub usernames for issue assignment |

## Common Use Cases

### 1. Demo Site (no GitHub token)
```typescript
{
  // No token, no owner/repo - shows demo data automatically
  title: 'Demo Status Page',
  useDemoData: true,  // Explicit (optional, already default)
}
```

### 2. Production with Real Data
```typescript
{
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN,
  useDemoData: false,  // Never show demo data
  systemLabels: ['api', 'web', 'database'],
}
```

### 3. Services Only (No Incident History)
```typescript
{
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN,
  showServices: true,
  showIncidents: false,  // Hide incident timeline
}
```

### 4. Incidents Only (No Services Status)
```typescript
{
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN,
  showServices: false,   // Hide status board
  showIncidents: true,   // Show only incident history
}
```

### 5. Fallback to Demo Data
```typescript
{
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN,
  // If GitHub fetch fails or returns empty, show demo data
  // This is now automatic when no data is found!
}
```

## Testing Your Configuration

Clear the cache and restart to see changes:
```bash
cd test-status-site
npm run clear
npm start
```

Then visit http://localhost:3000/status

---

## Status Page Layout (v0.5.0+)

### Choosing Your Status Page Style

The plugin supports two different status page layouts:

1. **Default Layout** - Original compact design with services and incidents
2. **Upptime Layout** - Structured sections with scheduled maintenance support

```typescript
{
  // Choose your layout style
  statusView: 'upptime',  // 'default' | 'upptime'
}
```

### Default Layout

The classic layout with services board and incident history:

```typescript
{
  statusView: 'default',  // or omit (default)
  showServices: true,
  showIncidents: true,
}
```

**Features:**
- Compact services status board
- Incident timeline
- Optional performance metrics

### Upptime Layout

A structured layout inspired by Upptime with configurable sections:

```typescript
{
  statusView: 'upptime',
  uptimeConfig: {
    sections: [
      { id: 'active-incidents', enabled: true },
      { id: 'live-status', enabled: true },
      { id: 'charts', enabled: false },  // Disable charts section
      { id: 'scheduled-maintenance', enabled: true },
      { id: 'past-maintenance', enabled: true },
      { id: 'past-incidents', enabled: true },
    ],
    sectionTitles: {
      'scheduled-maintenance': '🔧 Upcoming Maintenance',
      'past-maintenance': '✅ Completed Maintenance',
      'active-incidents': '🚨 Current Issues',
    },
  },
}
```

**Available Section IDs:**
- `active-incidents` - Currently open incidents
- `live-status` - Real-time system status board
- `charts` - Performance charts (placeholder)
- `scheduled-maintenance` - Upcoming and in-progress maintenance
- `past-maintenance` - Completed maintenance history
- `past-incidents` - Resolved incidents

**Features:**
- Clean sectioned layout
- Scheduled maintenance tracking
- Customizable section titles with emoji
- Granular visibility control

---

## Scheduled Maintenance (v0.5.0+)

Scheduled maintenance displays in **both** status page views (`statusView: 'default'` and `statusView: 'upptime'`):
- **Default view** (v0.6.2+): Shows "Scheduled Maintenance" and "Past Maintenance" sections
- **Upptime view** (v0.5.0+): Configurable via `uptimeConfig.sections`

### Enabling Maintenance Tracking

```typescript
{
  scheduledMaintenance: {
    enabled: true,                           // Enable maintenance tracking (default: true)
    label: 'maintenance',                    // Single GitHub label (deprecated: use 'labels')
    labels: ['maintenance', 'planned'],      // Multiple GitHub labels (overrides 'label')
    displayDuration: 30,                     // Show completed maintenance for N days (default: all)
    timezone: 'America/New_York',            // Display times in timezone (default: 'UTC')
  },
}
```

**Configuration Options:**

- **`enabled`** (boolean, default: `true`) - Enable/disable maintenance tracking entirely
- **`label`** (string, default: `'maintenance'`) - Single GitHub label (deprecated, use `labels` instead)
- **`labels`** (string[], optional) - Multiple GitHub labels for maintenance issues (takes precedence over `label`)
- **`displayDuration`** (number, optional) - Number of days to show completed maintenance. Omit to show all completed maintenance.
- **`timezone`** (string, default: `'UTC'`) - Timezone for displaying maintenance times. Supports IANA timezone identifiers (e.g., `'America/New_York'`, `'Europe/London'`) or `'local'` for browser timezone.

### Creating Maintenance Issues

Create a GitHub issue with the `maintenance` label and YAML frontmatter:

**Labels:**
- `maintenance` (required - or your custom label from config)
- System labels optional (e.g., `api`, `database`)

**Issue Body Format:**

```markdown
---
start: 2025-11-15T02:00:00Z
end: 2025-11-15T04:00:00Z
systems:
  - API Service
  - Database
---

Scheduled database upgrade to improve performance.

**Expected Impact:**
- API will be unavailable during the maintenance window
- Database queries may be slower than usual

**Rollback Plan:**
Database snapshots available for immediate restore if needed.
```

**Required Frontmatter Fields:**
- `start` - Maintenance start time (ISO 8601 format, UTC recommended)
- `end` - Maintenance end time (ISO 8601 format)
- `systems` - Array of affected system names (optional, uses issue labels if omitted)

**Issue Comments:**
Add comments to provide updates during maintenance. They will be displayed in the maintenance timeline.

### Maintenance Statuses

Status is automatically determined based on timing:

- `upcoming` - Start time is in the future (shows in "Scheduled Maintenance")
- `in-progress` - Current time between start and end (shows in "Scheduled Maintenance" with indicator)
- `completed` - End time has passed OR issue is closed (shows in "Past Maintenance")

### Maintenance UI Components

The plugin provides two new components for displaying maintenance:

**MaintenanceList** - Displays a list of maintenance items:
```tsx
import MaintenanceList from '@theme/Maintenance/MaintenanceList';

<MaintenanceList
  maintenance={maintenanceItems}
  filterStatus="upcoming"  // 'upcoming' | 'in-progress' | 'completed' | 'all'
  showComments={true}
  showAffectedSystems={true}
  emptyMessage="No maintenance scheduled"
/>
```

**MaintenanceItem** - Displays a single maintenance window:
```tsx
import MaintenanceItem from '@theme/Maintenance/MaintenanceItem';

<MaintenanceItem
  maintenance={maintenanceData}
  showComments={true}
  showAffectedSystems={true}
/>
```

### Example: Full Upptime Setup with Maintenance

```typescript
// docusaurus.config.ts
plugins: [
  [
    'docusaurus-plugin-stentorosaur',
    {
      owner: 'your-org',
      repo: 'status-tracking',
      token: process.env.GITHUB_TOKEN,
      systemLabels: ['api', 'website', 'database'],
      
      // Upptime-style layout
      statusView: 'upptime',
      
      // Configure sections
      uptimeConfig: {
        sections: [
          { id: 'active-incidents', enabled: true },
          { id: 'live-status', enabled: true },
          { id: 'scheduled-maintenance', enabled: true },
          { id: 'past-maintenance', enabled: true },
          { id: 'past-incidents', enabled: true },
        ],
        sectionTitles: {
          'scheduled-maintenance': '🔧 Upcoming Maintenance',
          'past-maintenance': '✅ Maintenance History',
        },
      },
      
      // Enable maintenance tracking
      scheduledMaintenance: {
        enabled: true,
        label: 'maintenance',
      },
    },
  ],
]
```

---

## Interactive Performance Metrics (v0.3.1+)

### Click-to-Toggle Performance Metrics

When `showPerformanceMetrics: true` (default), the status page becomes interactive:

**User Experience:**
1. Click any system card to view its performance metrics
2. Metrics slide down smoothly below the clicked card
3. Click a different system to switch to its metrics
4. Click the active system again to hide metrics (toggle off)

**Features:**
- 🎭 **Smooth animations**: Slide-down reveal with fade-in effects
- 📊 **Four chart types**: Response Time, Uptime, SLI/SLO, Error Budget
- 🔄 **Synchronized periods**: Toggle all charts between 24h, 7d, 30d, 90d simultaneously
- 🔍 **Fullscreen zoom**: Click any chart for detailed fullscreen analysis
- 📱 **Responsive layout**: 2x2 grid (desktop) or vertical stack (mobile)
- ⌨️ **Keyboard accessible**: Tab navigation, Enter/Space to toggle

### Performance Metrics Configuration

```typescript
{
  // Enable/disable interactive performance metrics
  showPerformanceMetrics: true,  // Default: true
  
  // Still works with individual chart controls
  showResponseTimes: true,
  showUptime: true,
}
```

**Configuration Examples:**

```typescript
// Full interactive experience (default)
{
  showPerformanceMetrics: true,
  showResponseTimes: true,
  showUptime: true,
}

// Disable interactive metrics, show only status cards
{
  showPerformanceMetrics: false,
}

// Hybrid: No interactive metrics, but show basic response times on cards
{
  showPerformanceMetrics: false,
  showResponseTimes: true,
  showUptime: true,
}
```

### SLI/SLO Tracking (v0.3.1+)

The new SLI (Service Level Indicator) and SLO (Service Level Objective) charts help track service reliability:

**SLI Chart Features:**
- Daily SLI percentage calculation based on uptime
- SLO target line (default: 99.9%, configurable)
- Color-coded compliance: green (above SLO), red (below SLO)
- Period selection: 24h, 7d, 30d, 90d

**Error Budget Chart Features:**
- Daily error budget consumption visualization
- Shows how much "allowed downtime" was used each day
- 100% = all error budget consumed for that day
- Helps track and prevent SLO violations

**SLO Target Configuration:**

The default SLO target is 99.9%, but you can customize it per system:

```tsx
// In a custom component or swizzled StatusPage
<PerformanceMetrics 
  systemName="api"
  sloTarget={99.95}  // Stricter SLO
/>

// Or in an embedded ChartPanel
<ChartPanel 
  systemName="database"
  showCharts={['sli', 'errorBudget']}
  sloTarget={99.9}
/>
```

### Embedding Charts in Your Content (v0.3.1+)

The new `ChartPanel` component lets you embed performance charts anywhere in your Docusaurus site:

```mdx
---
title: API Performance Dashboard
---

import ChartPanel from '@theme/ChartPanel';

# API Monitoring

## Real-Time Performance

<ChartPanel 
  systemName="api"
  showCharts={['response', 'uptime', 'sli', 'errorBudget']}
  defaultPeriod="7d"
  layout="horizontal"
/>

## Response Time Only

<ChartPanel 
  systemName="api"
  showCharts={['response']}
  defaultPeriod="30d"
/>
```

**ChartPanel Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `systemName` | string | required | System to display charts for |
| `showCharts` | array | `['response', 'uptime', 'sli', 'errorBudget']` | Chart types to include |
| `defaultPeriod` | string | `'7d'` | Initial time period |
| `layout` | string | `'horizontal'` | `'horizontal'` (2x2 grid) or `'vertical'` (stack) |
| `sloTarget` | number | `99.9` | SLO percentage target |

**Chart Types:**
- `'response'` - Response time line chart
- `'uptime'` - Uptime bar/heatmap chart
- `'sli'` - SLI/SLO compliance line chart
- `'errorBudget'` - Error budget consumption bar chart

### Swizzling New Components (v0.3.1+)

All new components are fully swizzleable for customization:

```bash
# Swizzle the performance metrics wrapper
npm run swizzle docusaurus-plugin-stentorosaur PerformanceMetrics -- --eject

# Swizzle the SLI chart component
npm run swizzle docusaurus-plugin-stentorosaur SLIChart -- --eject

# Swizzle the embeddable chart panel
npm run swizzle docusaurus-plugin-stentorosaur ChartPanel -- --eject
```

**Total swizzleable components: 10**
1. StatusPage
2. StatusBoard
3. StatusItem
4. IncidentHistory
5. ResponseTimeChart
6. UptimeChart
7. StatusHistory
8. PerformanceMetrics (new in v0.3.1)
9. SLIChart (new in v0.3.1)
10. ChartPanel (new in v0.3.1)

---

## Chart Visualization Options (v0.3.0+)

The plugin now includes interactive charts for visualizing response times and uptime data!

### Chart Components

Three new theme components are available for use in your status pages:

1. **ResponseTimeChart** - Line chart showing response time trends over time
2. **UptimeChart** - Bar chart or heatmap showing uptime percentages
3. **StatusHistory** - Full page component combining both charts with detailed metrics

### Using Charts in Your Status Page

The charts automatically work with historical status data stored in `status-data/systems/*.json` files. You can swizzle the components to customize them:

```bash
npm run swizzle docusaurus-plugin-stentorosaur ResponseTimeChart -- --eject
npm run swizzle docusaurus-plugin-stentorosaur UptimeChart -- --eject
npm run swizzle docusaurus-plugin-stentorosaur StatusHistory -- --eject
```

### ResponseTimeChart Component

```tsx
import ResponseTimeChart from '@theme/ResponseTimeChart';

<ResponseTimeChart
  name="API Service"
  history={historicalData}
  period="7d"              // '24h' | '7d' | '30d' | '90d'
  height={300}             // Chart height in pixels
  showPeriodSelector={true} // Show time period buttons
/>
```

**Features:**
- Interactive line chart with hover tooltips
- Multiple time period views (24h, 7d, 30d, 90d)
- Color-coded data points based on status (green/yellow/red)
- Average response time reference line
- Automatic dark/light theme support
- Mobile responsive

### UptimeChart Component

```tsx
import UptimeChart from '@theme/UptimeChart';

<UptimeChart
  name="API Service"
  history={historicalData}
  chartType="bar"          // 'bar' | 'heatmap'
  period="30d"             // '7d' | '30d' | '90d'
  height={300}             // Chart height in pixels
/>
```

**Features:**
- Bar chart view: Daily uptime percentages with color coding
- Heatmap view: GitHub-style calendar visualization
- Color coding:
  - Green: ≥99% uptime
  - Yellow: 95-99% uptime
  - Red: <95% uptime
- Automatic dark/light theme support
- Mobile responsive

### StatusHistory Page Component

A full-page component that displays comprehensive historical data for a single system:

```tsx
import StatusHistory from '@theme/StatusHistory';

<StatusHistory
  systemName="api-service"
  dataPath="status-data"    // Optional, defaults to 'status-data'
/>
```

**Features:**
- System status overview with current state
- Uptime metrics (all-time, 24h, 7d, 30d)
- Average response time metrics
- Response time trend chart
- Uptime chart (bar or heatmap view)
- Historical data statistics

### Historical Data Format

Charts require historical data in this format:

```json
{
  "name": "API Service",
  "url": "https://api.example.com",
  "lastChecked": "2025-11-02T10:00:00Z",
  "currentStatus": "up",
  "history": [
    {
      "timestamp": "2025-11-01T10:00:00Z",
      "status": "up",
      "code": 200,
      "responseTime": 145
    }
  ],
  "timeDay": 145,
  "timeWeek": 156,
  "timeMonth": 148,
  "uptimeDay": "99.98%",
  "uptimeWeek": "99.95%",
  "uptimeMonth": "99.92%",
  "uptime": "99.90%"
}
```

Store these files in `status-data/systems/{system-name}.json` in your site's build output.

### Demo Data with Charts

Demo mode includes sample historical data with ~30 days of checks:

```typescript
{
  useDemoData: true,  // Automatically includes chart data
}
```

### Theme Integration

All charts automatically adapt to your Docusaurus theme:
- Respect dark/light mode settings
- Use theme CSS variables for colors
- Match your site's design system
- Fully responsive on mobile devices

### Dataset Download (v0.6.0+)

All charts now support downloading the underlying dataset in multiple formats:

**Available Formats:**

- **CSV** - Comma-separated values for Excel, Google Sheets, and data analysis tools
- **JSON** - Machine-readable format for programmatic access

**Export Buttons:**

Each chart component includes export buttons:

- Response Time Chart: timestamp, responseTime, status, statusCode
- Uptime Chart: date, uptimePercent, totalChecks, successfulChecks, failedChecks, incidentCount, incidents
- SLI Chart: date, sliPercent, errorBudgetRemaining, sloTarget
- Mini Heatmap: date, uptimePercent, incidentCount, incidents

**Filename Format:**

Files are automatically named with the system name and date range:

- `system-name-response-time-2024-11-01-to-2024-11-06.csv`
- `system-name-uptime-2024-11-01-to-2024-11-06.json`
- `system-name-sli-2024-11-01-to-2024-11-06.csv`
- `system-name-heatmap-2024-11-01-to-2024-11-06.json`

**Use Cases:**

- Import historical data into Excel/Google Sheets for custom analysis
- Generate reports for stakeholders with actual uptime data
- Feed data into BI tools or custom dashboards
- Archive performance metrics for compliance
- Create custom visualizations with your preferred tools

### Performance Considerations

- Charts are lazy-loaded only when visible
- Historical data is loaded client-side from JSON files
- Data can be decimated for large datasets (thousands of points)
- Consider limiting history to 30-90 days for optimal performance
- Dataset downloads are generated client-side with no server load
