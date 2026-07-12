/**
 * Per-entity file layer tests (ticket #69): parallel-safe writes (one
 * file per entity), ADR-002 JSONL archive layout, write-side validation.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendArchive, assertUniqueSlugs, entitySlug, readAllEntityDetails, writeEntityDetail} from '../src/files';
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
  it('trims leading/trailing hyphens (Council PR #84 r=1)', () => {
    expect(entitySlug('-api-')).toBe('api');
    expect(entitySlug('  api  ')).toBe('api');
  });
  it('never returns empty: symbol-only names get a deterministic hex slug', () => {
    const slug = entitySlug('!!!');
    expect(slug).toMatch(/^entity-[0-9a-f]+$/);
    expect(entitySlug('!!!')).toBe(slug); // deterministic
    expect(entitySlug('???')).not.toBe(slug); // distinct inputs stay distinct
  });
});

describe('assertUniqueSlugs', () => {
  it('throws listing colliding names (silent-overwrite guard)', () => {
    expect(() => assertUniqueSlugs(['API v1', 'API-v1', 'web'])).toThrow(/API v1.*API-v1.*api-v1/s);
  });
  it('passes for distinct slugs', () => {
    expect(() => assertUniqueSlugs(['api', 'web', 'My API (v2)'])).not.toThrow();
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

  it('skips malformed files instead of aborting the run (Council PR #84 r=1)', () => {
    writeEntityDetail(tmp, 'api', [reading()], '2026-07-12T18:00:00.000Z');
    const dir = path.join(tmp, 'status', 'v1', 'entities');
    fs.writeFileSync(path.join(dir, 'corrupt.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'wrong-shape.json'), '{"schemaVersion":1}');
    const errors: string[] = [];
    const details = readAllEntityDetails(tmp, file => errors.push(path.basename(file)));
    expect(details.map(d => d.name)).toEqual(['api']);
    expect(errors.sort()).toEqual(['corrupt.json', 'wrong-shape.json']);
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
