# Testing New Configuration Options

## What's New?

Three new configuration options have been added to the status plugin:

1. **`useDemoData`** - Control when demo data is shown
2. **`showServices`** - Toggle the services status board visibility  
3. **`showIncidents`** - Toggle the incident history visibility

## Quick Test Guide

### Current Configuration (test-status-site)

```typescript
{
  useDemoData: !process.env.GITHUB_TOKEN, // Use demo if no token
  showServices: true,    // Show status board
  showIncidents: true,   // Show incident history  
}
```

### Test Scenarios

Edit `docusaurus.config.ts` to try different combinations:

#### 1. Services Only
```typescript
{
  useDemoData: true,
  showServices: true,
  showIncidents: false,  // Hide incidents
}
```
**Result**: You'll see the status board with 5 systems, but no incident timeline below it.

#### 2. Incidents Only  
```typescript
{
  useDemoData: true,
  showServices: false,   // Hide services
  showIncidents: true,
}
```
**Result**: You'll see only the incident history timeline, no status board.

#### 3. Force Demo Data
```typescript
{
  owner: 'facebook',
  repo: 'docusaurus',
  token: process.env.GITHUB_TOKEN,
  useDemoData: true,     // Show demo even with real token
  showServices: true,
  showIncidents: true,
}
```
**Result**: Demo data is shown regardless of token or GitHub issues.

#### 4. Real Data Only (No Demo Fallback)
```typescript
{
  owner: 'facebook',
  repo: 'docusaurus',
  token: process.env.GITHUB_TOKEN,
  useDemoData: false,    // Never use demo
  showServices: true,
  showIncidents: true,
}
```
**Result**: Only shows real GitHub issues. If none found, status board/incidents are empty.

## Testing Steps

After editing `docusaurus.config.ts`:

```bash
# From test-status-site directory
npm run clear  # Clear cache
npm start      # Start dev server
```

Visit: `http://localhost:3000/status`

## Demo Data Contents

When demo data is active, you'll see:

**Services (5 total):**
- API Server (Operational)
- Web Application (Operational)  
- Database Cluster (Operational)
- Payment Gateway (Degraded Performance) ⚠️
- Email Service (Operational)

**Incidents (3 total):**
1. Database Performance Degradation (Resolved, Major)
2. API Rate Limiting Issues (Investigating, Minor)
3. Payment Processing Delays (Identified, Major)

## Verifying Configuration

Check the browser console for confirmation:
- Demo data: `[docusaurus-plugin-stentorosaur] No GitHub token provided, using demo data`
- Real data: `[docusaurus-plugin-stentorosaur] Loaded X services and Y incidents`
- Filtered: Services/incidents counts will reflect visibility settings

## Next Steps

Once you've tested the configurations:
1. Choose your preferred settings
2. Set up GitHub labels for real monitoring
3. Configure GitHub Actions for automated updates
4. Add your GITHUB_TOKEN environment variable
