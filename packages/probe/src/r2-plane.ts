/**
 * R2 data-plane write pipeline (ADR-006 §1/§3; epic #97 ticket #99).
 *
 * The §5 purity rule carries over — summary.json is a pure function of
 * the stored inputs — but git's multi-object atomicity does NOT.
 * Council condition 1 (write-order consistency model): derived objects
 * are written in dependency order with **summary.json LAST as the
 * commit point**; clients read the summary first and treat entity
 * details as enhancement-only, so the worst observable skew is a
 * drill-down chart one cycle staler than the summary.
 *
 * Storage layout differences vs the git plane (ADR-006 §1):
 * - readings land as ONE immutable batch object per run under
 *   status/v1/readings/ (R2 cannot append); the daily compaction cron
 *   (ticket #101) folds them into the standard archives/ JSONL
 * - rollups read day archives (bounded) plus the CURRENT day's batches
 *   (≤ one day of runs) — never the full batch history
 */

import {
  buildDailyRollups,
  buildSummary,
  extractFrontmatter,
  incidentsToAtom,
  renderMarkdownToSafeHtml,
} from '@stentorosaur/core/server';
import {
  compactReadingSchema,
  incidentSchema,
  maintenanceWindowSchema,
  rawIncidentBodySchema,
} from '@stentorosaur/core';
import {z} from 'zod';
import type {CompactReading, EntityRef} from '@stentorosaur/core';
import type {ObjectStore} from './object-store';
import {PreconditionFailedError} from './object-store';
import {entitySlug} from './files';

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_WINDOW_DAYS = 14;
const V1 = 'status/v1';

const readingsArraySchema = z.array(compactReadingSchema);
const incidentsFileSchema = z.array(incidentSchema);
const maintenanceFileSchema = z.array(maintenanceWindowSchema);

export interface R2RegenerateOptions {
  generatedAt: string;
  generatedBy: string;
  entities: EntityRef[];
  siteTitle: string;
  siteUrl: string;
  windowDays?: number;
  /** §3 retry attempts for the summary commit point */
  maxRetries?: number;
  onWarn?: (message: string) => void;
}

function utcDateOf(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

function archiveKey(date: string): string {
  const [y, m] = date.split('-');
  return `${V1}/archives/${y}/${m}/history-${date}.jsonl`;
}

/** One immutable batch object per run — the probe's only reading write. */
export async function writeReadingsBatch(
  store: ObjectStore,
  readings: CompactReading[],
  generatedAt: string,
  runId: string
): Promise<string> {
  const key = `${V1}/readings/${generatedAt.replace(/[:.]/g, '-')}-${runId}.json`;
  await store.put(key, JSON.stringify(readings), {ifNoneMatch: '*'});
  return key;
}

async function readJsonOr<T>(
  store: ObjectStore,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  onWarn: (message: string) => void
): Promise<T> {
  const object = await store.get(key);
  if (!object) return fallback;
  try {
    return schema.parse(JSON.parse(object.body));
  } catch (error) {
    onWarn(`malformed ${key}, using fallback: ${String(error)}`);
    return fallback;
  }
}

/** Archive window + current-day batches — the bounded §1 read set. */
async function readAllReadings(
  store: ObjectStore,
  windowDays: number,
  nowMs: number,
  onWarn: (message: string) => void
): Promise<CompactReading[]> {
  const readings: CompactReading[] = [];
  for (let d = 0; d < windowDays; d++) {
    const date = utcDateOf(nowMs - d * DAY_MS);
    const object = await store.get(archiveKey(date));
    if (!object) continue;
    for (const line of object.body.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = compactReadingSchema.safeParse(JSON.parse(line));
        if (parsed.success) readings.push(parsed.data);
      } catch {
        // One corrupt line must not lose the day (same rule as git plane).
      }
    }
  }
  // Batches not yet compacted (today, plus yesterday inside the
  // compaction buffer) — list is bounded by the compaction cadence.
  const batchKeys = await store.list(`${V1}/readings/`);
  for (const key of batchKeys) {
    const object = await store.get(key);
    if (!object) continue;
    const parsed = readingsArraySchema.safeParse(JSON.parse(object.body));
    if (parsed.success) {
      readings.push(...parsed.data);
    } else {
      onWarn(`malformed batch ${key} skipped`);
    }
  }
  return readings;
}

const textHash = (s: string): string => {
  // FNV-1a — cheap content identity for the write-skip guard; not
  // cryptographic and does not need to be.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

/**
 * Rebuild every derived object from stored inputs, writing in the §3
 * order: entity details → atom → SUMMARY LAST (commit point, If-Match
 * guarded with regenerate-and-retry).
 */
export async function regenerateDerivedR2(
  store: ObjectStore,
  options: R2RegenerateOptions
): Promise<{attempts: number; entityWritesSkipped: number}> {
  const {
    generatedAt,
    generatedBy,
    entities,
    siteTitle,
    siteUrl,
    windowDays = 90,
    maxRetries = 3,
    onWarn = () => {},
  } = options;
  const generatedAtMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedAtMs)) {
    throw new Error(`regenerateDerivedR2: generatedAt is not parseable: '${generatedAt}'`);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let entityWritesSkipped = 0;
    // ── read the full input set (fresh each attempt, §5 purity) ──
    const summaryBefore = await store.get(`${V1}/summary.json`);
    const allReadings = await readAllReadings(store, windowDays, generatedAtMs, onWarn);
    const incidents = await readJsonOr(store, `${V1}/inputs/incidents.json`, incidentsFileSchema, [], onWarn);
    const maintenance = await readJsonOr(store, `${V1}/inputs/maintenance.json`, maintenanceFileSchema, [], onWarn);

    const windowStart = generatedAtMs - CURRENT_WINDOW_DAYS * DAY_MS;
    const recent = allReadings.filter(r => r.t >= windowStart);

    const summary = buildSummary({
      generatedAt,
      generatedBy,
      entities,
      readings: recent,
      dailyRollups: buildDailyRollups(allReadings),
      incidents,
      maintenance,
    });

    // ── §3 write order: details → atom → summary LAST ──
    for (const entity of entities) {
      const key = `${V1}/entities/${entitySlug(entity.name)}.json`;
      const detailReadings = recent
        .filter(r => r.svc === entity.name)
        .sort((a, b) => a.t - b.t);
      // Content-hash guard (council condition 4): identical readings →
      // skip the class-A write. generatedAt is excluded from the hash
      // (it changes every run by definition).
      const payload = JSON.stringify({
        schemaVersion: 1,
        generatedAt,
        name: entity.name,
        readings: detailReadings,
      });
      const existing = await store.get(key);
      if (existing) {
        try {
          const current = JSON.parse(existing.body) as {readings?: unknown};
          if (textHash(JSON.stringify(current.readings ?? null)) === textHash(JSON.stringify(detailReadings))) {
            entityWritesSkipped++;
            continue;
          }
        } catch {
          // Unreadable existing object: overwrite with valid data.
        }
      }
      await store.put(key, payload);
    }

    await store.put(
      `${V1}/incidents.atom`,
      incidentsToAtom([...summary.incidents.open, ...summary.incidents.recent], {
        siteTitle,
        siteUrl,
        updated: generatedAt,
      }),
      {contentType: 'application/atom+xml'}
    );

    try {
      await store.put(`${V1}/summary.json`, JSON.stringify(summary), {
        ...(summaryBefore ? {ifMatch: summaryBefore.etag} : {ifNoneMatch: '*' as const}),
      });
      return {attempts: attempt, entityWritesSkipped};
    } catch (error) {
      if (!(error instanceof PreconditionFailedError)) throw error;
      // Lost the race: another writer committed. Re-read ALL inputs and
      // regenerate — deterministic over the merged state (§5).
      onWarn(`summary commit lost the race (attempt ${attempt}), regenerating`);
    }
  }
  throw new Error(`summary commit failed after ${maxRetries} attempts (persistent write contention)`);
}

/**
 * §7 runbook on the r2 plane: re-render every derived bodyHtml from the
 * raw/ markdown with the CURRENT sanitizer, rewriting the inputs.
 * Mirrors regenerate-from-raw.ts (git plane).
 */
export async function reRenderFromRawR2(
  store: ObjectStore,
  now: Date
): Promise<{incidents: number; maintenance: number}> {
  const rawKeys = await store.list(`${V1}/raw/`);
  const raws = new Map<number, string>();
  for (const key of rawKeys) {
    const object = await store.get(key);
    if (!object) continue;
    const parsed = rawIncidentBodySchema.safeParse(JSON.parse(object.body));
    if (parsed.success) raws.set(parsed.data.issueNumber, parsed.data.bodyMarkdown);
  }

  const incidentsObj = await store.get(`${V1}/inputs/incidents.json`);
  const maintenanceObj = await store.get(`${V1}/inputs/maintenance.json`);
  const incidents = incidentsObj ? incidentsFileSchema.parse(JSON.parse(incidentsObj.body)) : [];
  const maintenance = maintenanceObj
    ? maintenanceFileSchema.parse(JSON.parse(maintenanceObj.body))
    : [];

  let incidentCount = 0;
  const nextIncidents = incidents.map(incident => {
    const raw = raws.get(incident.issueNumber);
    if (raw === undefined) return incident;
    incidentCount++;
    return {...incident, bodyHtml: renderMarkdownToSafeHtml(raw)};
  });

  let maintenanceCount = 0;
  const nextMaintenance = maintenance.map(window => {
    const raw = raws.get(window.issueNumber);
    if (raw === undefined) return window;
    maintenanceCount++;
    const {content} = extractFrontmatter(raw, now);
    return {...window, bodyHtml: renderMarkdownToSafeHtml(content)};
  });

  await store.put(`${V1}/inputs/incidents.json`, JSON.stringify(nextIncidents));
  await store.put(`${V1}/inputs/maintenance.json`, JSON.stringify(nextMaintenance));
  return {incidents: incidentCount, maintenance: maintenanceCount};
}
