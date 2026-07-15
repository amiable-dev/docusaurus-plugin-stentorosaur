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
 * - rollups read day archives (bounded) plus the not-yet-compacted
 *   batches inside the compaction buffer (≤ 2 days of runs) — never the
 *   full batch history
 */

// Workers-safe imports ONLY (ticket #100): this module runs inside the
// Cloudflare Worker. The jsdom-dependent §7 runbook lives in
// r2-raw-rerender.ts, which imports the server barrel.
import {buildDailyRollups, buildSummary, incidentsToAtom} from '@stentorosaur/core/summary';
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
export const V1 = 'status/v1';

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
  // Deduped by (svc, t): during the compaction window a reading exists
  // in BOTH the day archive and its not-yet-deleted batch — without
  // dedupe the rollups would double-count that window (Copilot PR #106
  // r=1). Same identity rule as the migration merge.
  const byKey = new Map<string, CompactReading>();
  const add = (r: CompactReading) => {
    const k = `${r.svc}|${r.t}`;
    if (!byKey.has(k)) byKey.set(k, r);
  };

  // ── BATCHES FIRST, archives second (ticket #103 concurrency fix).
  // Compaction deletes a batch only AFTER its day archive is written
  // and verified, so reading in this order can never miss a reading:
  // if a batch is already gone by the time we list, its archive is
  // durably readable below. The archive-first order had a torn window
  // (batches deleted after our archive read, before our list) where a
  // whole day vanished from one regenerate cycle.
  //
  // Batches only exist inside the compaction buffer (today + yesterday
  // + the 1h fence, ticket #101); anything older is a compaction
  // orphan whose day is already archived — skip without a GET. This is
  // the ≤-one-day-of-runs bound, NOT windowDays (Council r=2).
  const batchKeys = await store.list(`${V1}/readings/`);
  const batchCutoffMs = nowMs - 2 * DAY_MS;
  for (const key of batchKeys) {
    const stamp = key.match(/readings\/(\d{4}-\d{2}-\d{2})T/)?.[1];
    if (!stamp) {
      // A key that doesn't carry a run timestamp was not written by the
      // probe — skip WITHOUT a GET (Council PR #106 polish; the
      // compactor quarantines these the same way).
      onWarn(`unrecognized batch key ${key} skipped`);
      continue;
    }
    if (Date.parse(`${stamp}T00:00:00Z`) < batchCutoffMs) continue;
    const object = await store.get(key);
    if (!object) continue; // compacted between list and get — archive has it
    try {
      const parsed = readingsArraySchema.safeParse(JSON.parse(object.body));
      if (parsed.success) {
        parsed.data.forEach(add);
      } else {
        onWarn(`malformed batch ${key} skipped`);
      }
    } catch (error) {
      // A corrupt object must not crash the regenerator (Council r=1).
      onWarn(`unparseable batch ${key} skipped: ${String(error)}`);
    }
  }

  for (let d = 0; d < windowDays; d++) {
    const date = utcDateOf(nowMs - d * DAY_MS);
    const object = await store.get(archiveKey(date));
    if (!object) continue;
    for (const line of object.body.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = compactReadingSchema.safeParse(JSON.parse(line));
        if (parsed.success) add(parsed.data);
      } catch {
        // One corrupt line must not lose the day (same rule as git plane).
      }
    }
  }
  return [...byKey.values()];
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
    // Reset per attempt (Copilot PR #106 r=1): the returned count must
    // describe the attempt that actually committed, not the sum.
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
      // (it changes every run by definition). The hash covers ONLY the
      // readings array — if the detail payload ever grows more fields,
      // they must join the hash or their changes will be skipped.
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
