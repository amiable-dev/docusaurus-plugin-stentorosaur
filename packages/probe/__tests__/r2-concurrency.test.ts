/**
 * R2-plane concurrency cases (ADR-006 council condition 5; epic #97
 * ticket #103): the write-order consistency model (§3) and compaction
 * safety under race, plus the compaction-backlog volume case carried
 * from the PR #108 Council PASS.
 *
 * Interleaving is forced with a YieldingStore: every operation yields
 * the microtask queue via setImmediate, so two concurrent pipelines
 * genuinely interleave instead of running to completion back-to-back.
 */

import {parseSummary} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import {MemoryObjectStore} from '../src/object-store';
import type {ObjectStore, PutOptions} from '../src/object-store';
import {V1, regenerateDerivedR2, writeReadingsBatch} from '../src/r2-plane';
import {compactReadingsR2} from '../src/r2-compaction';

const yieldTurn = () => new Promise<void>(resolve => setImmediate(resolve));

/** Every op yields the event loop — forces real interleaving. */
class YieldingStore implements ObjectStore {
  constructor(readonly inner: MemoryObjectStore) {}
  async get(key: string) {
    await yieldTurn();
    return this.inner.get(key);
  }
  async put(key: string, body: string, options?: PutOptions) {
    await yieldTurn();
    return this.inner.put(key, body, options);
  }
  async list(prefix: string) {
    await yieldTurn();
    return this.inner.list(prefix);
  }
  async delete(key: string) {
    await yieldTurn();
    return this.inner.delete(key);
  }
}

const reading = (svc: string, iso: string, lat: number): CompactReading => ({
  t: Date.parse(iso),
  svc,
  state: 'up',
  code: 200,
  lat,
});

const ENTITIES = [
  {name: 'alpha', type: 'system' as const},
  {name: 'beta', type: 'system' as const},
];

function regenOpts(generatedAt: string, extra: Partial<Parameters<typeof regenerateDerivedR2>[1]> = {}) {
  return {
    generatedAt,
    generatedBy: 'concurrency-test',
    entities: ENTITIES,
    siteTitle: 'T',
    siteUrl: 'https://t.example.com',
    maxRetries: 10,
    ...extra,
  };
}

async function countAllStoredReadings(store: MemoryObjectStore): Promise<number> {
  const seen = new Set<string>();
  for (const key of await store.list(`${V1}/archives/`)) {
    const body = (await store.get(key))!.body;
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as CompactReading;
      seen.add(`${r.svc}|${r.t}`);
    }
  }
  for (const key of await store.list(`${V1}/readings/`)) {
    const body = (await store.get(key))!.body;
    for (const r of JSON.parse(body) as CompactReading[]) {
      seen.add(`${r.svc}|${r.t}`);
    }
  }
  return seen.size;
}

describe('torn-state detector (acceptance criterion 3, single writer)', () => {
  it('a sampler during a regenerate never sees the summary newer than its details', async () => {
    const inner = new MemoryObjectStore();
    const store = new YieldingStore(inner);
    const T1 = '2026-07-15T10:00:00.000Z';
    const T2 = '2026-07-15T10:00:30.000Z';

    // Prior committed state at T1, details included.
    await writeReadingsBatch(store, [reading('alpha', T1, 11), reading('beta', T1, 12)], T1, 'p1');
    await regenerateDerivedR2(store, regenOpts(T1));

    // §3 order (details → summary LAST): within one writer, a summary
    // must never be observed NEWER than a detail it references —
    // that ordering violation is the definition of a torn write.
    // Readings change between runs so hash-skip cannot leave stale
    // details legitimately.
    const violations: string[] = [];
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const summaryObj = await inner.get(`${V1}/summary.json`);
        if (summaryObj) {
          const summary = parseSummary(JSON.parse(summaryObj.body)); // throws on torn JSON
          for (const entity of ENTITIES) {
            const detail = await inner.get(`${V1}/entities/${entity.name}.json`);
            if (detail) {
              const {generatedAt} = JSON.parse(detail.body) as {generatedAt: string};
              if (Date.parse(generatedAt) < Date.parse(summary.generatedAt)) {
                violations.push(
                  `summary@${summary.generatedAt} newer than ${entity.name} detail@${generatedAt}`
                );
              }
            }
          }
        }
        await yieldTurn();
      }
    })();

    await writeReadingsBatch(store, [reading('alpha', T2, 21), reading('beta', T2, 22)], T2, 'p2');
    await regenerateDerivedR2(store, regenOpts(T2));

    sampling = false;
    await sampler;
    expect(violations).toEqual([]);
    expect(
      parseSummary(JSON.parse((await inner.get(`${V1}/summary.json`))!.body)).generatedAt
    ).toBe(T2);
  });
});

describe('probe regenerate racing an incident regenerate (council case A)', () => {
  it('converges with no torn summary; the loser retries through If-Match', async () => {
    const inner = new MemoryObjectStore();
    const store = new YieldingStore(inner);

    const T1 = '2026-07-15T10:00:00.000Z';
    const T2 = '2026-07-15T10:00:30.000Z';
    await writeReadingsBatch(store, [reading('alpha', T1, 11), reading('beta', T1, 12)], T1, 'p1');

    const incident = {
      issueNumber: 9,
      title: 'beta degraded',
      severity: 'major',
      status: 'open',
      entities: ['beta'],
      createdAt: T1,
      closedAt: null,
      bodyHtml: '<p>x</p>',
    };

    // Sampler for the race: every observed summary must be schema-valid
    // (no torn JSON, no partial object) — cross-writer generatedAt
    // ordering is NOT an invariant here, since the older-stamped writer
    // legitimately rewrites details during its If-Match retry.
    let sampled = 0;
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const summaryObj = await inner.get(`${V1}/summary.json`);
        if (summaryObj) {
          parseSummary(JSON.parse(summaryObj.body)); // throws on any torn state
          sampled++;
        }
        await yieldTurn();
      }
    })();

    // ── the race: a probe regenerate and an incident-sync regenerate
    // interleaved op-by-op.
    const probe = (async () => {
      await writeReadingsBatch(store, [reading('alpha', T2, 21), reading('beta', T2, 22)], T2, 'p2');
      return regenerateDerivedR2(store, regenOpts(T2));
    })();
    const incidents = (async () => {
      await store.put(`${V1}/inputs/incidents.json`, JSON.stringify([incident]));
      return regenerateDerivedR2(store, regenOpts(T1));
    })();
    const [probeResult, incidentResult] = await Promise.all([probe, incidents]);

    sampling = false;
    await sampler;
    expect(sampled).toBeGreaterThan(0);

    // Convergence: the incident writer commits AFTER its input write,
    // and every successful If-Match commit re-read all inputs — so the
    // final summary must contain the incident regardless of which
    // writer committed last (§5 purity over the merged state).
    const finalSummary = parseSummary(JSON.parse((await inner.get(`${V1}/summary.json`))!.body));
    expect([T1, T2]).toContain(finalSummary.generatedAt);
    expect(finalSummary.incidents.open.map(i => i.issueNumber)).toEqual([9]);
    expect(finalSummary.entities.map(e => e.name).sort()).toEqual(['alpha', 'beta']);
    expect(probeResult.attempts).toBeGreaterThanOrEqual(1);
    expect(incidentResult.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe('compaction racing probe writes (council case B)', () => {
  it('a day-boundary probe write is never lost — golden reading count', async () => {
    const inner = new MemoryObjectStore();
    const store = new YieldingStore(inner);
    const NOW = Date.parse('2026-07-15T01:30:00Z'); // 07-14 just became eligible

    // Backlog: two closed days of batches.
    let goldenCount = 0;
    for (const date of ['2026-07-13', '2026-07-14']) {
      for (let run = 0; run < 6; run++) {
        const iso = `${date}T0${run}:00:00.000Z`;
        await writeReadingsBatch(
          store,
          [reading('alpha', iso, run), reading('beta', iso, run)],
          iso,
          `r${run}`
        );
        goldenCount += 2;
      }
    }

    // The race: compaction of the closed days vs a probe writing
    // TODAY's batch and one landing just inside yesterday's fence.
    const todayIso = '2026-07-15T01:29:00.000Z';
    const fencedIso = '2026-07-15T00:59:00.000Z'; // same UTC day as today
    await Promise.all([
      compactReadingsR2(store, {nowMs: NOW}),
      (async () => {
        await writeReadingsBatch(store, [reading('alpha', todayIso, 1)], todayIso, 'race1');
        await writeReadingsBatch(store, [reading('beta', fencedIso, 2)], fencedIso, 'race2');
      })(),
    ]);
    goldenCount += 2;

    // Zero lost readings: every (svc, t) written is still reachable
    // (in a day archive or a surviving batch).
    expect(await countAllStoredReadings(inner)).toBe(goldenCount);
    // The closed days were archived and their batches removed.
    expect(await inner.get(`${V1}/archives/2026/07/history-2026-07-13.jsonl`)).not.toBeNull();
    expect(await inner.get(`${V1}/archives/2026/07/history-2026-07-14.jsonl`)).not.toBeNull();
    // Today's racing batches survived untouched (fence).
    const batchKeys = await inner.list(`${V1}/readings/`);
    expect(batchKeys.some(k => k.includes('race1'))).toBe(true);
    expect(batchKeys.some(k => k.includes('race2'))).toBe(true);
  });

  it('compaction interleaved with a regenerate keeps the summary consistent', async () => {
    const inner = new MemoryObjectStore();
    const store = new YieldingStore(inner);
    const NOW = Date.parse('2026-07-15T12:00:00Z');
    const T = '2026-07-15T12:00:00.000Z';

    // Yesterday: BOTH compaction-eligible (day closed + 1h) AND inside
    // the regenerator's 2-day batch window — the overlap where the two
    // writers genuinely contend for the same readings.
    for (let run = 0; run < 4; run++) {
      const iso = `2026-07-14T0${run}:00:00.000Z`;
      await writeReadingsBatch(store, [reading('alpha', iso, run)], iso, `old${run}`);
    }
    await writeReadingsBatch(store, [reading('alpha', T, 40), reading('beta', T, 41)], T, 'fresh');

    await Promise.all([
      compactReadingsR2(store, {nowMs: NOW}),
      regenerateDerivedR2(store, regenOpts(T, {windowDays: 90})),
    ]);

    // Whatever the interleaving, the summary is schema-valid and a
    // fresh regenerate over the post-compaction layout is identical in
    // rollup content (readings moved, none lost).
    const during = parseSummary(JSON.parse((await inner.get(`${V1}/summary.json`))!.body));
    await regenerateDerivedR2(store, regenOpts(T, {windowDays: 90}));
    const after = parseSummary(JSON.parse((await inner.get(`${V1}/summary.json`))!.body));
    expect(after.entities).toEqual(during.entities);
  });
});

describe('batch-key collision (Council PR #110 r=1)', () => {
  it('retries under a suffixed run id instead of crashing or overwriting', async () => {
    const store = new MemoryObjectStore();
    const T = '2026-07-15T10:00:00.000Z';
    const first = [reading('alpha', T, 1)];
    const second = [reading('alpha', T, 2)];

    const key1 = await writeReadingsBatch(store, first, T, 'dup');
    const key2 = await writeReadingsBatch(store, second, T, 'dup'); // collides
    expect(key2).not.toBe(key1);
    expect(key2).toContain('dup-c1');
    // Neither batch was lost or overwritten.
    expect(JSON.parse((await store.get(key1))!.body)[0].lat).toBe(1);
    expect(JSON.parse((await store.get(key2))!.body)[0].lat).toBe(2);

    // A THIRD collision on the same id still fails loudly — collisions
    // are retried once, never absorbed silently forever.
    await expect(writeReadingsBatch(store, second, T, 'dup')).rejects.toThrow(
      /precondition failed/
    );
  });
});

describe('compaction backlog at volume (carried from PR #108 council PASS)', () => {
  it('5 days x 288 runs x 3 entities compacts completely and losslessly', async () => {
    const store = new MemoryObjectStore(); // volume: no yielding overhead
    const SVCS = ['alpha', 'beta', 'gamma'];
    const start = Date.parse('2026-07-01T00:00:00Z');
    let written = 0;
    for (let d = 0; d < 5; d++) {
      for (let run = 0; run < 288; run++) {
        const t = start + d * 86_400_000 + run * 300_000;
        const iso = new Date(t).toISOString();
        await writeReadingsBatch(
          store,
          SVCS.map(svc => ({t, svc, state: 'up' as const, code: 200, lat: run % 100})),
          iso,
          `d${d}r${run}`
        );
        written += SVCS.length;
      }
    }
    expect(written).toBe(4320);

    const heapBefore = process.memoryUsage().heapUsed;
    const result = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

    expect(result.archivedDays).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
    expect(result.deletedBatches).toBe(5 * 288);
    expect(await store.list(`${V1}/readings/`)).toEqual([]);
    expect(await countAllStoredReadings(store)).toBe(4320);
    // Informational only (not asserted — GC timing varies): the per-day
    // merge should stay far below Worker memory limits.
    console.log(`compaction backlog heap delta: ${heapDeltaMb.toFixed(1)} MB`);
  }, 30_000);
});
