# ADR-002: Historical Data Aggregation for Status Page Charts

## Status
APPROVED (with refinements)

## Council Review
Reviewed by LLM Council (2026-01-01) with high confidence tier.
- **Verdict**: Approved - Option D is the correct architectural pattern
- **Condition**: Must address "Stale Today" problem with hybrid read pattern

## Context

The Stentorosaur status page displays a 90-day heatmap showing system uptime history. The current implementation has a critical gap:

**The 90-day heatmap is 84% empty.** The UI promises a 3-month trend but renders only 14 days because it relies exclusively on high-resolution, short-retention data (`current.json`). We need to visualize 90 days of history without incurring the performance penalty of 90 HTTP requests or the bandwidth cost of serving months of raw logs.

### Current Data Model
- **current.json**: Rolling 14-day window of raw readings (~700 entries per service, ~50KB)
- **Archives**: Daily JSONL files in `archives/YYYY/MM/history-YYYY-MM-DD.jsonl.gz` (~2KB each compressed)
- **Gap**: Heatmap reads only from `current.json`, ignoring 76 days of archived data

### Constraints
- Status page is fully static (Docusaurus/GitHub Pages)
- No backend infrastructure
- Must load fast on mobile (<2 seconds)
- Monitoring runs every 10 minutes via GitHub Actions

### Current Data Flow
```
Monitor (every 10 min) → Append to current.json → Nightly: rotate old entries to archives
                                                          ↓
                                          archives/2025/12/history-2025-12-20.jsonl.gz
```

## Decision Drivers

1. **Performance**: Page load time should remain under 2 seconds
2. **Cost**: Minimize compute/bandwidth for static hosting
3. **Simplicity**: Prefer solutions that don't add infrastructure
4. **Accuracy**: Display real historical data, not empty placeholders
5. **Freshness**: Today's data should be live, not stale

## Options Considered

### Option A: Load Archives at Runtime
Fetch individual archive files (up to 90 gzipped JSONL files) in the browser.

| Pros | Cons |
|------|------|
| Uses existing data | 90 HTTP requests per page load |
| No build changes | Browser gzip decompression |
| Always current | Poor mobile performance (~5-10s load) |

**Verdict**: Rejected - too slow for production use.

### Option B: Expand current.json to 90 Days
Increase the rolling window from 14 to 90 days.

| Pros | Cons |
|------|------|
| Simple implementation | ~15MB file size |
| Single file fetch | Slow initial page load |
| No aggregation logic | Wastes bandwidth (heatmap only needs daily summaries) |

**Verdict**: Rejected - inefficient; sends raw data when only aggregates are needed.

### Option C: Build-Time Aggregation
Generate aggregated summary during Docusaurus build by reading archives.

| Pros | Cons |
|------|------|
| Fast page load | Stale until next deploy |
| Small output file | Build time increases |
| Uses existing archives | Complex build logic |

**Verdict**: Viable but couples data freshness to deploy frequency.

### Option D: Daily Summary File (Recommended)
Generate a `daily-summary.json` file during the monitoring workflow.

| Pros | Cons |
|------|------|
| Tiny file (~10KB for 90 days) | New file to maintain |
| Fast page load | Slight monitor complexity |
| Always current (updates each run) | Requires hybrid read for today |
| Decoupled from deploy cycle | |

**Verdict**: Best balance of performance, freshness, and simplicity. Industry-standard "rollup" pattern.

### Option E: Reduce Display Window to 14 Days
Change heatmap UI to show 14 days instead of 90.

| Pros | Cons |
|------|------|
| Zero implementation effort | Less historical visibility |
| Matches current data | Users may expect longer history |
| Honest UI | Wastes existing archive data |

**Verdict**: Quick fix for Phase 1, but doesn't leverage existing data.

### Option F: Monthly Chunking (Considered)
Generate monthly summary files (e.g., `stats-2025-12.json`).

| Pros | Cons |
|------|------|
| Scales to years of data | 3-4 HTTP requests for 90 days |
| Natural boundaries | More files to coordinate |

**Verdict**: Useful for very long histories; Option D simpler for 90-day window.

## Decision

**Implement Option D: Daily Summary File with Hybrid Read Pattern**

### Critical: The "Stale Today" Problem

If `daily-summary.json` is generated at midnight UTC, today's data is 0-23 hours stale. The implementation **must** use a hybrid approach:

```
Frontend loads:
├── daily-summary.json  → Days 1-89 (historical)
└── current.json        → Day 0 (today's live data)
    ↓
    Merge for complete 90-day view
```

### Schema (v1)

```json
{
  "version": 1,
  "lastUpdated": "2026-01-01T22:00:00Z",
  "windowDays": 90,
  "services": {
    "workflow": [
      {
        "date": "2025-12-31",
        "uptimePct": 0.998,
        "avgLatencyMs": 145,
        "p95LatencyMs": 320,
        "checksTotal": 144,
        "checksPassed": 143,
        "incidentCount": 0
      }
    ],
    "website": [
      {
        "date": "2025-12-31",
        "uptimePct": 0.0,
        "avgLatencyMs": null,
        "p95LatencyMs": null,
        "checksTotal": 144,
        "checksPassed": 0,
        "incidentCount": 1
      }
    ]
  }
}
```

### Schema Design Principles

1. **Store percentages/counts, not status strings**
   - Bad: `"status": "ok"` (can't change threshold later)
   - Good: `"uptimePct": 0.998` (UI decides color based on threshold)

2. **Include p95 latency alongside average**
   - Averages hide spikes; p95 reveals bad days

3. **Use UTC dates explicitly**
   - All `date` fields are ISO 8601 date strings in UTC
   - Frontend handles timezone display

4. **Schema versioning**
   - `version: 1` at root enables future migrations

5. **Raw counts for flexibility**
   - `checksTotal` and `checksPassed` allow recalculating uptime with different rules

### Implementation Requirements

#### Monitor Script Updates
```bash
# After appending to current.json, regenerate summary
generate_daily_summary() {
  # 1. Read current.json for recent days
  # 2. Read archive files for older days
  # 3. Aggregate to daily stats
  # 4. Atomic write: temp file → rename
  jq '...' > daily-summary.tmp && mv daily-summary.tmp daily-summary.json
}
```

#### Atomic Writes (Required)
```bash
# Good: atomic rename
jq '...' > daily-summary.tmp && mv daily-summary.tmp daily-summary.json

# Bad: direct write (corrupts on failure)
jq '...' > daily-summary.json
```

#### Heatmap Component Updates
```typescript
async function loadHeatmapData(): Promise<DayStats[]> {
  const [summary, current] = await Promise.all([
    fetch('/status-data/daily-summary.json').then(r => r.json()),
    fetch('/status-data/current.json').then(r => r.json())
  ]);

  // Use summary for days 1-89
  const history = summary.services[serviceName];

  // Calculate today from current.json
  const today = aggregateToday(current, serviceName);

  // Merge: today + history
  return [today, ...history].slice(0, 90);
}
```

#### Fallback Behavior
If `daily-summary.json` is missing or invalid:
1. Fall back to `current.json` only (14 days)
2. Log warning, don't crash
3. Display available data with reduced window

### File Size Estimates

| Services | Days | Estimated Size |
|----------|------|----------------|
| 2 | 90 | ~9 KB |
| 5 | 90 | ~22 KB |
| 10 | 90 | ~45 KB |
| 10 | 365 | ~180 KB |

All sizes are acceptable for mobile/low-bandwidth clients.

## Implementation Plan

### Phase 1: Quick Fix (Immediate)
- Change heatmap default from 90 to 14 days
- Update UI label to match actual data window
- No backend changes required
- **Effort**: 1 hour

### Phase 2: Summary Generation
- Add `daily-summary.json` generation to monitor script
- Bootstrap script to generate initial summary from existing archives
- **Effort**: 4-6 hours

### Phase 3: Hybrid Read
- Update heatmap component to load both files
- Merge today's live data with historical summary
- Add fallback behavior
- **Effort**: 2-3 hours

## Consequences

### Positive
- Heatmap displays full 90-day history
- Page load remains fast (<500ms for status data)
- No additional infrastructure required
- Data updates with each monitor run
- Today's data is always live (hybrid read)

### Negative
- Additional file to commit to status-data branch
- Monitor script complexity increases slightly
- Two fetches instead of one (but parallel, so minimal impact)

### Neutral
- Archive files remain unchanged (useful for debugging)
- current.json remains unchanged (used for today + fallback)

## Council Feedback Incorporated

| Feedback | Resolution |
|----------|------------|
| "Stale Today" problem | Hybrid read pattern required |
| Store percentages, not strings | Schema uses `uptimePct` float |
| Add p95 latency | Added `p95LatencyMs` field |
| Schema versioning | Added `version: 1` |
| Atomic writes | Documented as requirement |
| UTC timezone | Explicitly stated in schema |
| Monthly chunking option | Added as Option F (rejected) |

## References
- ADR-001: Configurable Data Fetching Strategies
- Upptime historical data approach: https://github.com/upptime/upptime
- Prometheus downsampling/rollup patterns
- LLM Council review: 2026-01-01 (GPT-5.2, Gemini-3-Pro, Grok-4.1, Claude Opus 4.5)
