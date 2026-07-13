/**
 * One-time historical data migration (ADR-005 Migration Phase 1, council
 * condition 6; epic #63 ticket #75): legacy `status-data/` files
 * (current.json, daily-summary.json, systems/*.json, archives/**) →
 * `status/v1/` on the data branch, so the 90-day view is intact on the
 * first render after upgrade.
 *
 * Design constraints:
 * - The v1 pipeline rebuilds day rollups from status/v1/archives on
 *   EVERY regenerate, so history must land as archive readings — real
 *   ones where the legacy site has them, and synthesized ones that
 *   reproduce the recorded rollup exactly for days covered only by
 *   daily-summary.json (pruned/pre-archive sites).
 * - Idempotent and resumable: day files are written whole (merge with
 *   any existing target file, dedupe by svc+timestamp, sort) so a
 *   re-run after a partial failure converges. Legacy files are never
 *   modified or deleted.
 * - Corrupt JSONL lines are skipped and counted, never fatal.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {compactReadingSchema} from '@stentorosaur/core';
import type {CompactReading, EntityRef} from '@stentorosaur/core';
import {entitySlug, writeEntityDetail} from './files';
import {regenerateDerived} from './regenerate';

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_WINDOW_DAYS = 14;

export interface LegacyCollection {
  /** Deduplicated by (svc, t); order unspecified */
  readings: CompactReading[];
  corruptLines: number;
  /** Which legacy sources contributed (for the plan report) */
  sources: string[];
}

interface LegacyDayEntry {
  date: string;
  uptimePct: number;
  avgLatencyMs: number | null;
  checksTotal?: number;
  checksPassed?: number;
}

export interface MigrateOptions {
  legacyDir: string;
  targetDir: string;
  entities: EntityRef[];
  /** Injected — one clock read at the CLI boundary */
  generatedAt: string;
  siteTitle?: string;
  siteUrl?: string;
  onWarn?: (message: string) => void;
}

export interface MigrationReport {
  readingsMigrated: number;
  synthesizedDays: number;
  corruptLines: number;
  ghostEntities: string[];
  sources: string[];
}

export interface MigrationPlan {
  /** Target-relative archive file paths, one per day, oldest first */
  archiveFiles: string[];
  /** Target-relative entity detail paths for configured entities */
  entityFiles: string[];
  /** date → merged readings for that UTC day (real + synthesized) */
  days: Map<string, CompactReading[]>;
  report: MigrationReport;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

function readingKey(r: CompactReading): string {
  return `${r.svc}|${r.t}`;
}

/** Gather every reading the legacy site has, across all generations. */
export function collectLegacyData(
  legacyDir: string,
  onWarn: (message: string) => void = () => {}
): LegacyCollection {
  const byKey = new Map<string, CompactReading>();
  let corruptLines = 0;
  const sources: string[] = [];

  const addReading = (raw: unknown): boolean => {
    const parsed = compactReadingSchema.safeParse(raw);
    if (!parsed.success) return false;
    const key = readingKey(parsed.data);
    if (!byKey.has(key)) byKey.set(key, parsed.data);
    return true;
  };

  // 1. archives/**/history-*.jsonl(.gz) — the richest source.
  const archivesDir = path.join(legacyDir, 'archives');
  if (fs.existsSync(archivesDir)) {
    let contributed = false;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/^history-.*\.jsonl(\.gz)?$/.test(entry.name)) {
          let body: string;
          try {
            body = entry.name.endsWith('.gz')
              ? zlib.gunzipSync(fs.readFileSync(full)).toString('utf8')
              : fs.readFileSync(full, 'utf8');
          } catch (error) {
            onWarn(`unreadable archive ${full}: ${String(error)}`);
            continue;
          }
          for (const line of body.split('\n')) {
            if (!line.trim()) continue;
            try {
              if (addReading(JSON.parse(line))) contributed = true;
              else corruptLines++;
            } catch {
              corruptLines++;
            }
          }
        }
      }
    };
    walk(archivesDir);
    if (contributed) sources.push('archives');
  }

  // 2. current.json — overlaps archives by design; dedupe handles it.
  const currentFile = path.join(legacyDir, 'current.json');
  if (fs.existsSync(currentFile)) {
    try {
      const arr = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
      if (Array.isArray(arr)) {
        let contributed = false;
        for (const raw of arr) {
          if (addReading(raw)) contributed = true;
          else corruptLines++;
        }
        if (contributed) sources.push('current.json');
      }
    } catch (error) {
      onWarn(`unreadable current.json: ${String(error)}`);
    }
  }

  // 3. systems/*.json — the pre-three-file generation.
  const systemsDir = path.join(legacyDir, 'systems');
  if (fs.existsSync(systemsDir)) {
    for (const f of fs.readdirSync(systemsDir).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(systemsDir, f), 'utf8')) as {
          name?: string;
          history?: Array<{timestamp?: string; status?: string; code?: number; responseTime?: number}>;
        };
        const svc = data.name ?? path.basename(f, '.json');
        let contributed = false;
        for (const h of data.history ?? []) {
          const t = h.timestamp ? Date.parse(h.timestamp) : NaN;
          if (
            !Number.isNaN(t) &&
            addReading({t, svc, state: h.status, code: h.code ?? 0, lat: h.responseTime ?? 0})
          ) {
            contributed = true;
          } else {
            corruptLines++;
          }
        }
        if (contributed) sources.push(`systems/${f}`);
      } catch (error) {
        onWarn(`unreadable systems/${f}: ${String(error)}`);
      }
    }
  }

  return {readings: [...byKey.values()], corruptLines, sources};
}

function readDailySummary(
  legacyDir: string,
  onWarn: (message: string) => void
): Map<string, LegacyDayEntry[]> {
  const map = new Map<string, LegacyDayEntry[]>();
  const file = path.join(legacyDir, 'daily-summary.json');
  if (!fs.existsSync(file)) return map;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      services?: Record<string, LegacyDayEntry[]>;
    };
    for (const [svc, entries] of Object.entries(data.services ?? {})) {
      if (Array.isArray(entries)) map.set(svc, entries);
    }
  } catch (error) {
    onWarn(`unreadable daily-summary.json: ${String(error)}`);
  }
  return map;
}

/**
 * Synthesize a day of readings that reproduces the recorded rollup
 * EXACTLY under core aggregation: `checksPassed` up readings at
 * lat=avgLatencyMs (avg over up readings == avgLatencyMs), the rest
 * down. When the rollup says checks passed but records no latency
 * (an all-maintenance day), 'maintenance' readings preserve the pass
 * count without polluting the latency average.
 */
function synthesizeDayReadings(svc: string, entry: LegacyDayEntry): CompactReading[] {
  // uptimePct is a fraction in every known generation; tolerate percent.
  const fraction = entry.uptimePct > 1 ? entry.uptimePct / 100 : entry.uptimePct;
  const total =
    entry.checksTotal && entry.checksTotal > 0 ? entry.checksTotal : 288;
  const passed =
    entry.checksPassed !== undefined
      ? entry.checksPassed
      : Math.round(fraction * total);

  const dayStart = Date.parse(`${entry.date}T00:00:00.000Z`);
  const step = Math.max(1, Math.floor(DAY_MS / Math.max(total, 1)));
  const readings: CompactReading[] = [];
  for (let i = 0; i < total; i++) {
    const up = i < passed;
    readings.push({
      t: dayStart + i * step,
      svc,
      state: up ? (entry.avgLatencyMs === null ? 'maintenance' : 'up') : 'down',
      code: up ? 200 : 0,
      lat: up ? entry.avgLatencyMs ?? 0 : 0,
    });
  }
  return readings;
}

function archiveRelPath(date: string): string {
  const [y, m] = date.split('-');
  return path.join('status', 'v1', 'archives', y, m, `history-${date}.jsonl`);
}

export function planMigration(options: MigrateOptions): MigrationPlan {
  const warn = options.onWarn ?? (() => {});
  const collected = collectLegacyData(options.legacyDir, warn);
  const dailySummary = readDailySummary(options.legacyDir, warn);

  // Group real readings by UTC day, tracking which (svc, day) pairs
  // have real coverage so we only synthesize the genuinely missing ones.
  const days = new Map<string, CompactReading[]>();
  const coveredSvcDays = new Set<string>();
  for (const reading of collected.readings) {
    const date = utcDate(reading.t);
    days.set(date, [...(days.get(date) ?? []), reading]);
    coveredSvcDays.add(`${reading.svc}|${date}`);
  }

  let synthesizedDays = 0;
  for (const [svc, entries] of dailySummary) {
    for (const entry of entries) {
      if (!entry?.date || coveredSvcDays.has(`${svc}|${entry.date}`)) continue;
      const synthesized = synthesizeDayReadings(svc, entry);
      days.set(entry.date, [...(days.get(entry.date) ?? []), ...synthesized]);
      synthesizedDays++;
    }
  }

  for (const readings of days.values()) {
    readings.sort((a, b) => a.t - b.t || a.svc.localeCompare(b.svc));
  }

  const configuredNames = new Set(options.entities.map(e => e.name));
  const dataSvcs = new Set<string>();
  for (const readings of days.values()) {
    for (const r of readings) dataSvcs.add(r.svc);
  }
  const ghostEntities = [...dataSvcs].filter(svc => !configuredNames.has(svc)).sort();

  const sortedDates = [...days.keys()].sort();
  return {
    archiveFiles: sortedDates.map(archiveRelPath),
    entityFiles: options.entities.map(e =>
      path.join('status', 'v1', 'entities', `${entitySlug(e.name)}.json`)
    ),
    days,
    report: {
      readingsMigrated: collected.readings.length,
      synthesizedDays,
      corruptLines: collected.corruptLines,
      ghostEntities,
      sources: collected.sources,
    },
  };
}

export function migrateHistoricalData(options: MigrateOptions): MigrationReport {
  const plan = planMigration(options);
  const {targetDir, entities, generatedAt} = options;

  // Whole-file day writes: merge with anything already at the target
  // (a prior partial run, or probe readings that landed post-cutover),
  // dedupe by (svc, t), sort. Deterministic → idempotent.
  for (const [date, readings] of plan.days) {
    const rel = archiveRelPath(date);
    const file = path.join(targetDir, rel);
    const byKey = new Map<string, CompactReading>();
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = compactReadingSchema.safeParse(JSON.parse(line));
          if (parsed.success) byKey.set(readingKey(parsed.data), parsed.data);
        } catch {
          // A corrupt pre-existing target line is dropped by the rewrite.
        }
      }
    }
    for (const reading of readings) {
      if (!byKey.has(readingKey(reading))) byKey.set(readingKey(reading), reading);
    }
    const merged = [...byKey.values()].sort((a, b) => a.t - b.t || a.svc.localeCompare(b.svc));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, merged.map(r => JSON.stringify(r)).join('\n') + '\n');
  }

  // Entity details for configured entities: the recent window, matching
  // what a probe run would leave behind.
  const generatedAtMs = Date.parse(generatedAt);
  const windowStart = generatedAtMs - CURRENT_WINDOW_DAYS * DAY_MS;
  const recentBySvc = new Map<string, CompactReading[]>();
  for (const readings of plan.days.values()) {
    for (const r of readings) {
      if (r.t >= windowStart) {
        recentBySvc.set(r.svc, [...(recentBySvc.get(r.svc) ?? []), r]);
      }
    }
  }
  for (const entity of entities) {
    const readings = (recentBySvc.get(entity.name) ?? []).sort((a, b) => a.t - b.t);
    writeEntityDetail(targetDir, entity.name, readings, generatedAt);
  }

  regenerateDerived(targetDir, {
    generatedAt,
    generatedBy: 'stentorosaur-migrate',
    entities,
    siteTitle: options.siteTitle ?? 'System Status',
    siteUrl: options.siteUrl ?? 'https://example.com',
  });

  return plan.report;
}
