/**
 * Pure aggregation functions extracted from the plugin's four historical
 * call sites (ADR-005 §1; epic #63 ticket #65):
 *   - loadContent() reading aggregation        (src/index.ts)
 *   - convertReadingsToSystemFiles()           (src/index.ts)
 *   - readSystemFiles() response-time fallback (src/index.ts)
 *   - StatusDataProvider / useDailySummary day rollups (client)
 *
 * Behavior is preserved exactly — the plugin's golden-file test
 * (packages/docusaurus-plugin-stentorosaur/__tests__/golden/) pins the
 * end-to-end outputs these functions must reproduce.
 */

import type {
  CompactReading,
  DayAggregate,
  DayLevelStatus,
  SystemAggregate,
  UptimeThresholds,
} from './types';
import {DEFAULT_THRESHOLDS} from './types';

/** Group readings by system name (insertion order preserved). */
export function groupReadingsBySystem(
  readings: CompactReading[]
): Map<string, CompactReading[]> {
  const map = new Map<string, CompactReading[]>();
  for (const reading of readings) {
    if (!map.has(reading.svc)) {
      map.set(reading.svc, []);
    }
    map.get(reading.svc)!.push(reading);
  }
  return map;
}

/** Return a copy sorted most-recent-first. */
export function sortReadingsDesc(
  readings: CompactReading[]
): CompactReading[] {
  return [...readings].sort((a, b) => b.t - a.t);
}

/** Percentage of readings with state 'up' (0-100); 0 for empty input. */
export function calculateUptimePercent(readings: CompactReading[]): number {
  if (readings.length === 0) {
    return 0;
  }
  const upReadings = readings.filter(r => r.state === 'up').length;
  return (upReadings / readings.length) * 100;
}

/** Format an uptime percentage as e.g. "99.98%". */
export function formatUptimePercent(pct: number): string {
  return `${(Math.round(pct * 100) / 100).toFixed(2)}%`;
}

/**
 * Average latency over successful readings (state 'up' AND 2xx code),
 * rounded to the nearest ms; undefined when there are none.
 */
export function calculateAvgResponseTime(
  readings: CompactReading[]
): number | undefined {
  const successful = readings.filter(
    r => r.state === 'up' && r.code >= 200 && r.code < 300
  );
  if (successful.length === 0) {
    return undefined;
  }
  return Math.round(
    successful.reduce((sum, r) => sum + r.lat, 0) / successful.length
  );
}

/**
 * Average of the first `take` entries' responseTime (entries are assumed
 * most-recent-first), rounded; undefined for empty input.
 */
export function averageRecentResponseTime(
  entries: Array<{responseTime: number}>,
  take = 10
): number | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const recent = entries.slice(0, take);
  const sum = recent.reduce((acc, e) => acc + e.responseTime, 0);
  return Math.round(sum / recent.length);
}

/** Full system-level aggregate over one system's readings. */
export function aggregateSystem(
  name: string,
  readings: CompactReading[]
): SystemAggregate {
  const readingsDesc = sortReadingsDesc(readings);
  const uptimePercent = calculateUptimePercent(readings);
  return {
    name,
    readingsDesc,
    latest: readingsDesc[0],
    uptimePercent,
    uptimeFormatted: formatUptimePercent(uptimePercent),
    avgResponseTime: calculateAvgResponseTime(readings),
  };
}

/** Day-level status from uptime percentage (ADR-004 thresholds). */
export function calculateStatusFromUptime(
  uptimePercent: number,
  checksTotal: number,
  thresholds: UptimeThresholds = DEFAULT_THRESHOLDS
): DayLevelStatus {
  if (checksTotal === 0) return 'no-data';
  if (uptimePercent >= thresholds.operational) return 'operational';
  if (uptimePercent >= thresholds.degraded) return 'degraded';
  return 'outage';
}

/** P95 latency (nearest-rank); null for empty input. */
export function calculateP95(latencies: number[]): number | null {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Count up→down transitions in reading order.
 *
 * @param readings Must be in **chronological** order (oldest first).
 *   Passing unsorted readings will produce an inaccurate count.
 */
export function countIncidentTransitions(
  readings: CompactReading[]
): number {
  let incidents = 0;
  for (let i = 1; i < readings.length; i++) {
    if (readings[i - 1].state === 'up' && readings[i].state === 'down') {
      incidents++;
    }
  }
  return incidents;
}

/**
 * Aggregate one day's readings for one service. 'maintenance' counts as
 * passed; latency statistics consider only 'up' readings.
 *
 * @param readings Should be in **chronological** order (oldest first) for an
 *   accurate `incidentCount`.  The function does not sort internally so that
 *   callers can avoid unnecessary copies when they already have sorted data.
 */
export function aggregateDayReadings(
  date: string,
  readings: CompactReading[],
  thresholds: UptimeThresholds = DEFAULT_THRESHOLDS
): DayAggregate {
  const checksTotal = readings.length;
  const checksPassed = readings.filter(
    r => r.state === 'up' || r.state === 'maintenance'
  ).length;
  const uptimeFraction = checksTotal > 0 ? checksPassed / checksTotal : 0;

  const latencies = readings.filter(r => r.state === 'up').map(r => r.lat);
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(
          latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
        )
      : null;

  return {
    date,
    checksTotal,
    checksPassed,
    uptimeFraction,
    avgLatencyMs,
    p95LatencyMs: calculateP95(latencies),
    incidentCount: countIncidentTransitions(readings),
    status: calculateStatusFromUptime(
      uptimeFraction * 100,
      checksTotal,
      thresholds
    ),
  };
}

/**
 * Group readings by UTC date (YYYY-MM-DD), optionally filtered to one
 * service (case-insensitive).
 */
export function groupReadingsByDate(
  readings: CompactReading[],
  serviceName?: string
): Map<string, CompactReading[]> {
  const groups = new Map<string, CompactReading[]>();
  const lowerServiceName = serviceName?.toLowerCase();

  for (const reading of readings) {
    if (
      lowerServiceName !== undefined &&
      reading.svc.toLowerCase() !== lowerServiceName
    ) {
      continue;
    }
    const date = new Date(reading.t).toISOString().split('T')[0];
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(reading);
  }
  return groups;
}
