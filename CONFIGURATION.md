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
