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
      useDemoData: false,        // Don't use demo data
      
      // Visibility control  
      showServices: true,        // Show services board
      showIncidents: true,       // Show incident history
      
      // Display options
      showResponseTimes: true,   // Show response time metrics
      showUptime: true,          // Show uptime percentages
      
      // Update frequency
      updateInterval: 60,        // Update every 60 minutes
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
