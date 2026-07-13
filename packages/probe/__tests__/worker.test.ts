/**
 * Cloudflare Worker probe + dispatch ingest tests (ADR-005 §6; epic #63
 * ticket #76). Trust model under test: the Worker only dispatches;
 * ingest validates BEFORE any write and rejects malformed payloads and
 * unknown entities without touching the data branch.
 */

import fs from 'node:fs';
import http from 'node:http';
import {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {parseProbeDispatch, parseSummary} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import {
  DISPATCH_EVENT_TYPE,
  buildDispatchPayload,
  parseTargets,
  runWorkerProbe,
  sendRepositoryDispatch,
} from '../src/worker';
import {main} from '../src/cli';

const NOW = Date.parse('2026-07-13T12:00:00.000Z');
const READING: CompactReading = {t: NOW, svc: 'api', state: 'up', code: 200, lat: 42};

/** jsdom strips Response — minimal stand-in (same trick as the §4 hook tests). */
function makeResponse(status: number, body = ''): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    headers: {get: () => null},
  } as unknown as Response;
}

describe('probe dispatch payload schema', () => {
  it('accepts a valid payload', () => {
    const payload = parseProbeDispatch({schemaVersion: 1, source: 'cf-worker', readings: [READING]});
    expect(payload.readings).toHaveLength(1);
  });

  it.each([
    ['wrong schemaVersion', {schemaVersion: 2, source: 'w', readings: [READING]}],
    ['empty readings', {schemaVersion: 1, source: 'w', readings: []}],
    ['missing source', {schemaVersion: 1, readings: [READING]}],
    ['malformed reading', {schemaVersion: 1, source: 'w', readings: [{t: 1, svc: 'api'}]}],
    ['non-object', 'nope'],
  ])('rejects %s', (_label, input) => {
    expect(() => parseProbeDispatch(input)).toThrow();
  });

  it('caps readings at 1000 per dispatch', () => {
    const readings = Array.from({length: 1001}, (_, i) => ({...READING, t: NOW + i}));
    expect(() => parseProbeDispatch({schemaVersion: 1, source: 'w', readings})).toThrow();
  });
});

describe('parseTargets', () => {
  it('parses a valid TARGETS array', () => {
    const targets = parseTargets('[{"system":"api","url":"https://x.test/h"}]');
    expect(targets[0].system).toBe('api');
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['not an array', '{"system":"api"}'],
    ['empty array', '[]'],
    ['entry missing url', '[{"system":"api"}]'],
    ['entry missing system', '[{"url":"https://x.test"}]'],
  ])('throws on %s', (_label, json) => {
    expect(() => parseTargets(json)).toThrow();
  });
});

describe('sendRepositoryDispatch', () => {
  it('POSTs the payload to the dispatches endpoint with auth headers', async () => {
    const calls: Array<{url: string; init: RequestInit}> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({url, init: init!});
      return makeResponse(204);
    }) as unknown as typeof fetch;

    const payload = buildDispatchPayload([READING], 'cf-worker');
    await sendRepositoryDispatch({owner: 'o', repo: 'r', token: 'tok', payload, fetchImpl});

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/dispatches');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.event_type).toBe(DISPATCH_EVENT_TYPE);
    expect(body.client_payload.readings[0].svc).toBe('api');
  });

  it('throws with status detail on non-204', async () => {
    const fetchImpl = (async () => makeResponse(422, 'nope')) as unknown as typeof fetch;
    const payload = buildDispatchPayload([READING], 'cf-worker');
    await expect(
      sendRepositoryDispatch({owner: 'o', repo: 'r', token: 'tok', payload, fetchImpl})
    ).rejects.toThrow(/HTTP 422/);
  });
});

describe('runWorkerProbe', () => {
  const env = {
    GITHUB_TOKEN: 'tok',
    GITHUB_OWNER: 'o',
    GITHUB_REPO: 'r',
    TARGETS: '[{"system":"api","url":"https://api.test/health"}]',
  };

  it('checks targets and dispatches the readings', async () => {
    const dispatches: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.github.com/')) {
        dispatches.push(init!.body as string);
        return makeResponse(204);
      }
      return makeResponse(200); // the health check
    }) as unknown as typeof fetch;

    const result = await runWorkerProbe(env, {fetchImpl, now: NOW});
    expect(result.dispatched).toBe(true);
    expect(result.readings[0]).toMatchObject({svc: 'api', state: 'up', t: NOW});
    const sent = JSON.parse(dispatches[0]);
    expect(parseProbeDispatch(sent.client_payload).source).toBe('cf-worker');
  });

  it('fails fast on missing env', async () => {
    await expect(runWorkerProbe({...env, GITHUB_TOKEN: ''})).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it('a down endpoint still dispatches (down readings are data)', async () => {
    const fetchImpl = (async (url: string) =>
      url.startsWith('https://api.github.com/') ? makeResponse(204) : makeResponse(500)) as unknown as typeof fetch;
    const result = await runWorkerProbe(env, {fetchImpl, now: NOW});
    expect(result.dispatched).toBe(true);
    expect(result.readings[0].state).toBe('down');
  });
});

describe('stentorosaur ingest (receiving side)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
    fs.writeFileSync(
      path.join(tmp, 'stentorosaur.config.js'),
      `module.exports = {owner: 'o', repo: 'r', entities: [
        {name: 'api', type: 'system'},
        {name: 'onboarding', type: 'process'},
      ]};`
    );
  });
  afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
  });

  function writePayload(payload: unknown): string {
    const file = path.join(tmp, 'payload.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    return file;
  }

  it('end-to-end: dispatched readings land in summary.json', async () => {
    const file = writePayload({
      schemaVersion: 1,
      source: 'cf-worker',
      readings: [READING, {...READING, t: NOW + 60_000}],
    });
    const code = await main(['ingest', '--config', tmp, '--workdir', tmp, '--payload', file, '--no-push']);
    expect(code).toBe(0);
    const summary = parseSummary(
      JSON.parse(fs.readFileSync(path.join(tmp, 'status', 'v1', 'summary.json'), 'utf8'))
    );
    expect(summary.entities.map(e => e.name)).toEqual(['api', 'onboarding']);
    expect(summary.entities[0].status).toBe('up');
    // Readings also landed in the archive for the rollup window.
    const detail = JSON.parse(
      fs.readFileSync(path.join(tmp, 'status', 'v1', 'entities', 'api.json'), 'utf8')
    );
    expect(detail.readings).toHaveLength(2);
  });

  it('rejects a malformed payload without writing anything', async () => {
    const file = writePayload({schemaVersion: 1, source: 'w', readings: []});
    const code = await main(['ingest', '--config', tmp, '--workdir', tmp, '--payload', file, '--no-push']);
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'status'))).toBe(false);
  });

  it('rejects readings for entities not in the config (#62 ghost shape)', async () => {
    const file = writePayload({
      schemaVersion: 1,
      source: 'w',
      readings: [READING, {...READING, svc: 'ghost'}],
    });
    const code = await main(['ingest', '--config', tmp, '--workdir', tmp, '--payload', file, '--no-push']);
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'status'))).toBe(false);
  });

  it('requires --payload', async () => {
    expect(await main(['ingest', '--config', tmp, '--workdir', tmp, '--no-push'])).toBe(1);
  });

  it('full loop: a real Worker dispatch payload round-trips through ingest', async () => {
    // A local HTTP server stands in for the monitored endpoint; the
    // Worker's dispatch body is captured and fed to ingest verbatim —
    // the e2e fixture for "dispatched readings land in summary.json".
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      let captured: string | null = null;
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        if (url.startsWith('https://api.github.com/')) {
          captured = init!.body as string;
          return makeResponse(204);
        }
        return (await fetch(url, init)) as Response;
      }) as unknown as typeof fetch;

      await runWorkerProbe(
        {
          GITHUB_TOKEN: 'tok',
          GITHUB_OWNER: 'o',
          GITHUB_REPO: 'r',
          TARGETS: JSON.stringify([{system: 'api', url: `http://127.0.0.1:${port}/health`}]),
        },
        {fetchImpl, now: NOW}
      );

      expect(captured).not.toBeNull();
      const file = path.join(tmp, 'payload.json');
      fs.writeFileSync(file, JSON.stringify(JSON.parse(captured!).client_payload));
      const code = await main(['ingest', '--config', tmp, '--workdir', tmp, '--payload', file, '--no-push']);
      expect(code).toBe(0);
      const summary = parseSummary(
        JSON.parse(fs.readFileSync(path.join(tmp, 'status', 'v1', 'summary.json'), 'utf8'))
      );
      expect(summary.entities[0].status).toBe('up');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
