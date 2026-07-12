/**
 * status/v1 file I/O for the probe (ticket #69): per-entity detail files
 * (parallel-safe — one file per entity), ADR-002 JSONL archive appends,
 * and the recent-readings view used to rebuild summaries.
 */

import fs from 'node:fs';
import path from 'node:path';
import {entityDetailSchema} from '@stentorosaur/core';
import type {CompactReading, EntityDetail} from '@stentorosaur/core';

/**
 * Same slug rules the plugin uses for system file names, hardened:
 * leading/trailing hyphens trimmed, and a deterministic hex fallback for
 * names that slug to nothing (e.g. all-symbol names) so we never write
 * a bare '.json'.
 */
export function entitySlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') {
    return `entity-${Buffer.from(name, 'utf8').toString('hex').slice(0, 16)}`;
  }
  return slug;
}

/**
 * Distinct entity names may collide after slugging ('API v1' and
 * 'API-v1' both become 'api-v1'), which would silently overwrite files
 * and break the one-file-per-entity parallel-safety invariant. Callers
 * run this over the configured entity list before any writes.
 */
export function assertUniqueSlugs(names: string[]): void {
  const bySlug = new Map<string, string[]>();
  for (const name of names) {
    const slug = entitySlug(name);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), name]);
  }
  const collisions = [...bySlug.entries()].filter(([, ns]) => ns.length > 1);
  if (collisions.length > 0) {
    throw new Error(
      'entity names collide after slugging: ' +
        collisions.map(([slug, ns]) => `${ns.join(' / ')} → ${slug}`).join('; ')
    );
  }
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
 * regenerates the summary from after a rebase). A malformed file must
 * not abort the run: it is skipped and reported via onError so one
 * corrupted input can't take the whole data branch down.
 */
export function readAllEntityDetails(
  rootDir: string,
  onError: (file: string, error: unknown) => void = (file, error) =>
    console.warn(`[probe] skipping malformed entity detail ${file}:`, error)
): EntityDetail[] {
  const dir = path.join(rootDir, 'status', 'v1', 'entities');
  if (!fs.existsSync(dir)) return [];
  const details: EntityDetail[] = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const file = path.join(dir, f);
    try {
      details.push(entityDetailSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))));
    } catch (error) {
      onError(file, error);
    }
  }
  return details;
}
