/**
 * Profile portability: `migrate --to r2` / `--to git` (ADR-006 §6;
 * epic #97 ticket #102). Copies the status/v1 INPUT tree between the
 * git data branch and an R2 bucket with the same zero-loss guarantees
 * as the 0.x→v1 migration (ticket #75 precedent).
 *
 * Rules, per object:
 * - target missing → VERBATIM copy (byte identity is what makes the
 *   golden round-trip test meaningful)
 * - target identical → skip
 * - target differs → archives are MERGED with the compaction merge
 *   (deduped by (svc, t), deterministic order, unparseable target
 *   lines preserved); inputs/ and raw/ take the SOURCE side whole (the
 *   direction of the migration names the source of truth)
 * - derived objects (summary.json, entities/, incidents.atom) and the
 *   compaction-state are NEVER copied — the target regenerates them
 *   under its own write-order rules (§3 on r2, git commit on git)
 * - r2→git additionally FOLDS not-yet-compacted readings/ batches into
 *   the day archives so the compaction buffer window is not lost
 *
 * Both directions are idempotent: a re-run classifies everything as
 * 'skipped' and writes nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {compactReadingSchema} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import type {ObjectStore} from './object-store';
import {V1} from './r2-plane';
import {mergeArchiveBytes} from './r2-compaction';

export interface PlaneMigrationReport {
  created: string[];
  merged: string[];
  skipped: string[];
  corruptLines: number;
  /** r2→git only: readings/ batches folded into day archives */
  foldedBatches: number;
}

export interface PlaneMigrateOptions {
  /** Plan only — read everything, write nothing */
  dryRun?: boolean;
  onWarn?: (message: string) => void;
}

const ARCHIVE_KEY_RE = /^status\/v1\/archives\/(\d{4})\/(\d{2})\/history-(\d{4}-\d{2}-\d{2})\.jsonl$/;

function isCopyableKey(key: string): 'archive' | 'input' | 'raw' | null {
  if (ARCHIVE_KEY_RE.test(key)) return 'archive';
  if (key === `${V1}/inputs/incidents.json` || key === `${V1}/inputs/maintenance.json`) {
    return 'input';
  }
  if (/^status\/v1\/raw\/[^/]+\.json$/.test(key)) return 'raw';
  return null;
}

function parseReadings(
  body: string,
  label: string,
  onWarn: (message: string) => void
): {readings: CompactReading[]; corrupt: number} {
  const readings: CompactReading[] = [];
  let corrupt = 0;
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = compactReadingSchema.safeParse(JSON.parse(line));
      if (parsed.success) {
        readings.push(parsed.data);
      } else {
        corrupt++;
      }
    } catch {
      corrupt++;
    }
  }
  if (corrupt > 0) onWarn(`${corrupt} corrupt line(s) in ${label} skipped`);
  return {readings, corrupt};
}

/** Walk the git-side status/v1 tree into key → body (archives
 * decompressed: the r2 plane stores plain .jsonl only). */
export function collectGitTree(
  workdir: string,
  onWarn: (message: string) => void = () => {}
): Map<string, string> {
  const bodies = new Map<string, string>();
  const root = path.join(workdir, 'status', 'v1');

  const archivesDir = path.join(root, 'archives');
  if (fs.existsSync(archivesDir)) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        const match = entry.name.match(/^(history-\d{4}-\d{2}-\d{2}\.jsonl)(\.gz)?$/);
        if (!match) continue;
        const key = path
          .relative(workdir, path.join(dir, match[1]))
          .split(path.sep)
          .join('/');
        if (bodies.has(key) && !match[2]) {
          // Both .jsonl and .jsonl.gz for one day: plain wins (fresher).
          onWarn(`${key} exists both plain and gzipped — using the plain file`);
        } else if (bodies.has(key)) {
          continue;
        }
        try {
          bodies.set(
            key,
            match[2]
              ? zlib.gunzipSync(fs.readFileSync(full)).toString('utf8')
              : fs.readFileSync(full, 'utf8')
          );
        } catch (error) {
          onWarn(`unreadable archive ${full}: ${String(error).slice(0, 120)}`);
        }
      }
    };
    walk(archivesDir);
  }

  for (const rel of ['inputs/incidents.json', 'inputs/maintenance.json']) {
    const file = path.join(root, rel);
    if (fs.existsSync(file)) bodies.set(`${V1}/${rel}`, fs.readFileSync(file, 'utf8'));
  }
  const rawDir = path.join(root, 'raw');
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir).filter(f => f.endsWith('.json'))) {
      bodies.set(`${V1}/raw/${f}`, fs.readFileSync(path.join(rawDir, f), 'utf8'));
    }
  }
  return bodies;
}

type ReadTarget = (key: string) => Promise<string | null>;
type WriteTarget = (key: string, body: string) => Promise<void>;

/** The shared per-object copy protocol (see module header). */
async function copyTree(
  source: Map<string, string>,
  readTarget: ReadTarget,
  writeTarget: WriteTarget,
  options: PlaneMigrateOptions
): Promise<PlaneMigrationReport> {
  const {dryRun = false, onWarn = () => {}} = options;
  const report: PlaneMigrationReport = {
    created: [],
    merged: [],
    skipped: [],
    corruptLines: 0,
    foldedBatches: 0,
  };

  for (const [key, sourceBody] of [...source.entries()].sort()) {
    const kind = isCopyableKey(key);
    if (!kind) {
      onWarn(`${key} is not a copyable status/v1 input — skipped`);
      continue;
    }
    const targetBody = await readTarget(key);
    if (targetBody === null) {
      report.created.push(key);
      if (!dryRun) await writeTarget(key, sourceBody);
      continue;
    }
    if (targetBody === sourceBody) {
      report.skipped.push(key);
      continue;
    }
    if (kind === 'archive') {
      const {readings, corrupt} = parseReadings(sourceBody, key, onWarn);
      report.corruptLines += corrupt;
      const mergedBody = mergeArchiveBytes(targetBody, readings);
      if (mergedBody === targetBody) {
        report.skipped.push(key);
      } else {
        report.merged.push(key);
        if (!dryRun) await writeTarget(key, mergedBody);
      }
    } else {
      // inputs/ and raw/: the migration direction names the source of
      // truth — take the source side whole.
      report.merged.push(key);
      if (!dryRun) await writeTarget(key, sourceBody);
    }
  }
  return report;
}

/**
 * git → r2: copy archives (decompressed) + inputs + raw into the
 * bucket. The caller regenerates derived objects afterwards via
 * regenerateDerivedR2 (§3 write order) — never here, never in dry-run.
 */
export async function migrateGitToR2(
  workdir: string,
  store: ObjectStore,
  options: PlaneMigrateOptions = {}
): Promise<PlaneMigrationReport> {
  const source = collectGitTree(workdir, options.onWarn);
  return copyTree(
    source,
    async key => (await store.get(key))?.body ?? null,
    async (key, body) =>
      void (await store.put(key, body, {
        contentType: key.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json',
      })),
    options
  );
}

/**
 * r2 → git: copy archives + inputs + raw into the workdir tree, then
 * FOLD not-yet-compacted readings/ batches into their day archives so
 * the compaction buffer window survives the move. The caller commits
 * and regenerates (withDataBranch) — never here, never in dry-run.
 */
export async function migrateR2ToGit(
  store: ObjectStore,
  workdir: string,
  options: PlaneMigrateOptions = {}
): Promise<PlaneMigrationReport> {
  const {dryRun = false, onWarn = () => {}} = options;
  const source = new Map<string, string>();
  const batches: Array<{key: string; body: string}> = [];

  for (const prefix of ['archives/', 'inputs/', 'raw/', 'readings/']) {
    for (const key of await store.list(`${V1}/${prefix}`)) {
      const object = await store.get(key);
      if (!object) continue;
      if (prefix === 'readings/') {
        batches.push({key, body: object.body});
      } else if (isCopyableKey(key)) {
        source.set(key, object.body);
      } else {
        onWarn(`${key} is not a copyable status/v1 input — skipped`);
      }
    }
  }

  const fileOf = (key: string) => path.join(workdir, ...key.split('/'));
  const readFile: ReadTarget = async key => {
    const file = fileOf(key);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    // A gzipped-only day on the git side still counts as the target
    // content — merge into it and write plain (the .gz is left alone).
    if (key.endsWith('.jsonl') && fs.existsSync(`${file}.gz`)) {
      return zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).toString('utf8');
    }
    return null;
  };
  const writeFile: WriteTarget = async (key, body) => {
    const file = fileOf(key);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, body);
  };

  const report = await copyTree(source, readFile, writeFile, options);

  // Fold the compaction-buffer batches (grouped by UTC day) into the
  // day archives ON DISK — after the archive copies, so the merge sees
  // the copied content.
  const byDay = new Map<string, CompactReading[]>();
  for (const {key, body} of batches) {
    const stamp = key.match(/readings\/(\d{4}-\d{2}-\d{2})T/)?.[1];
    if (!stamp) {
      onWarn(`unrecognized batch key ${key} left behind`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      onWarn(`unparseable batch ${key} left behind`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      onWarn(`malformed batch ${key} left behind`);
      continue;
    }
    let contributed = false;
    for (const raw of parsed) {
      const reading = compactReadingSchema.safeParse(raw);
      if (!reading.success) {
        report.corruptLines++;
        continue;
      }
      const day = byDay.get(stamp) ?? [];
      day.push(reading.data);
      byDay.set(stamp, day);
      contributed = true;
    }
    if (contributed) report.foldedBatches++;
  }
  for (const [date, readings] of [...byDay.entries()].sort()) {
    const [y, m] = date.split('-');
    const key = `${V1}/archives/${y}/${m}/history-${date}.jsonl`;
    const existing = await readFile(key);
    const mergedBody = mergeArchiveBytes(existing, readings);
    if (mergedBody !== (existing ?? '')) {
      if (!report.created.includes(key) && !report.merged.includes(key)) {
        report.merged.push(key);
      }
      if (!dryRun) await writeFile(key, mergedBody);
    }
  }
  return report;
}
