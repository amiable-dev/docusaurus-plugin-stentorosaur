/**
 * Shared aggregation types for Stentorosaur (ADR-005 §1).
 *
 * These model the compact reading format used by current.json and the
 * derived aggregates. No I/O types belong here.
 */

/** One monitoring reading in the compact current.json format. */
export interface CompactReading {
  /** Epoch milliseconds of the check */
  t: number;
  /** System/service name */
  svc: string;
  /** Check outcome state */
  state: 'up' | 'down' | 'degraded' | 'maintenance';
  /** HTTP status code observed */
  code: number;
  /** Latency in milliseconds */
  lat: number;
  /** Optional error message */
  err?: string;
}

/** Day-level status classification (ADR-004 thresholds). */
export type DayLevelStatus = 'operational' | 'degraded' | 'outage' | 'no-data';

/** Uptime thresholds for day-level status classification. */
export interface UptimeThresholds {
  /** >= this percentage → operational */
  operational: number;
  /** >= this percentage → degraded (below → outage) */
  degraded: number;
}

/** ADR-004 default thresholds. */
export const DEFAULT_THRESHOLDS: UptimeThresholds = {
  operational: 99,
  degraded: 95,
};

/** Aggregate over one system's readings (system-card / status-item level). */
export interface SystemAggregate {
  name: string;
  /** Readings sorted most-recent-first */
  readingsDesc: CompactReading[];
  /**
   * Most recent reading.  `undefined` when `readingsDesc` is empty (i.e.
   * `aggregateSystem` was called with an empty `readings` array).
   */
  latest: CompactReading | undefined;
  /** Percentage of readings with state 'up' (0-100, unrounded) */
  uptimePercent: number;
  /** uptimePercent formatted as e.g. "99.98%" */
  uptimeFormatted: string;
  /** Average latency over successful (up, 2xx) readings; undefined if none */
  avgResponseTime: number | undefined;
}

/** Aggregate over one day's readings for one service (uptime-bar level). */
export interface DayAggregate {
  date: string;
  checksTotal: number;
  /** Checks with state 'up' or 'maintenance' */
  checksPassed: number;
  /** checksPassed / checksTotal, 0 when no checks (fraction 0-1) */
  uptimeFraction: number;
  /** Average latency over 'up' readings, rounded; null if none */
  avgLatencyMs: number | null;
  /** P95 latency over 'up' readings; null if none */
  p95LatencyMs: number | null;
  /** Count of up→down transitions in reading order */
  incidentCount: number;
  status: DayLevelStatus;
}
