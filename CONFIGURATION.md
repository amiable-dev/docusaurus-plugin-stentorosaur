# Status Plugin Configuration Options

You now have full control over what's displayed on your status page!

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

### Performance Considerations

- Charts are lazy-loaded only when visible
- Historical data is loaded client-side from JSON files
- Data can be decimated for large datasets (thousands of points)
- Consider limiting history to 30-90 days for optimal performance
