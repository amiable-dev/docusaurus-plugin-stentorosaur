/**
 * Archive reader (ticket #70): the last-N-days window of JSONL readings
 * feeding the summary's daily rollups. Supports plain and gzipped files
 * (the compression workflow gzips yesterday+, ADR-002).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type {CompactReading} from '@stentorosaur/core';

const DAY_MS = 24 * 60 * 60 * 1000;

export function readArchiveReadings(
  rootDir: string,
  days: number,
  now: number
): CompactReading[] {
  const archivesDir = path.join(rootDir, 'status', 'v1', 'archives');
  const readings: CompactReading[] = [];
  const cutoff = now - days * DAY_MS;

  for (let d = 0; d < days; d++) {
    const date = new Date(now - d * DAY_MS);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const base = path.join(archivesDir, year, month, `history-${year}-${month}-${day}.jsonl`);

    let content: string | null = null;
    if (fs.existsSync(base)) {
      content = fs.readFileSync(base, 'utf8');
    } else if (fs.existsSync(`${base}.gz`)) {
      content = zlib.gunzipSync(fs.readFileSync(`${base}.gz`)).toString('utf8');
    }
    if (!content) continue;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const reading = JSON.parse(line) as CompactReading;
        if (typeof reading.t === 'number' && reading.t >= cutoff) {
          readings.push(reading);
        }
      } catch {
        // One corrupt line must not lose the day.
      }
    }
  }
  return readings;
}
