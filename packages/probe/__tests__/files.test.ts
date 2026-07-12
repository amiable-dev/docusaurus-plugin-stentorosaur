/**
 * Per-entity file layer tests (ticket #69): parallel-safe writes (one
 * file per entity), ADR-002 JSONL archive layout, write-side validation.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendArchive, entitySlug, readAllEntityDetails, writeEntityDetail} from '../src/files';
import type {CompactReading} from '@stentorosaur/core';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-files-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const reading = (over: Partial<CompactReading> = {}): CompactReading => ({
  t: Date.UTC(2026, 6, 12, 18),
  svc: 'api',
  state: 'up',
  code: 200,
  lat: 42,
  ...over,
});

describe('entitySlug', () => {
  it('matches the plugin slug rules', () => {
    expect(entitySlug('My API (v2)')).toBe('my-api-v2');
    expect(entitySlug('api')).toBe('api');
  });
});

describe('writeEntityDetail / readAllEntityDetails', () => {
  it('round-trips through validated per-entity files', () => {
    writeEntityDetail(tmp, 'api', [reading()], '2026-07-12T18:00:00.000Z');
    writeEntityDetail(tmp, 'web', [reading({svc: 'web', state: 'down', code: 500, lat: 0})], '2026-07-12T18:00:00.000Z');
    const details = readAllEntityDetails(tmp);
    expect(details.map(d => d.name)).toEqual(['api', 'web']);
    expect(details[0].readings[0].code).toBe(200);
  });

  it('rejects invalid readings at WRITE time', () => {
    expect(() =>
      writeEntityDetail(tmp, 'api', [{...reading(), state: 'sideways' as any}], '2026-07-12T18:00:00.000Z')
    ).toThrow();
    expect(readAllEntityDetails(tmp)).toEqual([]);
  });
});

describe('appendArchive', () => {
  it('appends JSONL under archives/YYYY/MM/history-YYYY-MM-DD.jsonl (UTC)', () => {
    const file = appendArchive(tmp, reading());
    expect(file.endsWith(path.join('archives', '2026', '07', 'history-2026-07-12.jsonl'))).toBe(true);
    appendArchive(tmp, reading({lat: 43}));
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).lat).toBe(43);
  });
});
