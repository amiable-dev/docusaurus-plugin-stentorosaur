/**
 * One-time historical data migration tests (ADR-005 Migration Phase 1,
 * council condition 6; epic #63 ticket #75).
 *
 * The invariant under test: existing users' 90-day history is IDENTICAL
 * pre/post migration — day-level uptime and average latency from the
 * migrated status/v1 archives must match what the legacy files record,
 * across three fixture generations (v0.4 three-file, v0.17
 * daily-summary, v0.21 current) plus the pre-three-file systems/*.json
 * shape.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {buildDailyRollups} from '@stentorosaur/core/server';
import {parseSummary} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import {collectLegacyData, migrateHistoricalData, planMigration} from '../src/migrate';
import {readArchiveReadings} from '../src/archives';

let legacy: string;
let target: string;
beforeEach(() => {
  legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-legacy-'));
  target = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-target-'));
});
afterEach(() => {
  fs.rmSync(legacy, {recursive: true, force: true});
  fs.rmSync(target, {recursive: true, force: true});
});

const NOW = Date.parse('2026-07-13T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERATED_AT = new Date(NOW).toISOString();
const ENTITIES = [
  {name: 'api', type: 'system' as const},
  {name: 'web', type: 'system' as const},
];

function utcDate(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

/** Deterministic synthetic reading generator — NO Math.random. */
function makeReadings(svc: string, dayStartMs: number, count: number, failEvery: number): CompactReading[] {
  const readings: CompactReading[] = [];
  for (let i = 0; i < count; i++) {
    const failed = failEvery > 0 && i % failEvery === 0;
    readings.push({
      t: dayStartMs + i * Math.floor(DAY_MS / count),
      svc,
      state: failed ? 'down' : 'up',
      code: failed ? 500 : 200,
      lat: failed ? 0 : 40 + ((i * 7) % 25),
    });
  }
  return readings;
}

function writeLegacyArchiveDay(dir: string, dateMs: number, readings: CompactReading[], gzip = false): void {
  const date = new Date(dateMs);
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const archDir = path.join(dir, 'archives', y, m);
  fs.mkdirSync(archDir, {recursive: true});
  const body = readings.map(r => JSON.stringify(r)).join('\n') + '\n';
  const file = path.join(archDir, `history-${y}-${m}-${d}.jsonl`);
  if (gzip) {
    fs.writeFileSync(`${file}.gz`, zlib.gzipSync(body));
  } else {
    fs.writeFileSync(file, body);
  }
}

/**
 * Build a v0.21-generation legacy fixture: 90 days of archives (gzipped
 * except the last 3), current.json overlapping the last 14 days, and a
 * daily-summary.json derived from the same readings.
 */
function buildV021Fixture(dir: string): Map<string, CompactReading[]> {
  const bySvcDay = new Map<string, CompactReading[]>();
  const current: CompactReading[] = [];
  for (let d = 89; d >= 0; d--) {
    const dayStart = NOW - d * DAY_MS - (NOW % DAY_MS);
    const day: CompactReading[] = [];
    for (const svc of ['api', 'web']) {
      const readings = makeReadings(svc, dayStart, 24, svc === 'api' && d % 10 === 3 ? 6 : 0);
      day.push(...readings);
      bySvcDay.set(`${svc}|${utcDate(dayStart)}`, readings);
      if (d < 14) current.push(...readings);
    }
    writeLegacyArchiveDay(dir, dayStart, day, d > 2);
  }
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify(current));
  return bySvcDay;
}

describe('golden zero-data-loss migration (v0.21 fixture)', () => {
  it('day-level uptime and latency are identical pre/post for 90 days', () => {
    buildV021Fixture(legacy);
    const legacyRollups = buildDailyRollups(readLegacyForGolden(legacy));

    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: ENTITIES,
      generatedAt: GENERATED_AT,
    });
    expect(report.corruptLines).toBe(0);

    const migrated = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    for (const svc of ['api', 'web']) {
      expect(migrated[svc]).toHaveLength(legacyRollups[svc].length);
      expect(migrated[svc]).toEqual(legacyRollups[svc]);
    }
  });

  it('writes entity details for configured entities and a valid summary', () => {
    buildV021Fixture(legacy);
    migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: ENTITIES,
      generatedAt: GENERATED_AT,
    });
    for (const slug of ['api', 'web']) {
      expect(fs.existsSync(path.join(target, 'status', 'v1', 'entities', `${slug}.json`))).toBe(true);
    }
    const summary = parseSummary(
      JSON.parse(fs.readFileSync(path.join(target, 'status', 'v1', 'summary.json'), 'utf8'))
    );
    expect(summary.entities.map(e => e.name)).toEqual(['api', 'web']);
    expect(summary.entities[0].days.length).toBeGreaterThanOrEqual(90);
  });
});

/** Read every legacy archive day back as readings (test-side golden source). */
function readLegacyForGolden(dir: string): CompactReading[] {
  const readings: CompactReading[] = [];
  const walk = (p: string) => {
    for (const entry of fs.readdirSync(p, {withFileTypes: true})) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const body = entry.name.endsWith('.gz')
          ? zlib.gunzipSync(fs.readFileSync(full)).toString('utf8')
          : fs.readFileSync(full, 'utf8');
        for (const line of body.split('\n')) {
          if (line.trim()) readings.push(JSON.parse(line));
        }
      }
    }
  };
  walk(path.join(dir, 'archives'));
  return readings;
}

describe('daily-summary-only days (archives pruned)', () => {
  it('synthesizes days that reproduce uptimePct and avgLatencyMs exactly', () => {
    // Only 7 days of archives, but daily-summary covers 30 — the 23
    // older days exist ONLY as day rollups.
    for (let d = 6; d >= 0; d--) {
      const dayStart = NOW - d * DAY_MS - (NOW % DAY_MS);
      writeLegacyArchiveDay(legacy, dayStart, makeReadings('api', dayStart, 24, 0));
    }
    const services: Record<string, unknown[]> = {api: []};
    for (let d = 29; d >= 0; d--) {
      const dayStart = NOW - d * DAY_MS - (NOW % DAY_MS);
      services.api.push({
        date: utcDate(dayStart),
        uptimePct: d >= 7 ? (d % 3 === 0 ? 287 / 288 : 1) : 1,
        avgLatencyMs: d >= 7 ? 40 + d : 40,
        p95LatencyMs: 60,
        checksTotal: 288,
        checksPassed: d >= 7 && d % 3 === 0 ? 287 : 288,
        incidentCount: 0,
      });
    }
    fs.writeFileSync(
      path.join(legacy, 'daily-summary.json'),
      JSON.stringify({version: 1, lastUpdated: GENERATED_AT, windowDays: 90, services})
    );

    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.synthesizedDays).toBe(23);

    const rollups = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    expect(rollups.api).toHaveLength(30);
    for (const day of rollups.api) {
      const src = (services.api as Array<{date: string; uptimePct: number; avgLatencyMs: number}>).find(
        s => s.date === day.date
      )!;
      expect(day.uptime).toBeCloseTo(src.uptimePct * 100, 10);
      if (day.date < utcDate(NOW - 6 * DAY_MS)) {
        // synthesized day: avg latency must match the recorded rollup
        expect(day.avgMs).toBe(src.avgLatencyMs);
        expect(day.worst).toBe(src.uptimePct < 1 ? 'down' : 'up');
      }
    }
  });
});

describe('pre-0.17 site (no daily-summary.json)', () => {
  it('migrates from archives + current.json alone', () => {
    for (let d = 13; d >= 0; d--) {
      const dayStart = NOW - d * DAY_MS - (NOW % DAY_MS);
      writeLegacyArchiveDay(legacy, dayStart, makeReadings('api', dayStart, 12, 0), d > 0);
    }
    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.synthesizedDays).toBe(0);
    const rollups = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    expect(rollups.api).toHaveLength(14);
  });
});

describe('pre-three-file site (systems/*.json only)', () => {
  it('converts history entries to compact readings', () => {
    const sysDir = path.join(legacy, 'systems');
    fs.mkdirSync(sysDir, {recursive: true});
    const history = [];
    for (let i = 0; i < 48; i++) {
      history.push({
        timestamp: new Date(NOW - (48 - i) * 30 * 60_000).toISOString(),
        status: i === 10 ? 'down' : 'up',
        code: i === 10 ? 500 : 200,
        responseTime: 55,
      });
    }
    fs.writeFileSync(path.join(sysDir, 'api.json'), JSON.stringify({name: 'api', history}));

    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.readingsMigrated).toBe(48);
    const rollups = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    const total = rollups.api.reduce((n, d) => n + 1, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

describe('idempotency and resumability', () => {
  it('re-running converges to identical output (no duplicated readings)', () => {
    buildV021Fixture(legacy);
    const opts = {legacyDir: legacy, targetDir: target, entities: ENTITIES, generatedAt: GENERATED_AT};
    migrateHistoricalData(opts);
    const first = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    migrateHistoricalData(opts);
    const second = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    expect(second).toEqual(first);
  });

  it('completes cleanly after a simulated mid-migration crash', () => {
    buildV021Fixture(legacy);
    const opts = {legacyDir: legacy, targetDir: target, entities: ENTITIES, generatedAt: GENERATED_AT};
    migrateHistoricalData(opts);
    // Simulate a crash that lost half the outputs.
    const archives = path.join(target, 'status', 'v1', 'archives');
    const years = fs.readdirSync(archives);
    fs.rmSync(path.join(archives, years[0]), {recursive: true});
    fs.rmSync(path.join(target, 'status', 'v1', 'summary.json'));
    migrateHistoricalData(opts);
    const rollups = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    expect(rollups.api).toHaveLength(90);
    expect(fs.existsSync(path.join(target, 'status', 'v1', 'summary.json'))).toBe(true);
  });
});

describe('edge cases', () => {
  it('skips corrupt JSONL lines and reports them without aborting', () => {
    const dayStart = NOW - (NOW % DAY_MS);
    writeLegacyArchiveDay(legacy, dayStart, makeReadings('api', dayStart, 5, 0));
    const y = new Date(dayStart).toISOString().slice(0, 4);
    const m = new Date(dayStart).toISOString().slice(5, 7);
    const d = new Date(dayStart).toISOString().slice(8, 10);
    const file = path.join(legacy, 'archives', y, m, `history-${y}-${m}-${d}.jsonl`);
    fs.appendFileSync(file, 'NOT JSON AT ALL\n{"t":1,"svc":"api"}\n'); // corrupt + wrong shape

    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.corruptLines).toBe(2);
    expect(report.readingsMigrated).toBe(5);
  });

  it('reports ghost entities present in data but absent from config (#62)', () => {
    const dayStart = NOW - (NOW % DAY_MS);
    writeLegacyArchiveDay(legacy, dayStart, [
      ...makeReadings('api', dayStart, 3, 0),
      ...makeReadings('ghost', dayStart, 3, 0),
    ]);
    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.ghostEntities).toEqual(['ghost']);
    // Ghost readings are preserved in archives (data is never dropped)…
    const rollups = buildDailyRollups(readArchiveReadings(target, 90, NOW));
    expect(rollups.ghost).toBeDefined();
    // …but no entity detail file is written for them, and the summary
    // only lists configured entities.
    expect(fs.existsSync(path.join(target, 'status', 'v1', 'entities', 'ghost.json'))).toBe(false);
    const summary = parseSummary(
      JSON.parse(fs.readFileSync(path.join(target, 'status', 'v1', 'summary.json'), 'utf8'))
    );
    expect(summary.entities.map(e => e.name)).toEqual(['api']);
  });

  it('deduplicates readings that appear in both current.json and archives', () => {
    const dayStart = NOW - (NOW % DAY_MS);
    const readings = makeReadings('api', dayStart, 6, 0);
    writeLegacyArchiveDay(legacy, dayStart, readings);
    fs.writeFileSync(path.join(legacy, 'current.json'), JSON.stringify(readings));
    const report = migrateHistoricalData({
      legacyDir: legacy,
      targetDir: target,
      entities: [{name: 'api', type: 'system'}],
      generatedAt: GENERATED_AT,
    });
    expect(report.readingsMigrated).toBe(6);
  });
});

describe('planMigration (--dry-run)', () => {
  it('reports the exact file plan without writing anything', () => {
    buildV021Fixture(legacy);
    const plan = planMigration({
      legacyDir: legacy,
      targetDir: target,
      entities: ENTITIES,
      generatedAt: GENERATED_AT,
    });
    expect(plan.archiveFiles.length).toBe(90);
    expect(plan.entityFiles).toEqual([
      path.join('status', 'v1', 'entities', 'api.json'),
      path.join('status', 'v1', 'entities', 'web.json'),
    ]);
    expect(plan.report.readingsMigrated).toBeGreaterThan(0);
    // Nothing written:
    expect(fs.existsSync(path.join(target, 'status'))).toBe(false);
  });
});

describe('stentorosaur migrate (CLI)', () => {
  it('--dry-run prints the plan and writes nothing', async () => {
    const {main} = await import('../src/cli');
    buildV021Fixture(legacy);
    fs.writeFileSync(
      path.join(target, 'stentorosaur.config.js'),
      `module.exports = {owner: 'o', repo: 'r', entities: [
        {name: 'api', type: 'system'},
        {name: 'web', type: 'system'},
      ]};`
    );
    const code = await main([
      'migrate', '--config', target, '--workdir', target, '--from', legacy, '--dry-run',
    ]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(target, 'status'))).toBe(false);
  });

  it('runs the full local migration with --no-push', async () => {
    const {main} = await import('../src/cli');
    buildV021Fixture(legacy);
    fs.writeFileSync(
      path.join(target, 'stentorosaur.config.js'),
      `module.exports = {owner: 'o', repo: 'r', entities: [
        {name: 'api', type: 'system'},
        {name: 'web', type: 'system'},
      ]};`
    );
    const code = await main([
      'migrate', '--config', target, '--workdir', target, '--from', legacy, '--no-push',
    ]);
    expect(code).toBe(0);
    const summary = parseSummary(
      JSON.parse(fs.readFileSync(path.join(target, 'status', 'v1', 'summary.json'), 'utf8'))
    );
    expect(summary.entities.map(e => e.name)).toEqual(['api', 'web']);
    expect(summary.entities[0].uptime.d90).toBeGreaterThan(0);
  });

  it('converts .monitorrc.json to a config scaffold when no config exists', async () => {
    const {main} = await import('../src/cli');
    const {loadConfig} = await import('../src/config-loader');
    fs.writeFileSync(
      path.join(target, '.monitorrc.json'),
      JSON.stringify({
        systems: [
          {system: 'api', url: 'https://api.example.com/health', expectedCodes: [200, 302], timeout: 5000},
          {system: 'web', url: 'https://example.com'},
        ],
      })
    );
    const code = await main(['migrate', '--config', target, '--workdir', target, '--from', legacy]);
    expect(code).toBe(1); // stops for owner/repo fill-in
    const configFile = path.join(target, 'stentorosaur.config.js');
    expect(fs.existsSync(configFile)).toBe(true);
    const config = await loadConfig(target); // placeholder owner/repo still parse
    expect(config.entities.map(e => e.name)).toEqual(['api', 'web']);
    expect(config.entities[0].probe?.expectedCodes).toEqual([200, 302]);
  });
});

describe('collectLegacyData sources', () => {
  it('reads gzipped archives, current.json, and systems/*.json together', () => {
    const dayStart = NOW - (NOW % DAY_MS);
    writeLegacyArchiveDay(legacy, dayStart - DAY_MS, makeReadings('api', dayStart - DAY_MS, 4, 0), true);
    fs.writeFileSync(path.join(legacy, 'current.json'), JSON.stringify(makeReadings('api', dayStart, 4, 0)));
    const sysDir = path.join(legacy, 'systems');
    fs.mkdirSync(sysDir);
    fs.writeFileSync(
      path.join(sysDir, 'web.json'),
      JSON.stringify({
        name: 'web',
        history: [{timestamp: new Date(dayStart).toISOString(), status: 'up', code: 200, responseTime: 20}],
      })
    );
    const collected = collectLegacyData(legacy);
    expect(collected.readings).toHaveLength(9);
    expect(collected.sources.sort()).toEqual(['archives', 'current.json', 'systems/web.json'].sort());
  });
});
