/**
 * Probe check-engine tests (ADR-005 §1/§6; epic #63 ticket #69).
 * Real HTTP against a local mock server — parity with monitor.js
 * semantics: 0/unexpected code → down; slow → degraded; else up.
 */

import http from 'node:http';
import {AddressInfo} from 'node:net';
import {checkEndpoint, determineStatus, runChecks} from '../src/check';
import type {CheckTarget} from '../src/check';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200);
      res.end('ok');
    } else if (req.url === '/redirect-target-code') {
      res.writeHead(301, {location: '/ok'});
      res.end();
    } else if (req.url === '/fail') {
      res.writeHead(500);
      res.end('boom');
    } else if (req.url === '/slow') {
      setTimeout(() => {
        res.writeHead(200);
        res.end('slow');
      }, 300);
    } else if (req.url === '/hang') {
      // never respond — exercises the timeout path
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

const target = (over: Partial<CheckTarget> = {}): CheckTarget => ({
  system: 'api',
  url: `${base}/ok`,
  method: 'GET',
  timeout: 2000,
  expectedCodes: [200],
  maxResponseTime: 30000,
  ...over,
});

describe('determineStatus (monitor.js parity)', () => {
  it.each([
    [0, 100, [200], 30000, 'down'],
    [500, 100, [200], 30000, 'down'],
    [301, 100, [200, 301], 30000, 'up'],
    [200, 100, [200], 30000, 'up'],
    [200, 31000, [200], 30000, 'degraded'],
  ] as const)('code=%s time=%s expected=%s max=%s → %s', (code, time, expected, max, want) => {
    expect(determineStatus(code, time, [...expected], max)).toBe(want);
  });
});

describe('checkEndpoint', () => {
  it('measures an up endpoint', async () => {
    const reading = await checkEndpoint(target(), Date.now());
    expect(reading.state).toBe('up');
    expect(reading.code).toBe(200);
    expect(reading.lat).toBeGreaterThanOrEqual(0);
    expect(reading.err).toBeUndefined();
  });

  it('unexpected status code → down with err', async () => {
    const reading = await checkEndpoint(target({url: `${base}/fail`}), Date.now());
    expect(reading.state).toBe('down');
    expect(reading.code).toBe(500);
    expect(reading.err).toBeDefined();
  });

  it('non-2xx codes can be EXPECTED (redirect monitoring)', async () => {
    const reading = await checkEndpoint(
      target({url: `${base}/redirect-target-code`, expectedCodes: [301]}),
      Date.now()
    );
    expect(reading.state).toBe('up');
    expect(reading.code).toBe(301);
  });

  it('response slower than maxResponseTime → degraded', async () => {
    const reading = await checkEndpoint(
      target({url: `${base}/slow`, maxResponseTime: 50}),
      Date.now()
    );
    expect(reading.state).toBe('degraded');
    expect(reading.code).toBe(200);
    expect(reading.lat).toBeGreaterThanOrEqual(50);
  });

  it('timeout → down, code 0, err set', async () => {
    const reading = await checkEndpoint(
      target({url: `${base}/hang`, timeout: 200}),
      Date.now()
    );
    expect(reading.state).toBe('down');
    expect(reading.code).toBe(0);
    expect(reading.err).toMatch(/timeout/i);
  }, 10000);

  it('connection refused → down, code 0', async () => {
    const reading = await checkEndpoint(
      target({url: 'http://127.0.0.1:1/nope', timeout: 500}),
      Date.now()
    );
    expect(reading.state).toBe('down');
    expect(reading.code).toBe(0);
    expect(reading.err).toBeDefined();
  });

  it('passes through supported non-GET methods', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {status: 204})
    );

    const reading = await checkEndpoint(
      target({method: 'DELETE', expectedCodes: [204]}),
      Date.now(),
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      `${base}/ok`,
      expect.objectContaining({method: 'DELETE'})
    );
    expect(reading.state).toBe('up');
    expect(reading.code).toBe(204);
  });
});

describe('runChecks', () => {
  const targets: CheckTarget[] = [
    {system: 'alpha', url: '', method: 'GET', timeout: 2000, expectedCodes: [200], maxResponseTime: 30000},
    {system: 'beta', url: '', method: 'GET', timeout: 2000, expectedCodes: [200], maxResponseTime: 30000},
    {system: 'gamma', url: '', method: 'GET', timeout: 2000, expectedCodes: [200], maxResponseTime: 30000},
  ];
  beforeAll(() => {
    targets[0].url = `${base}/ok`;
    targets[1].url = `${base}/fail`;
    targets[2].url = `${base}/ok`;
  });

  const normalize = (readings: Array<{svc: string; state: string; code: number}>) =>
    readings.map(r => ({svc: r.svc, state: r.state, code: r.code}));

  it('parallel run covers every target exactly once, same outcomes as sequential', async () => {
    const parallel = await runChecks(targets, {concurrency: 3});
    const sequential = await runChecks(targets, {concurrency: 1});
    expect(normalize(parallel)).toEqual(normalize(sequential));
    expect(parallel.map(r => r.svc).sort()).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('preserves target order in the result regardless of completion order', async () => {
    const readings = await runChecks(targets, {concurrency: 3});
    expect(readings.map(r => r.svc)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('sanitizes pathological concurrency values (Council PR #84 r=1: NaN → zero workers)', async () => {
    for (const concurrency of [NaN, 0, -1, 2.7] as number[]) {
      const readings = await runChecks(targets, {concurrency});
      expect(readings.map(r => r.svc)).toEqual(['alpha', 'beta', 'gamma']);
      expect(readings.every(r => r !== undefined)).toBe(true);
    }
  });
});
