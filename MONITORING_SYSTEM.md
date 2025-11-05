# Monitoring System Documentation

This document describes the monitoring and status tracking architecture implemented across issues #7, #19, and #33.

## Overview

The monitoring system uses a **three-file architecture** that separates monitoring data from incident tracking:

- **Append-only monitoring data** to eliminate Git history pollution
- **GitHub Issue-based incidents** for structured problem tracking
- **Smart deployment triggers** for critical vs non-critical updates
- **Optimized for performance** with hot files and compression

## Three-File Architecture (v0.4.11+)

### File Structure

```
status-data/
├── current.json          # Time-series monitoring readings (updated every 5min)
├── incidents.json        # Active and resolved incidents from GitHub Issues
├── maintenance.json      # Scheduled maintenance windows
└── archives/
    └── 2025/11/
        ├── history-2025-11-01.jsonl.gz   # Compressed daily archives
        ├── history-2025-11-02.jsonl.gz
        └── history-2025-11-03.jsonl      # Today (uncompressed)
```

### File Details

#### 1. current.json (Monitoring Data)

**Purpose**: Real-time endpoint health checks and response time tracking  
**Updated By**: `monitor-systems.yml` workflow (every 5 minutes)  
**Source**: Automated HTTP checks to configured endpoints  
**Retention**: Rolling 14-day window (~4,000 readings for 5-minute checks)

**Format**: Array of compact readings

```json
[
  {
    "t": 1699123456789,
    "svc": "api",
    "state": "up",
    "code": 200,
    "lat": 145,
    "err": null
  },
  {
    "t": 1699123756789,
    "svc": "website",
    "state": "down",
    "code": 500,
    "lat": 2500,
    "err": "Connection timeout"
  }
]
```

**Fields:**
- `t` - Timestamp (milliseconds since epoch)
- `svc` - Service name (e.g., 'api', 'website', 'database')
- `state` - Status: 'up', 'down', 'degraded', or 'maintenance'
- `code` - HTTP status code
- `lat` - Latency in milliseconds
- `err` - Error message (optional, only present if request failed)

**Commit Strategy**: 
- Committed with `[skip ci]` tag
- Does NOT trigger deployments (filtered by `paths-ignore` in `deploy.yml`)
- Creates critical GitHub Issues when services go down

#### 2. incidents.json (Issue-Based Incidents)

**Purpose**: Track incidents reported via GitHub Issues  
**Updated By**: `status-update.yml` workflow (on issue events + hourly)  
**Source**: GitHub Issues with `status` label  
**Retention**: Active incidents + last 30 days of resolved incidents

**Format**: Array of incident objects

```json
[
  {
    "id": 123,
    "title": "API experiencing high latency",
    "severity": "major",
    "status": "open",
    "systems": ["api", "database"],
    "createdAt": "2025-11-03T10:00:00Z",
    "updatedAt": "2025-11-03T12:30:00Z",
    "closedAt": null,
    "body": "Users reporting slow API responses...",
    "url": "https://github.com/org/repo/issues/123",
    "comments": [
      {
        "author": "devops-bot",
        "createdAt": "2025-11-03T11:00:00Z",
        "body": "Database query optimization in progress"
      }
    ]
  }
]
```

**Severity Levels** (from issue labels):
- `critical` - Complete service outage
- `major` - Significant degradation
- `minor` - Minor issues, partial impact
- `maintenance` - Planned maintenance

**Commit Strategy**:
- Committed with `[skip ci]` tag
- If contains `critical` incidents → triggers `repository_dispatch` event
- `repository_dispatch` triggers immediate deployment (~2 min)

#### 3. maintenance.json (Scheduled Maintenance)

**Purpose**: Track scheduled and completed maintenance windows  
**Updated By**: `status-update.yml` workflow (on issue events + hourly)  
**Source**: GitHub Issues with `maintenance` label and YAML frontmatter  
**Retention**: Upcoming + in-progress + last 60 days of completed

**Format**: Array of maintenance objects

```json
[
  {
    "id": 456,
    "title": "Database upgrade to v2.0",
    "status": "upcoming",
    "systems": ["api", "database"],
    "start": "2025-11-15T02:00:00Z",
    "end": "2025-11-15T04:00:00Z",
    "createdAt": "2025-11-01T10:00:00Z",
    "body": "Scheduled database upgrade to improve performance...",
    "url": "https://github.com/org/repo/issues/456"
  }
]
```

**Status Calculation**:
- `upcoming` - Start time is in the future
- `in-progress` - Current time between start and end
- `completed` - End time has passed OR issue is closed

**Issue Format**:

Create a GitHub issue with the `maintenance` label and YAML frontmatter:

```markdown
---
start: 2025-11-15T02:00:00Z
end: 2025-11-15T04:00:00Z
systems:
  - api
  - database
---

Scheduled database upgrade to improve performance.

**Expected Impact:**
- API will be unavailable during the maintenance window
```

**Commit Strategy**:
- Committed with `[skip ci]` tag
- Does NOT trigger immediate deployment
- Picked up by hourly scheduled deployment

## Architecture

### Data Format

#### Current Data (`current.json`)
A rolling 14-day window of all monitoring readings in a compact format:

```json
[
  {
    "t": 1699123456789,
    "svc": "api",
    "state": "up",
    "code": 200,
    "lat": 145,
    "err": null
  },
  {
    "t": 1699123756789,
    "svc": "website",
    "state": "down",
    "code": 500,
    "lat": 2500,
    "err": "Connection timeout"
  }
]
```

**Fields:**
- `t` - Timestamp (milliseconds since epoch)
- `svc` - Service name (e.g., 'api', 'website', 'database')
- `state` - Status: 'up', 'down', 'degraded', or 'maintenance'
- `code` - HTTP status code
- `lat` - Latency in milliseconds
- `err` - Error message (optional, only present if request failed)

#### Archive Files (`archives/YYYY/MM/history-YYYY-MM-DD.jsonl`)

Daily JSONL files containing all readings for that day. Each line is a complete JSON object:

```jsonl
{"t":1699123456789,"svc":"api","state":"up","code":200,"lat":145}
{"t":1699123756789,"svc":"website","state":"up","code":200,"lat":98}
{"t":1699124056789,"svc":"database","state":"degraded","code":200,"lat":850}
```

**Archive Structure:**
```
build/status-data/
├── current.json                           # Hot file (14-day rolling window)
└── archives/
    └── 2025/
        └── 11/
            ├── history-2025-11-01.jsonl.gz   # Compressed (yesterday and older)
            ├── history-2025-11-02.jsonl.gz   # Compressed
            └── history-2025-11-03.jsonl      # Uncompressed (today)
```

### Monitoring Script

The monitoring script (`scripts/monitor.js`) performs the following tasks:

1. **Check Endpoint** - Make HTTP request and measure response time
2. **Determine Status** - Calculate status (up/down/degraded) based on response
3. **Append to JSONL** - Write one line to today's `history-YYYY-MM-DD.jsonl` file
4. **Rebuild current.json** - Scan last 14 days and rebuild the hot file
5. **Generate Commit Message** - Create emoji-decorated message for Git commit

**Usage:**

```bash
# Single system check
node scripts/monitor.js --system api --url https://api.example.com/health

# Multiple systems from config file
node scripts/monitor.js --config .monitorrc.json

# With custom options
node scripts/monitor.js \
  --system website \
  --url https://example.com \
  --method GET \
  --timeout 10000 \
  --expected-codes 200,301,302 \
  --max-response-time 30000 \
  --output-dir status-data \
  --verbose
```

**Options:**
- `--system <name>` - System name (e.g., 'api', 'website')
- `--url <url>` - URL to monitor
- `--method <method>` - HTTP method (default: GET)
- `--timeout <ms>` - Request timeout in milliseconds (default: 10000)
- `--expected-codes <codes>` - Comma-separated expected status codes (default: 200,301,302)
- `--max-response-time <ms>` - Maximum response time before degraded (default: 30000)
- `--output-dir <path>` - Output directory (default: status-data)
- `--config <file>` - JSON config file with system definitions
- `--verbose` - Enable verbose logging

### Workflows

The monitoring system uses three coordinated workflows:

#### 1. Monitor Systems (`monitor-systems.yml`)

**Trigger**: Every 5 minutes (cron: `*/5 * * * *`)

**Purpose**: Check endpoint health and update monitoring data

**Process**:
1. Checkout repository
2. Setup Node.js 20
3. Run monitoring script with `--config .monitorrc.json`
4. Script monitors each system sequentially
5. Append readings to `archives/YYYY/MM/history-YYYY-MM-DD.jsonl`
6. Rebuild `current.json` from last 14 days
7. Commit with `[skip ci]` tag
8. If critical failure detected → Create GitHub Issue with `critical` + `status` labels

**Configuration**: `.monitorrc.json` in repository root

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

**Sequential Architecture (v0.4.10+)**:
- Single job monitors all systems in sequence
- Zero data loss (no race conditions)
- Single commit with all data
- Runtime: ~5 seconds per system

**Commit Message**: `Update monitoring data [skip ci]`

**Critical Issue Creation**:
- When service goes down → Automatically creates GitHub Issue
- Labels: `status`, `critical`, `<service-name>`
- Title: `🔴 <Service> is down`
- Triggers `status-update.yml` via issue event

#### 2. Status Update (`status-update.yml`)

**Trigger**: 
- GitHub Issue events (opened, closed, labeled, edited)
- Schedule: Every hour (cron: `0 * * * *`)
- Manual: `workflow_dispatch`

**Purpose**: Generate incidents.json and maintenance.json from GitHub Issues

**Process**:
1. Checkout repository
2. Setup Node.js 20
3. Run `npx stentorosaur-update-status --write-incidents --write-maintenance`
4. Fetch all GitHub Issues with `status` or `maintenance` labels
5. Generate `incidents.json` (active + last 30 days resolved)
6. Generate `maintenance.json` (upcoming + in-progress + last 60 days)
7. Commit with `[skip ci]` tag
8. **Smart Deployment Trigger**:
   - If `incidents.json` contains `critical` incidents → Dispatch `repository_dispatch` event
   - Event type: `status-updated`
   - Triggers immediate deployment via `deploy.yml`

**CLI Command**:
```bash
npx stentorosaur-update-status \
  --write-incidents \
  --write-maintenance \
  --output-dir status-data \
  --verbose
```

**Commit Message**: `Update status data [skip ci]`

**Critical Dispatch Logic**:
```yaml
- name: Trigger deployment for critical incidents
  if: contains(github.event.issue.labels.*.name, 'critical')
  uses: peter-evans/repository-dispatch@v2
  with:
    event-type: status-updated
    token: ${{ secrets.GITHUB_TOKEN }}
```

#### 3. Deploy Workflows

**Two deployment workflows work together**:

##### deploy.yml (Immediate Deployment)

**Triggers**:
- `push` to `main` branch (code changes)
- `repository_dispatch` with type `status-updated` (critical incidents)
- `workflow_dispatch` (manual)

**Path Filtering (v0.4.13+)**:
```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'status-data/current.json'
      - 'status-data/archives/**'
  repository_dispatch:
    types: [status-updated]
```

**Result**:
- Monitoring commits (every 5 min) → **NOT deployed**
- Code changes → **Deployed immediately**
- Critical incidents → **Deployed immediately** (~2 min)

##### deploy-scheduled.yml (Hourly Deployment)

**Trigger**: Schedule every hour (cron: `0 * * * *`)

**Purpose**: Pick up non-critical status updates

**Process**:
1. Checkout repository with all status files
2. Build Docusaurus site (plugin reads 3 status files)
3. Deploy to GitHub Pages

**Result**:
- Non-critical incidents → **Deployed within 1 hour**
- Maintenance updates → **Deployed within 1 hour**

### Workflow Interaction Diagram

```
Every 5 min:
  monitor-systems.yml
    ↓ Check endpoints
    ↓ Update current.json
    ↓ Commit [skip ci]
    ↓ NO DEPLOYMENT
    ↓ If critical down
    ↓ Create Issue → Triggers status-update.yml

On Issue Events + Hourly:
  status-update.yml
    ↓ Fetch GitHub Issues
    ↓ Generate incidents.json + maintenance.json
    ↓ Commit [skip ci]
    ↓ Check for critical
    ├─ Critical → repository_dispatch → deploy.yml (immediate)
    └─ Non-critical → Wait for deploy-scheduled.yml (hourly)

Deployment:
  deploy.yml (immediate)
    ↓ Triggered by: code push, repository_dispatch, manual
    ↓ Ignores: current.json, archives/**
    ↓ Reads: incidents.json, maintenance.json
    ↓ Build + Deploy
  
  deploy-scheduled.yml (hourly)
    ↓ Triggered by: schedule
    ↓ Reads: current.json, incidents.json, maintenance.json
    ↓ Build + Deploy
```

### Data Flow Summary

| Event | Workflow | Files Updated | Deployment | Latency |
|-------|----------|---------------|------------|---------|
| Endpoint check (every 5m) | `monitor-systems.yml` | `current.json` | None | N/A |
| Critical endpoint down | `monitor-systems.yml` | `current.json` + creates Issue | Via `status-update.yml` → `deploy.yml` | ~2 min |
| Issue opened/closed | `status-update.yml` | `incidents.json`, `maintenance.json` | `deploy.yml` if critical, else hourly | 2 min / 1 hour |
| Hourly check | `status-update.yml` | `incidents.json`, `maintenance.json` | `deploy-scheduled.yml` | 1 hour |
| Code push to main | N/A | N/A | `deploy.yml` | ~5 min |

### Workflows
- 2 systems: ~10s total (vs 5s parallel with 50% data loss)
- 10 systems: ~50s total (vs 5s parallel with 90% data loss)
- Still completes within 5-minute cron interval for most deployments

**Commit Messages:**
- Single commit contains summary: `Update monitoring data [skip ci]`
- Check output shows: 🟩 `api is up (200 in 145 ms)`, 🟨 `website degraded`, etc.

#### Compress Archives (`compress-archives.yml`)

Runs daily at 00:05 UTC to compress yesterday's JSONL files.

**Steps:**
1. Checkout repository
2. Find yesterday's uncompressed JSONL file
3. Compress with gzip
4. Commit with message: `📦 Compress archive for YYYY-MM-DD`

**File Lifecycle:**
- **Today** - `history-2025-11-03.jsonl` (uncompressed, actively appending)
- **Tomorrow** - File becomes `history-2025-11-03.jsonl.gz` (compressed, read-only)

### Data Consumption

The plugin's `loadHistoricalData()` function has been updated to read from `current.json`:

```typescript
// Fetch current.json (14-day rolling window)
const response = await fetch(`/${dataPath}/current.json`);
const readings: CompactReading[] = await response.json();

// Filter by service name
const serviceReadings = readings.filter(r => r.svc === 'api');

// Convert to legacy format for backward compatibility
const history = serviceReadings.map(r => ({
  timestamp: new Date(r.t).toISOString(),
  status: r.state,
  code: r.code,
  responseTime: r.lat,
}));
```

**Fallback:** If `current.json` doesn't exist, the function falls back to the legacy `systems/*.json` format.

## Benefits

### 1. No Git History Pollution
- Each check appends **one line** to today's JSONL file
- Only one file changes per check (not entire JSON array)
- Git diffs are minimal and readable

### 2. Fast Site Loads
- `current.json` contains only last 14 days (~4,000 readings for 5-minute checks)
- Small file size (~200-400 KB) loads quickly
- No need to parse years of historical data

### 3. Efficient Storage
- Daily JSONL files are compressed after 24 hours
- Gzip compression typically achieves 80-90% reduction
- Old data remains accessible but doesn't bloat repository

### 4. Simple Append Operations
- No JSON parsing/stringifying for every check
- Just append one line: `echo '{"t":...}' >> file.jsonl`
- Works efficiently even with large files

### 5. Easy to Query
- JSONL is line-oriented, perfect for streaming
- Can use `grep`, `jq`, or other CLI tools
- Easy to merge multiple days for analysis

## Migration from Legacy Format

The plugin automatically detects and supports both formats:

1. **New format** (`current.json`) - Used if available
2. **Legacy format** (`systems/*.json`) - Fallback for backward compatibility

**No migration required** - Start using the new monitoring script and it will create the new format. The plugin will automatically use it once `current.json` exists.

## Configuration Example

Create `.monitorrc.json` in your repository root:

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
    },
    {
      "system": "website",
      "url": "https://example.com",
      "method": "GET",
      "timeout": 10000,
      "expectedCodes": [200],
      "maxResponseTime": 30000
    }
  ]
}
```

Then update your workflow to use it:

```yaml
- name: Monitor all systems
  run: node scripts/monitor.js --config .monitorrc.json
```

## Troubleshooting

### No data appearing in current.json

1. Check that `status-data/archives/` directory exists
2. Verify monitoring script is running (check GitHub Actions logs)
3. Ensure workflow has `contents: write` permission

### Old format still being used

1. Delete `status-data/systems/*.json` files
2. Wait for next monitoring run to create `current.json`
3. Plugin will automatically switch to new format

### Archive compression not working

1. Check that `compress-archives.yml` workflow is enabled
2. Verify it's running daily (check workflow runs)
3. Ensure yesterday's JSONL file exists before compression

## Performance Characteristics

**Monitoring Script:**
- HTTP request: ~100-500ms (depends on endpoint)
- JSONL append: ~1-5ms (simple file write)
- current.json rebuild: ~50-200ms (scan 14 days)
- Total time per check: ~200-700ms

**Data Loading:**
- current.json fetch: ~50-200ms (200-400 KB file)
- Parsing 4,000 readings: ~10-30ms
- Total load time: ~100-300ms

**Storage:**
- One day of 5-minute checks: ~50 KB uncompressed
- After gzip: ~5-10 KB compressed
- 14 days in current.json: ~200-400 KB
- One year of archives: ~2-4 MB (compressed)

## Future Enhancements

Issue #7 proposes creating a reusable GitHub Action (similar to Upptime's `upptime/uptime-monitor@v1.41.0`). This would:

- Package the monitoring script as a Docker action
- Provide standardized configuration
- Make it easy to use in any repository
- Support advanced features (Globalping, custom checks, etc.)

Example usage:
```yaml
- uses: amiable-dev/status-monitor-action@v1
  with:
    systems: |
      api: https://api.example.com/health
      website: https://example.com
```

## Related Issues

- Issue #7: Create reusable GitHub Action for endpoint monitoring
- Issue #19: Status Data Optimization with hot file + daily archives
- Issue #22: Add Globalping configuration options
- Issue #23: Implement ICMP ping support
