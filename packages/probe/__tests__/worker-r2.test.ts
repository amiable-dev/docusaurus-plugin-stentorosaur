/**
 * Worker Profile C tests (ADR-006 §2; epic #97 ticket #100): the R2
 * binding adapter, the direct-write probe cycle, the serving route,
 * and the jsdom-free bundle-graph guard.
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseSummary} from '@stentorosaur/core';
import {PreconditionFailedError} from '../src/object-store';
import {
  BindingObjectStore,
  runWorkerProbeR2,
  serveStatusV1,
  type R2BucketLike,
  type WorkerEnv,
} from '../src/worker';

const NOW = Date.parse('2026-07-15T12:00:00.000Z');

/** In-memory R2Bucket with real conditional-put semantics (null on
 * precondition failure, like the actual binding). */
class FakeR2Bucket implements R2BucketLike {
  readonly objects = new Map<string, {body: string; etag: string}>();
  private etagCounter = 0;

  async get(key: string) {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {httpEtag: entry.etag, text: async () => entry.body};
  }

  async put(
    key: string,
    value: string,
    options?: {onlyIf?: {etagMatches?: string; etagDoesNotMatch?: string}}
  ) {
    const existing = this.objects.get(key);
    if (options?.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) {
      return null; // the binding signals precondition failure with null
    }
    if (options?.onlyIf?.etagDoesNotMatch === '*' && existing) {
      return null;
    }
    const etag = `"b${++this.etagCounter}"`;
    this.objects.set(key, {body: value, etag});
    return {};
  }

  async list({prefix, cursor}: {prefix: string; cursor?: string}) {
    // Two-key pages to exercise pagination.
    const all = [...this.objects.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + 2);
    const nextStart = start + 2;
    return {
      objects: page.map(key => ({key})),
      truncated: nextStart < all.length,
      cursor: String(nextStart),
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

const TARGETS = JSON.stringify([{system: 'api', url: 'https://api.test/health'}]);

function r2Env(bucket: R2BucketLike): WorkerEnv {
  return {
    GITHUB_TOKEN: '',
    GITHUB_OWNER: 'o',
    GITHUB_REPO: 'r',
    TARGETS,
    STATUS_BUCKET: bucket,
    SITE_TITLE: 'T',
    SITE_URL: 'https://t.example.com',
  };
}

describe('BindingObjectStore', () => {
  it('maps the binding null-on-precondition to PreconditionFailedError', async () => {
    const bucket = new FakeR2Bucket();
    const store = new BindingObjectStore(bucket);
    await store.put('k', 'v1');
    await expect(store.put('k', 'v2', {ifMatch: '"wrong"'})).rejects.toThrow(
      PreconditionFailedError
    );
    await expect(store.put('k', 'v2', {ifNoneMatch: '*'})).rejects.toThrow(
      PreconditionFailedError
    );
  });

  it('paginates list via cursors', async () => {
    const bucket = new FakeR2Bucket();
    const store = new BindingObjectStore(bucket);
    for (let i = 0; i < 5; i++) await store.put(`p/${i}`, 'x');
    expect(await store.list('p/')).toHaveLength(5);
  });

  it('round-trips body + etag through get', async () => {
    const bucket = new FakeR2Bucket();
    const store = new BindingObjectStore(bucket);
    const {etag} = await store.put('k', 'body');
    expect(await store.get('k')).toEqual({body: 'body', etag});
  });
});

describe('runWorkerProbeR2 (Profile C probe cycle)', () => {
  it('checks targets, writes the batch, and commits a schema-valid summary', async () => {
    const bucket = new FakeR2Bucket();
    const fetchImpl = (async () => ({
      status: 200,
      ok: true,
      text: async () => 'ok',
      headers: {get: () => null},
    })) as unknown as typeof fetch;

    const result = await runWorkerProbeR2(r2Env(bucket), {fetchImpl, now: NOW});
    expect(result.readings[0]).toMatchObject({svc: 'api', state: 'up'});

    const store = new BindingObjectStore(bucket);
    const summary = parseSummary(JSON.parse((await store.get('status/v1/summary.json'))!.body));
    expect(summary.generatedBy).toBe('stentorosaur-worker');
    expect(summary.entities[0]).toMatchObject({name: 'api', status: 'up'});
    expect([...bucket.objects.keys()].some(k => k.startsWith('status/v1/readings/'))).toBe(true);
  });

  it('honors ENTITIES display metadata and rejects malformed values', async () => {
    const bucket = new FakeR2Bucket();
    const fetchImpl = (async () => ({
      status: 200,
      ok: true,
      text: async () => 'ok',
      headers: {get: () => null},
    })) as unknown as typeof fetch;

    const env = {...r2Env(bucket), ENTITIES: JSON.stringify([{name: 'api', type: 'system', displayName: 'API'}])};
    await runWorkerProbeR2(env, {fetchImpl, now: NOW});
    const summary = parseSummary(
      JSON.parse((await new BindingObjectStore(bucket).get('status/v1/summary.json'))!.body)
    );
    expect(summary.entities[0].displayName).toBe('API');

    await expect(
      runWorkerProbeR2({...r2Env(bucket), ENTITIES: '[{"nope": true}]'}, {fetchImpl, now: NOW})
    ).rejects.toThrow(/ENTITIES/);
  });
});

describe('serveStatusV1 (serving route)', () => {
  async function served(bucket: FakeR2Bucket, url: string, init?: RequestInit) {
    return serveStatusV1(new Request(url, init), r2Env(bucket));
  }

  it('serves status/v1 objects with cache, etag, and CORS headers', async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put('status/v1/summary.json', '{"x":1}');
    const response = await served(bucket, 'https://status.example.com/status/v1/summary.json');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"x":1}');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('etag')).toMatch(/^"b/);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  it('returns 304 on matching If-None-Match (the §4 client protocol)', async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put('status/v1/summary.json', '{}');
    const first = await served(bucket, 'https://s.test/status/v1/summary.json');
    const etag = first.headers.get('etag')!;
    const second = await served(bucket, 'https://s.test/status/v1/summary.json', {
      headers: {'if-none-match': etag},
    });
    expect(second.status).toBe(304);
  });

  it('404s outside status/v1 and for missing objects; 405s non-GET', async () => {
    const bucket = new FakeR2Bucket();
    expect((await served(bucket, 'https://s.test/secrets.txt')).status).toBe(404);
    expect((await served(bucket, 'https://s.test/status/v1/missing.json')).status).toBe(404);
    expect(
      (await served(bucket, 'https://s.test/status/v1/summary.json', {method: 'POST', body: 'x'}))
        .status
    ).toBe(405);
    expect(
      (await served(bucket, 'https://s.test/status/v1/summary.json', {method: 'OPTIONS'})).status
    ).toBe(204);
  });

  it('serves the atom feed with its content type', async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put('status/v1/incidents.atom', '<feed/>');
    const response = await served(bucket, 'https://s.test/status/v1/incidents.atom');
    expect(response.headers.get('content-type')).toBe('application/atom+xml');
  });
});

describe('Workers bundle-graph guard (no jsdom reachable from worker entry)', () => {
  it('the compiled worker module graph never requires jsdom/render', () => {
    const LIB = path.join(__dirname, '..', 'lib');
    const CORE_LIB = path.join(__dirname, '..', '..', 'core', 'lib');
    const seen = new Set<string>();
    const queue = [path.join(LIB, 'worker.js')];
    const offenders: string[] = [];

    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file) || !fs.existsSync(file)) continue;
      seen.add(file);
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/require\("([^"]+)"\)/g)) {
        const spec = match[1];
        if (spec === 'jsdom' || spec === 'dompurify' || spec === 'marked') {
          offenders.push(`${path.relative(LIB, file)} requires ${spec}`);
        } else if (spec.startsWith('.')) {
          queue.push(path.resolve(path.dirname(file), spec.endsWith('.js') ? spec : `${spec}.js`));
        } else if (spec === '@stentorosaur/core/summary') {
          queue.push(path.join(CORE_LIB, 'summary.js'));
        } else if (spec === '@stentorosaur/core/server') {
          offenders.push(`${path.relative(LIB, file)} imports the jsdom server barrel`);
        } else if (spec === '@stentorosaur/core') {
          queue.push(path.join(CORE_LIB, 'index.js'));
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(3); // the walk actually traversed
  });
});
