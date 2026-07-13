/**
 * §4 client fetch protocol tests (ADR-005; ticket #72):
 * 1. snapshot-first render (never blank, no skeleton for initial view)
 * 2. background ETag fetch; 200→swap, 304→keep, invalid→keep
 * 3. failure backoff with jitter; 429/403 pauses for Retry-After
 * 4. refetch on tab focus, timer no faster than the cache TTL
 * 5. content-type tolerant parsing
 * @jest-environment jsdom
 */

import {act, renderHook, waitFor} from '@testing-library/react';
import {encodeDayRollups} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';
import {useStatusSummary} from '../../src/v1/useStatusSummary';

const NOW = '2026-07-12T18:00:00.000Z';

function summary(generatedAt = NOW): StatusSummary {
  return {
    schemaVersion: 1,
    generatedAt,
    generatedBy: 'test',
    entities: [
      {
        name: 'api',
        type: 'system',
        status: 'up',
        uptime: {d1: 100, d7: 100, d90: 100},
        responseTimeMs: {d1: 50},
        ...encodeDayRollups([{date: '2026-07-12', uptime: 100, avgMs: 50, worst: 'up'}]),
      },
    ],
    incidents: {open: [], recent: []},
    maintenance: {upcoming: [], inProgress: []},
  };
}

// jsdom strips Node's Response global; the hook only touches status/ok/
// headers.get/text, so a minimal stand-in suffices.
function makeResponse(
  body: string | null,
  {status = 200, headers = {} as Record<string, string>} = {}
) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {get: (k: string) => map.get(k.toLowerCase()) ?? null},
    text: async () => body ?? '',
  };
}
function jsonResponse(body: unknown, init: {headers?: Record<string, string>} = {}) {
  return makeResponse(JSON.stringify(body), {status: 200, headers: init.headers ?? {}});
}

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});
afterEach(() => {
  jest.useRealTimers();
});

const snapshot = summary('2026-07-12T17:00:00.000Z');

describe('useStatusSummary (§4 protocol)', () => {
  it('renders the SSG snapshot immediately, then swaps in fresher live data', async () => {
    const live = summary('2026-07-12T18:30:00.000Z');
    fetchMock.mockResolvedValue(jsonResponse(live, {headers: {etag: 'W/"abc"'}}));

    const {result} = renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json'})
    );
    // Snapshot-first: data available on the very first render.
    expect(result.current.summary.generatedAt).toBe('2026-07-12T17:00:00.000Z');
    expect(result.current.source).toBe('snapshot');

    await waitFor(() => expect(result.current.source).toBe('live'));
    expect(result.current.summary.generatedAt).toBe('2026-07-12T18:30:00.000Z');
  });

  it('sends If-None-Match on refetch and keeps state on 304', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(summary(), {headers: {etag: 'W/"v1"'}}))
      .mockResolvedValueOnce(makeResponse(null, {status: 304}));

    const {result} = renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json', refreshMs: 300_000})
    );
    await waitFor(() => expect(result.current.source).toBe('live'));

    await act(async () => {
      jest.advanceTimersByTime(300_000);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondInit = fetchMock.mock.calls[1][1];
    expect(secondInit.headers['if-none-match']).toBe('W/"v1"');
    expect(result.current.summary.generatedAt).toBe(NOW); // kept
  });

  it('discards schema-invalid responses and keeps the snapshot', async () => {
    fetchMock.mockResolvedValue(jsonResponse({schemaVersion: 1, nonsense: true}));
    const {result} = renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json'})
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Never hard-fails; snapshot remains.
    expect(result.current.source).toBe('snapshot');
    expect(result.current.summary.generatedAt).toBe('2026-07-12T17:00:00.000Z');
  });

  it('parses text/plain responses as JSON (raw.githubusercontent fallback)', async () => {
    const live = summary('2026-07-12T19:00:00.000Z');
    fetchMock.mockResolvedValue(
      makeResponse(JSON.stringify(live), {status: 200, headers: {'content-type': 'text/plain'}})
    );
    const {result} = renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json'})
    );
    await waitFor(() => expect(result.current.source).toBe('live'));
  });

  it('pauses refetching for the Retry-After window on 429', async () => {
    fetchMock.mockResolvedValue(makeResponse(null, {status: 429, headers: {'retry-after': '120'}}));
    const {result} = renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json', refreshMs: 30_000})
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Within the Retry-After window nothing refires, even past refreshMs.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After the window, refetching resumes.
    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(result.current.source).toBe('snapshot'); // still never hard-failed
  });

  it('backs off with growing delay on network failure', async () => {
    // Real timers + injected small backoff constants (the fake-timer
    // rejection path deadlocks React's act scheduling in this setup).
    jest.useRealTimers();
    fetchMock.mockRejectedValue(new Error('offline'));
    const callTimes: number[] = [];
    fetchMock.mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.reject(new Error('offline'));
    });

    renderHook(() =>
      useStatusSummary({
        snapshot,
        dataUrl: 'https://x.example/summary.json',
        refreshMs: 10, // would refire every 10ms if backoff were ignored
        jitter: () => 0,
        backoffBaseMs: 120,
        backoffCapMs: 1_000,
      })
    );

    // Wait for three attempts: gaps must follow the DOUBLING backoff
    // (base 120ms then 240ms), not the 10ms refresh cadence.
    await waitFor(() => expect(callTimes.length).toBeGreaterThanOrEqual(3), {
      timeout: 4_000,
    });
    const gap1 = callTimes[1] - callTimes[0];
    const gap2 = callTimes[2] - callTimes[1];
    expect(gap1).toBeGreaterThanOrEqual(100);
    expect(gap2).toBeGreaterThanOrEqual(200);
    expect(gap2).toBeGreaterThan(gap1);
  });

  it('refetches on window focus', async () => {
    fetchMock.mockResolvedValue(jsonResponse(summary(), {headers: {etag: 'W/"v1"'}}));
    renderHook(() =>
      useStatusSummary({snapshot, dataUrl: 'https://x.example/summary.json', refreshMs: 600_000})
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does nothing without a dataUrl (pure snapshot mode, e.g. private repos)', () => {
    const {result} = renderHook(() => useStatusSummary({snapshot}));
    expect(result.current.source).toBe('snapshot');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
