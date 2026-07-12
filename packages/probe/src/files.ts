/**
 * status/v1 file I/O for the probe (ticket #69): per-entity detail files
 * (parallel-safe — one file per entity), ADR-002 JSONL archive appends,
 * and the recent-readings view used to rebuild summaries.
 */

import fs from 'node:fs';
import path from 'node:path';
import {entityDetailSchema} from '@stentorosaur/core';
import type {CompactReading, EntityDetail} from '@stentorosaur/core';

/** Same slug rules the plugin uses for system file names. */
export function entitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** status/v1/entities/<slug>.json — validated on WRITE (ADR-005 §2). */
export function writeEntityDetail(
  rootDir: string,
  name: string,
  readings: CompactReading[],
  generatedAt: string
): string {
  const detail: EntityDetail = {
    schemaVersion: 1,
    generatedAt,
    name,
    readings,
  };
  entityDetailSchema.parse(detail);
  const dir = path.join(rootDir, 'status', 'v1', 'entities');
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${entitySlug(name)}.json`);
  fs.writeFileSync(file, JSON.stringify(detail));
  return file;
}

/** archives/YYYY/MM/history-YYYY-MM-DD.jsonl (ADR-002 layout, unchanged). */
export function appendArchive(rootDir: string, reading: CompactReading): string {
  const date = new Date(reading.t);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const dir = path.join(rootDir, 'status', 'v1', 'archives', year, month);
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `history-${year}-${month}-${day}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(reading) + '\n');
  return file;
}

/**
 * Read every entity detail file back (the merged-inputs view a writer
 * regenerates the summary from after a rebase).
 */
export function readAllEntityDetails(rootDir: string): EntityDetail[] {
  const dir = path.join(rootDir, 'status', 'v1', 'entities');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f =>
      entityDetailSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    );
}
