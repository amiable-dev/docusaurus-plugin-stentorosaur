/**
 * Plane portability (ADR-006 §6; ticket #102): golden round-trip,
 * idempotence both directions, dry-run writes nothing, and the
 * compaction-buffer fold on r2→git.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {buildDailyRollups} from '@stentorosaur/core/summary';
import type {CompactReading} from '@stentorosaur/core';
import {MemoryObjectStore} from '../src/object-store';
import {V1, writeReadingsBatch} from '../src/r2-plane';
import {collectGitTree, migrateGitToR2, migrateR2ToGit} from '../src/plane-migrate';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plane-migrate-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const reading = (svc: string, iso: string, lat = 40): CompactReading => ({
  t: Date.parse(iso),
  svc,
  state: 'up',
  code: 200,
  lat,
});

function archiveFile(workdir: string, date: string): string {
  const [y, m] = date.split('-');
  return path.join(workdir, 'status', 'v1', 'archives', y, m, `history-${date}.jsonl`);
}

/** Write a day archive the way the probe/compactor would: one JSON per
 * line, (t, svc)-sorted, trailing newline. */
function seedGitDay(workdir: string, date: string, readings: CompactReading[]): string {
  const file = archiveFile(workdir, date);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const sorted = [...readings].sort((a, b) => a.t - b.t || a.svc.localeCompare(b.svc));
  const body = sorted.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(file, body);
  return body;
}

/** 90 days × 3 entities × 2 readings/day. */
function seedNinetyDays(workdir: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const start = Date.parse('2026-04-01T00:00:00Z');
  for (let d = 0; d < 90; d++) {
    const date = new Date(start + d * 86_400_000).toISOString().split('T')[0];
    const readings = ['api', 'web', 'db'].flatMap(svc => [
      reading(svc, `${date}T06:00:00.000Z`, 20 + d),
      reading(svc, `${date}T18:00:00.000Z`, 30 + d),
    ]);
    bodies.set(`${V1}/archives/${date.slice(0, 4)}/${date.slice(5, 7)}/history-${date}.jsonl`,
      seedGitDay(workdir, date, readings));
  }
  return bodies;
}

function allGitReadings(workdir: string): CompactReading[] {
  return [...collectGitTree(workdir).entries()]
    .filter(([key]) => key.includes('/archives/'))
    .flatMap(([, body]) =>
      body.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as CompactReading)
    );
}

describe('golden round-trip (acceptance criterion 1)', () => {
  it('90 days round-trip git → r2 → git byte-identically with identical rollups', async () => {
    const sourceDir = path.join(tmp, 'source');
    const bodies = seedNinetyDays(sourceDir);
    fs.mkdirSync(path.join(sourceDir, 'status', 'v1', 'inputs'), {recursive: true});
    fs.writeFileSync(path.join(sourceDir, 'status', 'v1', 'inputs', 'incidents.json'), '[]');
    fs.mkdirSync(path.join(sourceDir, 'status', 'v1', 'raw'), {recursive: true});
    fs.writeFileSync(
      path.join(sourceDir, 'status', 'v1', 'raw', '7.json'),
      JSON.stringify({schemaVersion: 1, issueNumber: 7, updatedAt: '2026-07-01T00:00:00Z', bodyMarkdown: 'x'})
    );

    const store = new MemoryObjectStore();
    const up = await migrateGitToR2(sourceDir, store);
    expect(up.created).toHaveLength(92); // 90 archives + incidents + raw
    expect(up.merged).toEqual([]);

    // Every object byte-identical to its source file.
    for (const [key, body] of bodies) {
      expect((await store.get(key))!.body).toBe(body);
    }

    const backDir = path.join(tmp, 'back');
    const down = await migrateR2ToGit(store, backDir);
    expect(down.created).toHaveLength(92);
    expect(down.merged).toEqual([]);
    for (const [key, body] of bodies) {
      expect(fs.readFileSync(path.join(backDir, ...key.split('/')), 'utf8')).toBe(body);
    }
    expect(fs.readFileSync(path.join(backDir, 'status', 'v1', 'inputs', 'incidents.json'), 'utf8')).toBe('[]');

    // Identical day-level rollups (the ticket #75 golden standard).
    expect(buildDailyRollups(allGitReadings(backDir))).toEqual(
      buildDailyRollups(allGitReadings(sourceDir))
    );
  });
});

describe('idempotence (acceptance criterion 2)', () => {
  it('a re-run in each direction skips everything and writes nothing', async () => {
    const sourceDir = path.join(tmp, 'source');
    seedGitDay(sourceDir, '2026-07-01', [reading('api', '2026-07-01T10:00:00.000Z')]);
    const store = new MemoryObjectStore();

    await migrateGitToR2(sourceDir, store);
    const opsBefore = store.ops.length;
    const second = await migrateGitToR2(sourceDir, store);
    expect(second.created).toEqual([]);
    expect(second.merged).toEqual([]);
    expect(second.skipped).toHaveLength(1);
    expect(store.ops.slice(opsBefore).filter(op => op.op === 'put')).toEqual([]);

    const backDir = path.join(tmp, 'back');
    await migrateR2ToGit(store, backDir);
    const file = archiveFile(backDir, '2026-07-01');
    const mtime = fs.statSync(file).mtimeMs;
    const downSecond = await migrateR2ToGit(store, backDir);
    expect(downSecond.created).toEqual([]);
    expect(downSecond.merged).toEqual([]);
    expect(fs.statSync(file).mtimeMs).toBe(mtime); // untouched
  });
});

describe('--dry-run writes nothing (acceptance criterion 3)', () => {
  it('git → r2 dry run performs zero puts but reports the full plan', async () => {
    const sourceDir = path.join(tmp, 'source');
    seedGitDay(sourceDir, '2026-07-01', [reading('api', '2026-07-01T10:00:00.000Z')]);
    const store = new MemoryObjectStore();
    const report = await migrateGitToR2(sourceDir, store, {dryRun: true});
    expect(report.created).toHaveLength(1);
    expect(store.ops.filter(op => op.op === 'put')).toEqual([]);
    expect(store.keys()).toEqual([]);
  });

  it('r2 → git dry run leaves the filesystem untouched', async () => {
    const store = new MemoryObjectStore();
    await store.put(`${V1}/archives/2026/07/history-2026-07-01.jsonl`, `${JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z'))}\n`);
    await writeReadingsBatch(store, [reading('api', '2026-07-02T10:00:00.000Z')], '2026-07-02T10:00:00.000Z', 'r1');
    const backDir = path.join(tmp, 'back');
    const report = await migrateR2ToGit(store, backDir, {dryRun: true});
    // The copied archive AND the fold-only day both report as creates
    // (fold-only-day labeling — Council PR #109 polish).
    expect(report.created).toHaveLength(2);
    expect(report.foldedBatches).toBe(1);
    expect(fs.existsSync(path.join(backDir, 'status'))).toBe(false);
  });
});

describe('zero-loss details', () => {
  it('r2 → git folds not-yet-compacted readings batches into day archives', async () => {
    const store = new MemoryObjectStore();
    await store.put(
      `${V1}/archives/2026/07/history-2026-07-01.jsonl`,
      `${JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z'))}\n`
    );
    // Two batches inside the compaction buffer, one overlapping the day archive.
    await writeReadingsBatch(store, [
      reading('api', '2026-07-01T10:00:00.000Z', 99), // dup: archive wins
      reading('api', '2026-07-01T23:55:00.000Z'),
    ], '2026-07-01T23:55:00.000Z', 'r1');
    await writeReadingsBatch(store, [reading('api', '2026-07-02T00:05:00.000Z')], '2026-07-02T00:05:00.000Z', 'r2');

    const backDir = path.join(tmp, 'back');
    const report = await migrateR2ToGit(store, backDir);
    expect(report.foldedBatches).toBe(2);

    const day1 = fs.readFileSync(archiveFile(backDir, '2026-07-01'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(day1).toHaveLength(2);
    expect(day1[0].lat).toBe(40); // archive won the (svc, t) collision
    const day2 = fs.readFileSync(archiveFile(backDir, '2026-07-02'), 'utf8').trim().split('\n');
    expect(day2).toHaveLength(1);
  });

  it('derived and operational objects are never copied to git', async () => {
    const store = new MemoryObjectStore();
    await store.put(`${V1}/summary.json`, '{}');
    await store.put(`${V1}/entities/api.json`, '{}');
    await store.put(`${V1}/incidents.atom`, '<feed/>');
    await store.put(`${V1}/compaction-state.json`, '{}');
    await store.put(`${V1}/inputs/incidents.json`, '[]');

    const backDir = path.join(tmp, 'back');
    const report = await migrateR2ToGit(store, backDir);
    expect(report.created).toEqual([`${V1}/inputs/incidents.json`]);
    expect(fs.existsSync(path.join(backDir, 'status', 'v1', 'summary.json'))).toBe(false);
    expect(fs.existsSync(path.join(backDir, 'status', 'v1', 'compaction-state.json'))).toBe(false);
  });

  it('gzipped git archives are decompressed for r2 (plain .jsonl keys only)', async () => {
    const sourceDir = path.join(tmp, 'source');
    const body = `${JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z'))}\n`;
    const file = archiveFile(sourceDir, '2026-07-01');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(`${file}.gz`, zlib.gzipSync(body));

    const store = new MemoryObjectStore();
    await migrateGitToR2(sourceDir, store);
    expect((await store.get(`${V1}/archives/2026/07/history-2026-07-01.jsonl`))!.body).toBe(body);
    expect(store.keys().some(k => k.endsWith('.gz'))).toBe(false);
  });

  it('a corrupt target-side .gz never aborts r2 → git (Council r=1)', async () => {
    const store = new MemoryObjectStore();
    const body = `${JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z'))}\n`;
    await store.put(`${V1}/archives/2026/07/history-2026-07-01.jsonl`, body);

    const backDir = path.join(tmp, 'back');
    const gzFile = `${archiveFile(backDir, '2026-07-01')}.gz`;
    fs.mkdirSync(path.dirname(gzFile), {recursive: true});
    fs.writeFileSync(gzFile, 'not actually gzip');

    const warnings: string[] = [];
    const report = await migrateR2ToGit(store, backDir, {onWarn: m => warnings.push(m)});
    expect(warnings.join(' ')).toMatch(/unreadable .*\.gz treated as absent/);
    expect(report.created).toEqual([`${V1}/archives/2026/07/history-2026-07-01.jsonl`]);
    expect(fs.readFileSync(archiveFile(backDir, '2026-07-01'), 'utf8')).toBe(body);
    expect(fs.readFileSync(gzFile, 'utf8')).toBe('not actually gzip'); // left for inspection
  });

  it('warns about a plain+gz pair in either readdir order (Council r=1)', async () => {
    const sourceDir = path.join(tmp, 'source');
    const body = `${JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z'))}\n`;
    // Plain sorts BEFORE .gz alphabetically — the previously-silent order.
    seedGitDay(sourceDir, '2026-07-01', [reading('api', '2026-07-01T10:00:00.000Z')]);
    fs.writeFileSync(`${archiveFile(sourceDir, '2026-07-01')}.gz`, zlib.gzipSync('{"stale":1}\n'));

    const warnings: string[] = [];
    const tree = collectGitTree(sourceDir, m => warnings.push(m));
    expect(warnings.join(' ')).toMatch(/both plain and gzipped/);
    expect(tree.get(`${V1}/archives/2026/07/history-2026-07-01.jsonl`)).toBe(body); // plain won
  });

  it('divergent archives merge by (svc, t) with deterministic order', async () => {
    const sourceDir = path.join(tmp, 'source');
    seedGitDay(sourceDir, '2026-07-01', [
      reading('api', '2026-07-01T10:00:00.000Z', 7),
      reading('web', '2026-07-01T11:00:00.000Z'),
    ]);
    const store = new MemoryObjectStore();
    const key = `${V1}/archives/2026/07/history-2026-07-01.jsonl`;
    await store.put(key, [
      JSON.stringify(reading('api', '2026-07-01T10:00:00.000Z', 99)), // collision: target wins
      JSON.stringify(reading('db', '2026-07-01T12:00:00.000Z')),
    ].join('\n') + '\n');

    const report = await migrateGitToR2(sourceDir, store);
    expect(report.merged).toEqual([key]);
    const lines = (await store.get(key))!.body.trim().split('\n').map(l => JSON.parse(l));
    expect(lines.map(l => l.svc)).toEqual(['api', 'web', 'db']); // (t, svc) order
    expect(lines[0].lat).toBe(99); // pre-existing target reading preserved
  });

  it('inputs take the source side whole when they differ', async () => {
    const sourceDir = path.join(tmp, 'source');
    fs.mkdirSync(path.join(sourceDir, 'status', 'v1', 'inputs'), {recursive: true});
    fs.writeFileSync(path.join(sourceDir, 'status', 'v1', 'inputs', 'incidents.json'), '[{"new": true}]');
    const store = new MemoryObjectStore();
    await store.put(`${V1}/inputs/incidents.json`, '[{"old": true}]');

    await migrateGitToR2(sourceDir, store);
    expect((await store.get(`${V1}/inputs/incidents.json`))!.body).toBe('[{"new": true}]');
  });
});
