/**
 * Daily compaction of readings/ batches into day archives (ADR-006 §5;
 * epic #97 ticket #101; council conditions 2 & 3).
 *
 * Safety contract, in the order the council stated it:
 * - FENCING: a day's batches are eligible only after the UTC day has
 *   ended AND a 1-hour buffer has passed, so an in-flight probe run can
 *   never race the compactor for the same object.
 * - DELETE-AFTER-VERIFY: the archive is written, read back, and
 *   byte-compared before ANY batch object is deleted. A failed verify
 *   leaves everything in place.
 * - IDEMPOTENT / CRASH-SAFE: the archive is regenerated as the merge of
 *   the existing archive content and the surviving batches (deduped by
 *   (svc, t), deterministically ordered), so a re-run after a crash at
 *   any point produces identical bytes and simply resumes the deletes.
 * - Lifecycle expiry on readings/ is a BACKSTOP, never the mechanism
 *   (≥ 3 days — see the wrangler-r2.toml template): this module is the
 *   mechanism, and its failures must surface (the aggregate error +
 *   compaction-state.json that `stentorosaur doctor` checks).
 *
 * Workers-safe: interface-only imports, no node:* — it runs inside the
 * Cloudflare Worker cron (ticket #100's bundle-graph guard covers it).
 */

import {compactReadingSchema} from '@stentorosaur/core';
import {z} from 'zod';
import type {CompactReading} from '@stentorosaur/core';
import type {ObjectStore} from './object-store';
import {PreconditionFailedError} from './object-store';
import {V1} from './r2-plane';

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPACTION_BUFFER_MS = 60 * 60 * 1000;
export const COMPACTION_STATE_KEY = `${V1}/compaction-state.json`;

const readingsArraySchema = z.array(compactReadingSchema);

export const compactionStateSchema = z.object({
  schemaVersion: z.literal(1),
  /** Last time the cron ran at all */
  lastRun: z.string(),
  /** Last run that completed with zero failed days (null until then) */
  lastSuccess: z.string().nullable(),
  archivedDays: z.array(z.string()),
  deletedBatches: z.number(),
  /** Quarantined batches (malformed key/content) still in readings/ —
   * persisted so doctor can spot accumulating garbage without
   * `wrangler tail` (Copilot PR #108). Defaulted for older states. */
  batchesLeft: z.number().default(0),
});
export type CompactionState = z.infer<typeof compactionStateSchema>;

export interface CompactionOptions {
  nowMs: number;
  onWarn?: (message: string) => void;
}

export interface CompactionResult {
  /** Days whose batches were folded and deleted this run */
  archivedDays: string[];
  deletedBatches: number;
  /** Days that hit a verify failure, write race, or delete error —
   * left untouched (or partially deleted); the next run converges */
  failedDays: string[];
  /** Batches left in place: malformed key or unparseable content */
  batchesLeft: number;
}

function archiveKey(date: string): string {
  const [y, m] = date.split('-');
  return `${V1}/archives/${y}/${m}/history-${date}.jsonl`;
}

/** A day is eligible once it has fully ended AND the fence buffer has
 * passed (council condition 2: day boundary + 1h). */
export function dayIsEligible(date: string, nowMs: number): boolean {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(dayStart) && dayStart + DAY_MS + COMPACTION_BUFFER_MS <= nowMs;
}

interface DayPlan {
  date: string;
  /** batch key → its parsed readings (only parseable batches) */
  batches: Map<string, CompactReading[]>;
}

/**
 * Deterministic archive bytes for a day: unparseable existing-archive
 * lines are PRESERVED verbatim (compaction never destroys data), then
 * the (svc, t)-deduped union of archive readings and batch readings —
 * archive wins on collision — sorted by (t, svc), one JSON per line.
 */
function mergeArchiveBytes(
  existingBody: string | null,
  batchReadings: CompactReading[]
): string {
  const preserved: string[] = [];
  const byKey = new Map<string, CompactReading>();
  const add = (r: CompactReading) => {
    const k = `${r.svc}|${r.t}`;
    if (!byKey.has(k)) byKey.set(k, r);
  };
  if (existingBody) {
    for (const line of existingBody.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = compactReadingSchema.safeParse(JSON.parse(line));
        if (parsed.success) {
          add(parsed.data);
        } else {
          preserved.push(line);
        }
      } catch {
        preserved.push(line);
      }
    }
  }
  batchReadings.forEach(add);
  const sorted = [...byKey.values()].sort((a, b) => a.t - b.t || a.svc.localeCompare(b.svc));
  const lines = [...preserved, ...sorted.map(r => JSON.stringify(r))];
  return lines.length === 0 ? '' : lines.join('\n') + '\n';
}

/**
 * One compaction pass: list readings/ batches, fold every eligible
 * day's batches into its archives/ JSONL, verify by read-back, delete
 * the folded batches, then record compaction-state.json (written LAST
 * so a recorded success implies the deletes completed).
 *
 * Throws AFTER writing state if any day failed — a Worker cron failure
 * is the observability signal (council condition 3).
 */
export async function compactReadingsR2(
  store: ObjectStore,
  options: CompactionOptions
): Promise<CompactionResult> {
  const {nowMs, onWarn = () => {}} = options;
  const result: CompactionResult = {
    archivedDays: [],
    deletedBatches: 0,
    failedDays: [],
    batchesLeft: 0,
  };

  // ── group batch keys by UTC day; malformed keys are never fetched,
  // never deleted (carried from the #106 Council notes) ──
  const days = new Map<string, string[]>();
  for (const key of await store.list(`${V1}/readings/`)) {
    const stamp = key.match(/readings\/(\d{4}-\d{2}-\d{2})T/)?.[1];
    if (!stamp) {
      onWarn(`unrecognized batch key ${key} left in place`);
      result.batchesLeft++;
      continue;
    }
    if (!dayIsEligible(stamp, nowMs)) continue; // fence: day not closed + 1h
    const keys = days.get(stamp) ?? [];
    keys.push(key);
    days.set(stamp, keys);
  }

  for (const [date, keys] of [...days.entries()].sort()) {
    const plan: DayPlan = {date, batches: new Map()};
    for (const key of keys.sort()) {
      const object = await store.get(key);
      if (!object) continue; // deleted concurrently — nothing to fold
      try {
        const parsed = readingsArraySchema.safeParse(JSON.parse(object.body));
        if (parsed.success) {
          plan.batches.set(key, parsed.data);
        } else {
          onWarn(`malformed batch ${key} left in place (not archived, not deleted)`);
          result.batchesLeft++;
        }
      } catch (error) {
        onWarn(`unparseable batch ${key} left in place: ${String(error).slice(0, 120)}`);
        result.batchesLeft++;
      }
    }
    if (plan.batches.size === 0) continue;

    const existing = await store.get(archiveKey(date));
    const bytes = mergeArchiveBytes(
      existing?.body ?? null,
      [...plan.batches.values()].flat()
    );

    if (!existing || existing.body !== bytes) {
      try {
        await store.put(archiveKey(date), bytes, {
          contentType: 'application/x-ndjson',
          ...(existing ? {ifMatch: existing.etag} : {ifNoneMatch: '*' as const}),
        });
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) throw error;
        // Another compactor committed first — leave this day for the
        // next run rather than second-guessing its verify.
        onWarn(`archive write for ${date} lost a race, deferring to next run`);
        result.failedDays.push(date);
        continue;
      }
    }

    // ── DELETE-AFTER-VERIFY: read back and byte-compare ──
    const verify = await store.get(archiveKey(date));
    if (!verify || verify.body !== bytes) {
      onWarn(`archive verify FAILED for ${date} — batches left untouched`);
      result.failedDays.push(date);
      continue;
    }

    let dayFailed = false;
    for (const key of plan.batches.keys()) {
      try {
        await store.delete(key);
        result.deletedBatches++;
      } catch (error) {
        // The archive already holds this batch's readings; the next run
        // regenerates identical bytes and retries the delete.
        onWarn(`delete failed for ${key}, will resume next run: ${String(error).slice(0, 120)}`);
        dayFailed = true;
      }
    }
    if (dayFailed) {
      result.failedDays.push(date);
    } else {
      result.archivedDays.push(date);
    }
  }

  // ── state LAST: a recorded lastSuccess implies the deletes ran ──
  const priorState = await readCompactionState(store);
  const nowIso = new Date(nowMs).toISOString();
  const state: CompactionState = {
    schemaVersion: 1,
    lastRun: nowIso,
    lastSuccess: result.failedDays.length === 0 ? nowIso : (priorState?.lastSuccess ?? null),
    archivedDays: result.archivedDays,
    deletedBatches: result.deletedBatches,
    batchesLeft: result.batchesLeft,
  };
  await store.put(COMPACTION_STATE_KEY, JSON.stringify(state));

  if (result.failedDays.length > 0) {
    throw new Error(
      `compaction failed for ${result.failedDays.join(', ')} — nothing was lost; re-run converges`
    );
  }
  return result;
}

/** Guarded state read for the compactor and `stentorosaur doctor`. */
export async function readCompactionState(store: ObjectStore): Promise<CompactionState | null> {
  const object = await store.get(COMPACTION_STATE_KEY);
  if (!object) return null;
  try {
    return compactionStateSchema.parse(JSON.parse(object.body));
  } catch {
    return null;
  }
}
