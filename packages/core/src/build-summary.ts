/**
 * buildSummary — THE deterministic aggregation from probe/issue inputs to
 * status/v1 summary.json (ADR-005 §2, §5).
 *
 * Referential transparency is load-bearing: the regenerate-and-retry
 * concurrency rule (§5) depends on any writer being able to rebuild an
 * identical summary from the same merged inputs. Therefore: no clock
 * reads, no randomness, and all internal ordering is derived from the
 * inputs (entity order is config-owned; readings are sorted internally).
 */

import {
  aggregateDayReadings,
  aggregateSystem,
  calculateUptimePercent,
  groupReadingsByDate,
  groupReadingsBySystem,
} from './aggregate';
import {encodeDayRollups} from './status-v1';
import type {DayRollup, StatusIncidentV1, MaintenanceWindowV1, StatusSummary, SummaryEntity} from './status-v1';
import type {EntityRef} from './labels';
import type {CompactReading} from './types';
import {worstEntityStatus} from './issues';

export interface BuildSummaryInputs {
  /** ISO timestamp — injected, never read from the clock */
  generatedAt: string;
  /** e.g. "probe@0.22.0" */
  generatedBy: string;
  /** Config-ordered entities (order is preserved in the output) */
  entities: EntityRef[];
  /** Recent compact readings (the current.json window) */
  readings: CompactReading[];
  /** Per-entity daily rollups, oldest→newest (from archives/daily summary) */
  dailyRollups: Record<string, DayRollup[]>;
  /** All transformed incidents (open and resolved) */
  incidents: StatusIncidentV1[];
  /** All transformed maintenance windows */
  maintenance: MaintenanceWindowV1[];
  /** How many resolved incidents to keep under incidents.recent */
  recentIncidentLimit?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Derive per-entity daily rollups from raw readings (typically the
 * archive window). Days are UTC; rollups are oldest→newest. The
 * DayAggregate→DayRollup mapping mirrors the summary encoding:
 * uptime% = fraction×100, worst = the worst state observed that day.
 */
export function buildDailyRollups(
  readings: CompactReading[]
): Record<string, DayRollup[]> {
  const rollups: Record<string, DayRollup[]> = {};
  const severity = {up: 0, maintenance: 1, degraded: 2, down: 3} as const;

  for (const [svc, svcReadings] of groupReadingsBySystem(readings)) {
    const byDate = groupReadingsByDate(svcReadings);
    const days: DayRollup[] = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayReadings]) => {
        const sorted = [...dayReadings].sort((a, b) => a.t - b.t);
        const day = aggregateDayReadings(date, sorted);
        const worst = sorted.reduce<CompactReading['state']>(
          (acc, r) => (severity[r.state] > severity[acc] ? r.state : acc),
          'up'
        );
        return {
          date,
          uptime: day.uptimeFraction * 100,
          avgMs: day.avgLatencyMs,
          worst,
        };
      });
    rollups[svc] = days;
  }
  return rollups;
}

function windowUptime(rollups: DayRollup[], days: number): number | null {
  const window = rollups.slice(-days);
  if (window.length === 0) return null;
  const withChecks = window.filter(r => r.uptime >= 0);
  if (withChecks.length === 0) return null;
  const sum = withChecks.reduce((acc, r) => acc + r.uptime, 0);
  return sum / withChecks.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSummary(inputs: BuildSummaryInputs): StatusSummary {
  const {
    generatedAt,
    generatedBy,
    entities,
    readings,
    dailyRollups,
    incidents,
    maintenance,
    recentIncidentLimit = 20,
  } = inputs;

  const generatedAtMs = Date.parse(generatedAt);
  const d1Cutoff = generatedAtMs - DAY_MS;
  const bySystem = groupReadingsBySystem(readings);

  const summaryEntities: SummaryEntity[] = entities.map(entity => {
    const entityReadings = bySystem.get(entity.name) ?? [];
    const d1Readings = entityReadings.filter(r => r.t >= d1Cutoff);
    const agg = aggregateSystem(entity.name, d1Readings);
    const rollups = dailyRollups[entity.name] ?? [];

    const probeState = agg.latest?.state ?? 'up';
    const status = worstEntityStatus(probeState, incidents, entity.name);

    const d1FromReadings = d1Readings.length > 0 ? calculateUptimePercent(d1Readings) : null;
    const d7 = windowUptime(rollups, 7);
    const d90 = windowUptime(rollups, 90);
    // Fall back through progressively wider windows so a freshly
    // bootstrapped site still renders sane numbers.
    const d1 = d1FromReadings ?? windowUptime(rollups, 1) ?? 100;

    const encodedDays =
      rollups.length > 0
        ? encodeDayRollups(rollups.slice(-90))
        : // no history yet: a single synthetic day derived from d1
          encodeDayRollups([
            {
              date: new Date(generatedAtMs).toISOString().split('T')[0],
              uptime: round2(d1),
              avgMs: agg.avgResponseTime ?? null,
              worst: status,
            },
          ]);

    return {
      name: entity.name,
      type: entity.type,
      ...(entity.displayName ? {displayName: entity.displayName} : {}),
      status,
      uptime: {
        d1: round2(d1),
        d7: round2(d7 ?? d1),
        d90: round2(d90 ?? d7 ?? d1),
      },
      responseTimeMs: {d1: agg.avgResponseTime ?? null},
      daysEnd: encodedDays.daysEnd,
      days: encodedDays.days,
    };
  });

  const open = incidents
    .filter(i => i.status === 'open')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.issueNumber - a.issueNumber);
  const recent = incidents
    .filter(i => i.status === 'resolved')
    .sort(
      (a, b) =>
        (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || b.issueNumber - a.issueNumber
    )
    .slice(0, recentIncidentLimit);

  const upcoming = maintenance
    .filter(m => m.status === 'upcoming')
    .sort((a, b) => a.start.localeCompare(b.start) || a.issueNumber - b.issueNumber);
  const inProgress = maintenance
    .filter(m => m.status === 'in-progress')
    .sort((a, b) => a.start.localeCompare(b.start) || a.issueNumber - b.issueNumber);

  return {
    schemaVersion: 1,
    generatedAt,
    generatedBy,
    entities: summaryEntities,
    incidents: {open, recent},
    maintenance: {upcoming, inProgress},
  };
}
