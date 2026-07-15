/**
 * R2 data-plane writer tests (ADR-006 §1/§3; epic #97 ticket #99).
 *
 * The load-bearing assertions are the COUNCIL CONDITIONS:
 * - write-order consistency: summary.json is written LAST (commit
 *   point) — a reader polling between writes never sees a summary
 *   newer than its inputs
 * - If-Match retry on the summary commit converges under contention
 * - content-hash guard skips unchanged entity-detail writes (class-A
 *   budget, condition 4)
 */

import {parseSummary} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import {MemoryObjectStore, PreconditionFailedError, normalizeBaseUrl} from '../src/object-store';
import {regenerateDerivedR2, reRenderFromRawR2, writeReadingsBatch} from '../src/r2-plane';

const NOW = Date.parse('2026-07-15T12:00:00.000Z');
const GENERATED_AT = new Date(NOW).toISOString();
const ENTITIES = [
  {name: 'api', type: 'system' as const},
  {name: 'web', type: 'system' as const},
];

function reading(svc: string, offsetMs: number, state: 'up' | 'down' = 'up'): CompactReading {
  return {t: NOW - offsetMs, svc, state, code: state === 'up' ? 200 : 500, lat: 42};
}

const REGEN_OPTS = {
  generatedAt: GENERATED_AT,
  generatedBy: 'test',
  entities: ENTITIES,
  siteTitle: 'T',
  siteUrl: 'https://t.example.com',
};

async function seedBatch(store: MemoryObjectStore, readings: CompactReading[], runId = 'run1') {
  return writeReadingsBatch(store, readings, GENERATED_AT, runId);
}

describe('writeReadingsBatch', () => {
  it('writes one immutable batch object per run', async () => {
    const store = new MemoryObjectStore();
    const key = await seedBatch(store, [reading('api', 1000)]);
    expect(key).toMatch(/^status\/v1\/readings\//);
    // Immutable: same key cannot be overwritten (ifNoneMatch: '*').
    await expect(
      store.put(key, '[]', {ifNoneMatch: '*'})
    ).rejects.toThrow(PreconditionFailedError);
  });
});

describe('regenerateDerivedR2 — §3 write-order consistency (council condition 1)', () => {
  it('writes derived objects with summary.json strictly LAST', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000), reading('web', 900)]);
    store.ops.length = 0;

    await regenerateDerivedR2(store, REGEN_OPTS);

    const puts = store.ops.filter(o => o.op === 'put').map(o => o.key);
    expect(puts[puts.length - 1]).toBe('status/v1/summary.json');
    expect(puts).toEqual(
      expect.arrayContaining([
        'status/v1/entities/api.json',
        'status/v1/entities/web.json',
        'status/v1/incidents.atom',
      ])
    );
    // Every non-summary derived write precedes the summary.
    const summaryIndex = puts.indexOf('status/v1/summary.json');
    expect(summaryIndex).toBe(puts.length - 1);
  });

  it('produces a schema-valid summary from batches + inputs', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000), reading('web', 900, 'down')]);
    await regenerateDerivedR2(store, REGEN_OPTS);

    const summary = parseSummary(JSON.parse((await store.get('status/v1/summary.json'))!.body));
    expect(summary.entities.map(e => `${e.name}:${e.status}`)).toEqual(['api:up', 'web:down']);
    expect((await store.get('status/v1/incidents.atom'))!.body).toContain('<feed');
  });

  it('retries the summary commit on precondition failure and converges', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000)]);
    await regenerateDerivedR2(store, REGEN_OPTS); // summary now exists

    // Interleave a competing writer: on the FIRST summary read, mutate
    // the summary behind the regenerator's back so its If-Match loses.
    const originalGet = store.get.bind(store);
    let sabotaged = false;
    jest.spyOn(store, 'get').mockImplementation(async key => {
      const result = await originalGet(key);
      if (key === 'status/v1/summary.json' && !sabotaged) {
        sabotaged = true;
        await store.put('status/v1/summary.json', result!.body); // bumps etag
      }
      return result;
    });

    const outcome = await regenerateDerivedR2(store, REGEN_OPTS);
    expect(outcome.attempts).toBe(2);
    parseSummary(JSON.parse((await originalGet('status/v1/summary.json'))!.body));
  });

  it('gives up loudly after maxRetries under persistent contention', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000)]);
    await regenerateDerivedR2(store, REGEN_OPTS);

    const originalGet = store.get.bind(store);
    jest.spyOn(store, 'get').mockImplementation(async key => {
      const result = await originalGet(key);
      if (key === 'status/v1/summary.json') {
        await store.put('status/v1/summary.json', result!.body); // always bump
      }
      return result;
    });

    await expect(
      regenerateDerivedR2(store, {...REGEN_OPTS, maxRetries: 2})
    ).rejects.toThrow(/persistent write contention/);
  });

  it('skips unchanged entity-detail writes (council condition 4)', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000), reading('web', 900)]);
    await regenerateDerivedR2(store, REGEN_OPTS);

    // Second regenerate over IDENTICAL inputs: entity payloads unchanged.
    store.ops.length = 0;
    const outcome = await regenerateDerivedR2(store, {
      ...REGEN_OPTS,
      generatedAt: new Date(NOW + 60_000).toISOString(),
    });

    expect(outcome.entityWritesSkipped).toBe(2);
    const puts = store.ops.filter(o => o.op === 'put').map(o => o.key);
    expect(puts).not.toContain('status/v1/entities/api.json');
    expect(puts).not.toContain('status/v1/entities/web.json');
    // Summary still commits (generatedAt changed).
    expect(puts[puts.length - 1]).toBe('status/v1/summary.json');
  });

  it('entityWritesSkipped reflects only the winning attempt, not accumulated across retries', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000), reading('web', 900)]);
    await regenerateDerivedR2(store, REGEN_OPTS); // first run writes entities

    // Second run: entities are skippable (unchanged readings). We force one
    // retry by bumping the summary etag behind the regenerator's back.
    const originalGet = store.get.bind(store);
    let sabotaged = false;
    jest.spyOn(store, 'get').mockImplementation(async key => {
      const result = await originalGet(key);
      if (key === 'status/v1/summary.json' && !sabotaged) {
        sabotaged = true;
        await store.put('status/v1/summary.json', result!.body); // bumps etag, forces retry
      }
      return result;
    });

    const outcome = await regenerateDerivedR2(store, {
      ...REGEN_OPTS,
      generatedAt: new Date(NOW + 60_000).toISOString(),
    });

    // Two attempts fired; entities were skipped in each. The count must be
    // 2 (one skip per entity on the winning attempt), not 4.
    expect(outcome.attempts).toBe(2);
    expect(outcome.entityWritesSkipped).toBe(2);
  });

  it('folds day archives AND uncompacted batches into the rollups', async () => {
    const store = new MemoryObjectStore();
    // Yesterday's compacted archive:
    const yesterday = new Date(NOW - 24 * 3600_000).toISOString().split('T')[0];
    const [y, m] = yesterday.split('-');
    await store.put(
      `status/v1/archives/${y}/${m}/history-${yesterday}.jsonl`,
      [reading('api', 24 * 3600_000 + 1000), reading('api', 24 * 3600_000 + 2000)]
        .map(r => JSON.stringify(r))
        .join('\n')
    );
    // Today's uncompacted batch:
    await seedBatch(store, [reading('api', 1000)]);

    await regenerateDerivedR2(store, REGEN_OPTS);
    const summary = parseSummary(JSON.parse((await store.get('status/v1/summary.json'))!.body));
    const api = summary.entities.find(e => e.name === 'api')!;
    expect(api.days.length).toBeGreaterThanOrEqual(2); // both days present
  });

  it('reads incident/maintenance inputs and reflects them in the summary', async () => {
    const store = new MemoryObjectStore();
    await seedBatch(store, [reading('api', 1000)]);
    await store.put(
      'status/v1/inputs/incidents.json',
      JSON.stringify([
        {
          issueNumber: 5,
          title: 'API degraded',
          severity: 'major',
          status: 'open',
          entities: ['api'],
          createdAt: GENERATED_AT,
          closedAt: null,
          bodyHtml: '<p>x</p>',
        },
      ])
    );
    await regenerateDerivedR2(store, REGEN_OPTS);
    const summary = parseSummary(JSON.parse((await store.get('status/v1/summary.json'))!.body));
    expect(summary.entities.find(e => e.name === 'api')!.status).toBe('degraded');
    expect(summary.incidents.open).toHaveLength(1);
  });
});

describe('reRenderFromRawR2 (§7 runbook on r2)', () => {
  it('re-renders bodies from raw/ with the current sanitizer', async () => {
    const store = new MemoryObjectStore();
    await store.put(
      'status/v1/raw/11.json',
      JSON.stringify({
        schemaVersion: 1,
        issueNumber: 11,
        updatedAt: GENERATED_AT,
        bodyMarkdown: '**fresh** body',
      })
    );
    await store.put(
      'status/v1/inputs/incidents.json',
      JSON.stringify([
        {
          issueNumber: 11,
          title: 'X',
          severity: 'minor',
          status: 'open',
          entities: [],
          createdAt: GENERATED_AT,
          closedAt: null,
          bodyHtml: '<p>STALE</p>',
        },
      ])
    );
    const counts = await reRenderFromRawR2(store, new Date(NOW));
    expect(counts.incidents).toBe(1);
    const incidents = JSON.parse((await store.get('status/v1/inputs/incidents.json'))!.body);
    expect(incidents[0].bodyHtml).toContain('<strong>fresh</strong>');
  });
});

describe('CLI routing for the r2 data plane', () => {
  const R2_CONFIG = `module.exports = {
    owner: 'o', repo: 'r',
    entities: [{name: 'api', type: 'system', probe: {url: 'http://127.0.0.1:1/x'}}],
    dataPlane: {kind: 'r2', bucket: 'b', endpoint: 'https://a.r2.cloudflarestorage.com', publicBaseUrl: 'https://s.example.com'},
  };`;

  it('fails with an actionable error when R2 credentials are missing', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const {main} = await import('../src/cli');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r2cli-'));
    const prevId = process.env.R2_ACCESS_KEY_ID;
    const prevSecret = process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    try {
      fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
      const code = await main(['probe', '--config', tmp, '--workdir', tmp]);
      expect(code).toBe(1); // errors mention the env vars, never crash
    } finally {
      if (prevId) process.env.R2_ACCESS_KEY_ID = prevId;
      if (prevSecret) process.env.R2_SECRET_ACCESS_KEY = prevSecret;
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  });

  it('probe on the r2 plane runs the full batch → regenerate cycle (injected store)', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const http = await import('node:http');
    const {main} = await import('../src/cli');
    const cliModule = await import('../src/cli');
    const store = new MemoryObjectStore();
    cliModule.setObjectStoreFactory(() => store);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r2cli-'));
    const server = http.createServer((_q, r) => {
      r.writeHead(200);
      r.end('ok');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as {port: number}).port;
    try {
      fs.writeFileSync(
        path.join(tmp, 'stentorosaur.config.js'),
        `module.exports = {
          owner: 'o', repo: 'r',
          entities: [{name: 'api', type: 'system', probe: {url: 'http://127.0.0.1:${port}/health'}}],
          dataPlane: {kind: 'r2', bucket: 'b', endpoint: 'https://a.r2.cloudflarestorage.com', publicBaseUrl: 'https://s.example.com'},
        };`
      );
      const code = await main(['probe', '--config', tmp, '--workdir', tmp]);
      expect(code).toBe(0);
      const summary = parseSummary(JSON.parse((await store.get('status/v1/summary.json'))!.body));
      expect(summary.entities[0]).toMatchObject({name: 'api', status: 'up'});
      expect(store.keys().some(k => k.startsWith('status/v1/readings/'))).toBe(true);
      // Nothing written to the local filesystem — this plane is git-free.
      expect(fs.existsSync(path.join(tmp, 'status'))).toBe(false);
    } finally {
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  });
});

describe('normalizeBaseUrl (Council PR #105 note)', () => {
  it('strips trailing slashes so URL joins are unambiguous', () => {
    expect(normalizeBaseUrl('https://x.r2.cloudflarestorage.com/')).toBe(
      'https://x.r2.cloudflarestorage.com'
    );
    expect(normalizeBaseUrl('https://x.r2.cloudflarestorage.com')).toBe(
      'https://x.r2.cloudflarestorage.com'
    );
  });
});
