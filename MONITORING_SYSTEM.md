# Monitoring System Documentation

This document describes the new append-only monitoring architecture implemented in issues #7 and #19.

## Overview

The monitoring system has been redesigned to:
- Use append-only JSONL files to avoid Git history pollution
- Maintain a hot file (`current.json`) for fast site loads
- Store historical data in daily archive files
- Compress old archives to save space

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

#### Monitor Systems (`monitor-systems.yml`)

Runs every 5 minutes to check all configured endpoints using **sequential monitoring** (v0.4.10+).

**Configuration:**

Create `.monitorrc.json` in your repository root:

```json
{
  "systems": [
    {
      "system": "api",
      "url": "https://api.example.com/health"
    },
    {
      "system": "website",
      "url": "https://example.com"
    },
    {
      "system": "admin",
      "url": "https://admin.example.com"
    }
  ]
}
```

**Architecture (v0.4.10+):**

The workflow uses a **single job** that monitors all systems sequentially:

1. Checkout repository
2. Setup Node.js 20
3. Run monitoring script with `--config .monitorrc.json`
4. Script monitors each system sequentially
5. Single commit with all systems' data

**Why Sequential?**

- **Zero data loss**: All systems' data captured in one commit
- **No race conditions**: Only one git push operation
- **No merge conflicts**: Single job eliminates concurrent operations
- **Reliable at scale**: Works with 10+ systems without data loss

**Performance:**
- Runtime: ~5 seconds per system
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
