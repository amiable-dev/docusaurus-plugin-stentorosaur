# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stentorosaurus** is a development workspace for porting [Upptime](https://github.com/upptime/upptime) functionality into a Docusaurus v3 plugin. The plugin creates status monitoring dashboards that combine GitHub Issues for incident tracking with GitHub Actions for automated monitoring, all integrated into Docusaurus documentation sites.

**Package Name**: `@amiable-dev/docusaurus-plugin-stentorosaur`

**Port Status**: This is an approximate port of Upptime, adapting its status page and monitoring concepts to work as a native Docusaurus plugin rather than a standalone Svelte site.

**Key Innovation**: Unlike traditional uptime monitors, this plugin tracks both technical system status (APIs, databases) AND business process issues (onboarding, deployments) directly in documentation sites.

## Repository Structure

This workspace contains three main directories that work together for development and testing:

```
Stentorosaurus/
├── docusaurus-plugin-stentorosaur/  # 🎯 MAIN: Plugin codebase (npm package)
│   ├── src/                          # TypeScript plugin source
│   ├── lib/                          # Compiled output (generated, don't edit)
│   ├── __tests__/                    # Jest test suite
│   ├── scripts/                      # CLI tools (monitor.js, update-status.cjs)
│   └── templates/                    # GitHub Actions workflow templates
│
├── test-status-site/                 # 🧪 TEST: Docusaurus site for testing plugin
│   ├── docusaurus.config.ts         # Uses local plugin via file: dependency
│   ├── status-data/                  # Generated status data for testing
│   └── [standard Docusaurus structure]
│
├── upptime/                          # 📚 REFERENCE: Original Upptime implementation
│   ├── api/                          # Upptime's API endpoints
│   ├── graphs/                       # Response time graphs
│   └── history/                      # Historical status data
│
└── uptime-monitor/                   # 🔧 UTIL: Forked Upptime monitor package
    └── src/                          # GitHub Actions monitoring logic
```

### Workspace Purpose

- **`docusaurus-plugin-stentorosaur/`** - The main plugin under active development. All code changes happen here.
- **`upptime/`** - Reference implementation for comparison during porting. Use this to understand how Upptime works.
- **`test-status-site/`** - Live testing environment. Deploy and test the plugin in a real Docusaurus site.
- **`uptime-monitor/`** - Forked monitoring utilities from Upptime, used for reference.

### Development Workflow

1. **Make changes** in `docusaurus-plugin-stentorosaur/src/`
2. **Build plugin**: `cd docusaurus-plugin-stentorosaur && npm run build`
3. **Test locally**: `cd test-status-site && npm start`
4. **Compare with Upptime**: Reference `upptime/` directory for original behavior
5. **Run tests**: `cd docusaurus-plugin-stentorosaur && npm test`

**Active Development Focus**: Work in `docusaurus-plugin-stentorosaur/` - this is the npm package being built.

## Build System

### Plugin Build (TypeScript → JavaScript)

```bash
cd docusaurus-plugin-stentorosaur
npm run build        # Compiles TS + copies CSS files
npm run watch        # Watch mode for development
```

**Critical**: Build is THREE steps (v0.10.4+):
1. `node scripts/generate-version.js` → Generates `src/version.ts` from `package.json`
2. `tsc --build` → Compiles `.ts` files to `lib/`
3. `node copyUntypedFiles.js` → Copies `.css` files (TypeScript ignores these)

**Never edit `lib/` or `src/version.ts` directly** - they're generated. Always edit `src/` and rebuild.

### Test Site (Docusaurus)

```bash
cd test-status-site
npm start            # Development server (port 3000)
npm run build        # Production build
npm run serve        # Serve production build
```

**Important**: Test site uses local plugin via `"file:../docusaurus-plugin-stentorosaur"` dependency.

## Porting from Upptime

When implementing features or fixing bugs, reference the original Upptime implementation in the `upptime/` directory.

### Upptime vs Stentorosaur Comparison

| Aspect | Upptime (Original) | Stentorosaur (Port) |
|--------|-------------------|---------------------|
| **Framework** | Svelte + Sapper | React + Docusaurus |
| **Status Page** | Standalone GitHub Pages site | Integrated `/status` route in Docusaurus |
| **Data Storage** | Files in `history/`, `api/`, `graphs/` | `status-data/` with JSONL archives |
| **Configuration** | `.upptimerc.yml` | `docusaurus.config.js` plugin options |
| **Monitoring** | `upptime/uptime-monitor` package | `scripts/monitor.js` + GitHub Actions |
| **Issue Tracking** | GitHub Issues with auto-open/close | GitHub Issues with enhanced maintenance support |

### Key Architectural Differences

1. **Plugin vs Standalone**: Stentorosaur is a Docusaurus plugin, not a separate site
2. **React Components**: Upptime's Svelte components are reimplemented as React in `src/theme/`
3. **Append-Only Archives**: Stentorosaur uses JSONL archives instead of YAML history files
4. **Three-File System**: Separated `current.json`, `incidents.json`, `maintenance.json` for efficiency
5. **Extended Features**: Added scheduled maintenance, SLI/SLO tracking, chart exports

### When to Reference Upptime

- **Implementing new features**: Check if Upptime has similar functionality
- **Understanding workflows**: See how Upptime's GitHub Actions work
- **Debugging monitoring logic**: Compare health check implementation
- **Status calculation**: Verify how Upptime determines system status from issues

**Note**: Stentorosaur is an *approximate* port - not all Upptime features are implemented, and some behaviors differ intentionally to better fit Docusaurus.

## Testing

### Running Tests

```bash
cd docusaurus-plugin-stentorosaur
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Test Configuration

- **Framework**: Jest with ts-jest preset
- **Coverage Thresholds**: 70% branches, 80% functions/lines/statements
- **Excluded**: `src/theme/**/*.tsx` components (would need jsdom)
- **Mocking**: `@octokit/rest` is always mocked - never make real API calls in tests

### Test Files Location

- Tests live in `__tests__/` directory
- Pattern: `**/__tests__/**/*.test.ts` or `*.test.tsx`
- Use fixtures from `__tests__/fixtures/` for test data

## Publishing Workflow

**IMPORTANT**: Never run `npm publish` locally - always use GitHub Actions!

### Release Process

1. Update version in `package.json` (follow SemVer)
2. Update `CHANGELOG.md` (move Unreleased items to new version section)
3. Commit: `git commit -m "chore: Bump version to X.Y.Z"`
4. Create and push tag: `git tag vX.Y.Z && git push && git push --tags`
5. GitHub Actions automatically publishes to npm

**Publishing Details**:
- Uses trusted publishing with npm OIDC tokens (npm 11.5.1+ required)
- Workflow: `.github/workflows/publish.yml`
- Triggered only on tag push matching version in package.json

## Docusaurus Plugin Architecture

### Plugin Lifecycle Hooks

```typescript
// src/index.ts - Main plugin orchestration
export default function pluginStatus(context, options) {
  return {
    name: 'docusaurus-plugin-stentorosaur',

    // 1. LOAD CONTENT - Fetch GitHub Issues, transform to StatusData
    async loadContent() {
      // Checks for committed status data in status-data/
      // Falls back to GitHub API if data is stale or missing
      // Returns StatusData with items + incidents
    },

    // 2. CONTENT LOADED - Create route, pass data as props
    async contentLoaded({ content, actions }) {
      // Creates /status route
      // Passes data to StatusPage component
    },

    // 3. POST BUILD - Copy status data to build output
    async postBuild({ outDir }) {
      // Copies status.json to build/status-data/ for client access
    }
  };
}
```

### Data Flow Architecture

**Three-File System** (v0.4.11+):

```
status-data/
├── current.json       # Time-series monitoring (every 5min, 14-day window)
├── incidents.json     # Active/resolved incidents from GitHub Issues
└── maintenance.json   # Scheduled maintenance windows
```

**Why Three Files?**
- Separation of concerns (monitoring vs incidents)
- Smart deployments (critical incidents trigger immediate deploy, monitoring doesn't)
- Performance (only load incident data when needed)
- Reduced CI noise (monitoring commits use `[skip ci]`)

### Append-Only Monitoring Architecture (v0.4.0+)

```
status-data/
├── current.json                        # Hot file (14-day rolling window, ~200-400 KB)
└── archives/
    └── 2025/11/
        ├── history-2025-11-01.jsonl.gz # Compressed (yesterday+)
        ├── history-2025-11-02.jsonl.gz # Compressed
        └── history-2025-11-03.jsonl    # Today (uncompressed)
```

**Benefits**:
- No Git history pollution (append-only JSONL files)
- Fast site loads (small current.json)
- Automatic compression (80-90% reduction)
- Clean commit history

## GitHub Actions Workflows

### Monitoring Workflow (`monitor-systems.yml`)

**Trigger**: Every 5 minutes (configurable)
**Purpose**: Check endpoint health, append to archives

```yaml
- name: Monitor all systems
  run: |
    npx -y -p @amiable-dev/docusaurus-plugin-stentorosaur stentorosaur-monitor \
      --config .monitorrc.json \
      --verbose
```

**Configuration** (`.monitorrc.json`):
```json
{
  "systems": [
    {
      "system": "api",
      "url": "https://api.example.com/health",
      "method": "GET",
      "timeout": 10000,
      "expectedCodes": [200, 301, 302],
      "maxResponseTime": 30000
    }
  ]
}
```

**Sequential vs Parallel**:
- Uses **sequential** monitoring (v0.4.10+)
- Eliminates race conditions and data loss
- Trade-off: ~5s per system vs potential 90% data loss with parallel

### Status Update Workflow (`status-update.yml`)

**Trigger**: Issue events (opened/closed/labeled) + hourly schedule
**Purpose**: Fetch issues, generate incidents.json + maintenance.json

**Key Permissions**:
```yaml
permissions:
  issues: write     # Required for creating/closing issues
  contents: write   # Required for committing data
```

### Deployment Workflow (`deploy.yml`)

**Smart Triggers**:
- Push to main (code changes)
- `repository_dispatch: status-updated` (critical incidents)
- Hourly schedule (non-critical updates)
- Manual `workflow_dispatch`

**Path Filtering**:
```yaml
paths-ignore:
  - 'status-data/current.json'
  - 'status-data/archives/**'
```

Monitoring commits don't trigger deployments.

## Issue Label System

### Required Labels

- `status` - Identifies status-tracking issues

### Entity Labels

Entities are identified via namespaced labels or legacy labels:

**Namespaced Labels** (default):
```javascript
entities: [
  { name: 'api', type: 'system' },
  { name: 'onboarding', type: 'process' },
]

// GitHub issue labels:
'system:api'           // Links to API system
'process:onboarding'   // Links to onboarding process
```

**Legacy Labels** (for backward compatibility):
```javascript
labelScheme: 'legacy'

// GitHub issue labels:
'api'         // Links to api entity (defaults to type='system')
'onboarding'  // Links to onboarding entity
```


### Severity Labels

- `critical` - Complete outage (status: `down`)
- `major` - Significant degradation (status: `degraded`)
- `minor` - Partial issues (status: `degraded`)
- `maintenance` - Planned work (status: `maintenance`)

### Status Calculation Logic

```typescript
// src/github-service.ts generateStatusItems()
// 1. Initialize all entities as 'up'
// 2. For each OPEN incident:
//    - Extract affected entities from labels (via LabelParser)
//    - If severity='critical' → status='down'
//    - If severity='major'/'minor' → status='degraded'
//    - If severity='maintenance' → status='maintenance'
// 3. Worst status wins (down > degraded > maintenance > up)
```

## CLI Tools

### stentorosaur-monitor

**Purpose**: Run health checks, append to archives, rebuild current.json

```bash
npx stentorosaur-monitor --config .monitorrc.json --verbose
```

**Location**: `scripts/monitor.js`

### stentorosaur-update-status

**Purpose**: Fetch issues, generate status data files

```bash
npx stentorosaur-update-status --write-incidents --write-maintenance --verbose
```

**Options**:
- `--output-dir <path>` - Custom output directory (default: `status-data`)
- `--verbose` - Detailed logging
- `--commit` - Auto-commit with emoji messages (🟩🟨🟥📊)
- `--write-incidents` - Generate incidents.json
- `--write-maintenance` - Generate maintenance.json

**Location**: `scripts/update-status.cjs`

## Key Source Files

### Core Plugin Files

- `src/index.ts` - Plugin orchestration and lifecycle hooks
- `src/github-service.ts` - GitHub API integration (Octokit wrapper)
- `src/types.ts` - TypeScript interfaces (StatusItem, StatusIncident, StatusData)
- `src/options.ts` - Plugin configuration schema with Joi validation
- `src/demo-data.ts` - Demo data for testing without GitHub token

### Monitoring System

- `src/historical-data.ts` - Read/write monitoring archives
- `src/time-utils.ts` - Date/time utilities
- `src/maintenance-utils.ts` - Maintenance window parsing

### Utilities

- `src/utils/annotation-utils.ts` - Chart annotation conversion and extensible event system
- `src/utils/markdown.ts` - Markdown rendering with DOMPurify sanitization
- `scripts/generate-version.js` - Auto-generates `src/version.ts` from `package.json`

### Theme Components

All swizzleable React components in `src/theme/`:

- `StatusPage/` - Main status dashboard
- `StatusBoard/` - System status cards
- `StatusItem/` - Individual system card
- `IncidentHistory/` - Incident timeline with markdown rendering
- `PerformanceMetrics/` - Interactive charts
- `ChartPanel/` - Embeddable chart container
- `ResponseTimeChart/` - Response time line chart
- `UptimeChart/` - Uptime bar/heatmap chart with extensible annotations
- `SLIChart/` - SLI/SLO compliance tracking
- `MiniHeatmap/` - 90-day uptime mini charts on status cards
- `UptimeStatusPage/` - Upptime-style layout
- `MaintenanceList/` - Scheduled maintenance display with markdown rendering

**CSS Modules**: All styles use `styles.module.css` pattern

## Common Development Tasks

### Adding a New Configuration Option

1. Add to `PluginOptions` interface in `src/types.ts`
2. Add default value in `src/options.ts` DEFAULT_OPTIONS
3. Add Joi validation in `src/options.ts` pluginOptionsSchema
4. Use in `src/index.ts` plugin lifecycle
5. Add tests in `__tests__/options.test.ts`

### Modifying GitHub Data Fetching

Edit `src/github-service.ts` GitHubStatusService class:
- `fetchStatusIssues()` - Octokit API call
- `convertIssueToIncident()` - Issue → StatusIncident transform
- `generateStatusItems()` - Aggregate logic for system status

**Always maintain demo data compatibility** - update `src/demo-data.ts` if changing data structure.

### Creating a New Theme Component

1. Create in `src/theme/ComponentName/index.tsx` + `styles.module.css`
2. Export component with proper TypeScript types
3. Add to `getSwizzleComponentList()` in `src/index.ts` for user customization
4. Remember: Build copies CSS via `copyUntypedFiles.js`

## External Dependencies

### Docusaurus-Specific

- `@docusaurus/core` v3.0+ - Plugin API
- `@docusaurus/types` - TypeScript types
- `@docusaurus/utils` - `normalizeUrl()` for route creation
- Must use `@theme/Layout` wrapper for pages

### GitHub Integration

- `@octokit/rest` v20+ - GitHub API client
- Requires `GITHUB_TOKEN` env var or `token` config for private repos
- Rate limit: 5000/hour authenticated, 60/hour unauthenticated

### Charting Libraries

- `chart.js` v4.5+ - Canvas-based charts
- `react-chartjs-2` v5.3+ - React wrapper for Chart.js
- `chartjs-plugin-annotation` v3.1+ - Annotation overlays (SLO targets, maintenance windows, incidents)

### Markdown Rendering

- `marked` v17+ - GitHub-flavored markdown parser
- `dompurify` v3.3+ - XSS protection for user-generated HTML
- Used for rendering incident and maintenance descriptions with full markdown formatting

### Build Tools

- TypeScript 5.x with `strict: true`
- Jest 30.x with ts-jest preset
- `fs-extra` for file operations (use async: `ensureDir`, `writeJson`)

## Demo Data Pattern

```typescript
// src/index.ts loadContent()
let shouldUseDemoData = useDemoData ?? !token;  // Default: true if no token

if (shouldUseDemoData) {
  const demoData = getDemoStatusData();
  items = showServices ? demoData.items : [];
  incidents = showIncidents ? demoData.incidents : [];
} else {
  // Fetch from GitHub API with fallback to demo on error
}
```

**Pattern**: Always provide usable demo data when GitHub token missing or API fails. This enables development/testing without credentials.

## Configuration Patterns

### Development/Demo

```typescript
{
  title: 'Demo Status',
  useDemoData: true,  // Shows demo services and incidents
}
```

### Production

```typescript
{
  owner: 'your-org',
  repo: 'status-tracking',
  token: process.env.GITHUB_TOKEN,
  entities: [
    { name: 'api', type: 'system' },
    { name: 'web', type: 'system' },
    { name: 'database', type: 'system' },
  ],
  useDemoData: false,
}
```

### Upptime-Style Layout

```typescript
{
  statusView: 'upptime',  // Use structured layout
  uptimeConfig: {
    sections: [
      { id: 'active-incidents', enabled: true },
      { id: 'live-status', enabled: true },
      { id: 'scheduled-maintenance', enabled: true },
      { id: 'past-incidents', enabled: true },
    ],
  },
  scheduledMaintenance: {
    enabled: true,
    label: 'maintenance',
  },
}
```

## Maintenance Ticket Format

Create GitHub issues with `maintenance` label and YAML frontmatter using human-friendly dates:

```markdown
---
start: @tomorrow 2am UTC
end: @tomorrow 4am UTC
---

Database migration to improve query performance.

**Impact:**
- API in read-only mode
- No new registrations during maintenance
```

**Labels**: `maintenance`, `api`, `website` (entity labels - can use simple or namespaced)

**Supported Date Formats**:
- Human-friendly: `@tomorrow 2am UTC`, `tomorrow at 2pm`, `next Monday 9am`
- Relative: `+2h`, `in 3 hours`, `+30m`
- ISO 8601: `2025-11-10T02:00:00Z`

**Status Determination**:
- Upcoming: Start time in future
- In Progress: Current time between start and end
- Completed: End time passed OR issue closed

## Environment Variables

### Required for Production

- `GITHUB_TOKEN` - GitHub API token (must pass via `env:` block in CI)

### Optional

- `NODE_ENV` - Set to `production` for production builds

**GitHub Actions Setup**:
```yaml
- name: Build website
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # ← Critical!
  run: npm run build
```

## Debugging Tips

### Plugin not loading

- Check `owner`/`repo` config - falls back to `siteConfig.organizationName`/`projectName`
- Verify TypeScript compilation succeeded: `npm run build`
- Look for `[docusaurus-plugin-stentorosaur]` console logs during build

### Status data not updating

- Check generated file: `.docusaurus/docusaurus-plugin-stentorosaur/status.json`
- Verify GitHub token has repo access
- Ensure GitHub Actions workflows have required permissions

### CSS not applied

- Ensure `copyUntypedFiles.js` ran after TypeScript compilation
- Check `lib/theme/**/*.css` files exist
- CSS Modules: Use `import styles from './styles.module.css'` pattern

### Production shows demo data

**Most common issue**: Forgot to pass `GITHUB_TOKEN` in build step's `env:` block.

## Performance Considerations

### Chart Data Export

All charts include export functionality:
- CSV format for spreadsheet analysis
- JSON format for programmatic processing
- Client-side generation (no server load)
- Accessible via download buttons on each chart

### Interactive Metrics

- Click system cards to show/hide performance metrics
- Charts support fullscreen zoom
- Period selection synchronized across all charts
- Responsive layouts (2x2 grid on desktop, vertical stack on mobile)

## Important Copilot Instructions

From `.github/copilot-instructions.md`:

1. **Build Process**: Always run both TypeScript compilation AND CSS copying
2. **Demo Data Fallback**: Maintain usable demo data for development without tokens
3. **Testing**: Mock `@octokit/rest` - never make real API calls
4. **Theme Components**: CSS files must use `.module.css` extension
5. **Publishing**: Never use `npm publish` locally - always via GitHub Actions
6. **Status Update Workflow**: Sequential monitoring eliminates race conditions
7. **Deployment Triggers**: Critical incidents deploy immediately, monitoring commits don't

## Quick Navigation Guide

### Working on Plugin Code
```bash
cd docusaurus-plugin-stentorosaur/
# Main source: src/
# Tests: __tests__/
# Scripts: scripts/
```

### Testing the Plugin
```bash
cd test-status-site/
npm start  # Opens http://localhost:3000
# Visit http://localhost:3000/status to see plugin in action
```

### Referencing Original Upptime
```bash
cd upptime/
# Check api/, graphs/, history/ for original implementation
# Compare with docusaurus-plugin-stentorosaur/ to see porting differences
```

### Workflow Templates
```bash
cd docusaurus-plugin-stentorosaur/templates/workflows/
# monitor-systems.yml - Health check monitoring
# status-update.yml - Issue-based status updates
# compress-archives.yml - Daily archive compression
```

## Directory Aliases for Reference

When discussing the project, use these clear aliases:
- `@plugin/` = `docusaurus-plugin-stentorosaur/`
- `@test-site/` = `test-status-site/`
- `@upptime/` = `upptime/` (original reference implementation)
- `@monitor/` = `uptime-monitor/` (forked monitoring utilities)
