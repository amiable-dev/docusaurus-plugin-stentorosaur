/**
 * @jest-environment jsdom
 *
 * StatusHistory (issue #114): the per-entity history page must fill its
 * long-range Uptime Overview from the summary's 90-day daily series, not
 * only the short entity-detail readings window. Reproduces the bug at
 * the DOM level: with the fix the 90d view has ~90 populated day-columns
 * instead of the ~2 the readings window alone would produce.
 */

import React from 'react';
import {render, screen, waitFor, within} from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusHistory from '../src/theme/StatusHistory';

const NEWEST_DATE = '2026-07-15';

function entityDetail() {
  const t = Date.parse(`${NEWEST_DATE}T12:00:00.000Z`);
  return {
    schemaVersion: 1,
    generatedAt: `${NEWEST_DATE}T12:00:00.000Z`,
    name: 'alpha',
    readings: [
      {t: t - 86_400_000, svc: 'alpha', state: 'up', code: 200, lat: 40},
      {t, svc: 'alpha', state: 'up', code: 200, lat: 41},
    ],
  };
}

/** Summary with a full 90-day series for 'alpha' (compact day tuples). */
function summaryWith90Days() {
  const days = Array.from({length: 90}, () => [100, 40, 'u']);
  return {
    schemaVersion: 1,
    generatedAt: `${NEWEST_DATE}T12:00:00.000Z`,
    generatedBy: 'test',
    entities: [
      {
        name: 'alpha',
        type: 'system',
        status: 'up',
        uptime: {d1: 100, d7: 100, d90: 100},
        responseTimeMs: {d1: 40},
        daysEnd: NEWEST_DATE,
        days,
      },
    ],
    incidents: {open: [], recent: []},
    maintenance: {upcoming: [], inProgress: []},
  };
}

function mockFetch(summaryResponder: (url: string) => {ok: boolean; status?: number; body?: unknown}) {
  global.fetch = jest.fn(async (url: string) => {
    if (url.endsWith('/entities/alpha.json')) {
      return {ok: true, status: 200, json: async () => entityDetail()} as any;
    }
    const r = summaryResponder(url);
    return {ok: r.ok, status: r.status ?? (r.ok ? 200 : 404), statusText: 'x', json: async () => r.body} as any;
  }) as unknown as typeof fetch;
}

/** How many 90d uptime bars carry real data (title !== "... no data"). */
function populatedBarCount(): number {
  return screen
    .getAllByTestId('uptime-bar')
    .filter(bar => !(bar.querySelector('title')?.textContent ?? '').includes('no data')).length;
}

beforeEach(() => {
  window.history.pushState({}, '', '/status/history/alpha');
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('StatusHistory (issue #114)', () => {
  it('fills the 90d Uptime Overview from the summary daily series', async () => {
    mockFetch(url => (url.endsWith('/summary.json') ? {ok: true, body: summaryWith90Days()} : {ok: false}));
    render(<StatusHistory />);

    await waitFor(() => expect(screen.getByText(/alpha/i)).toBeInTheDocument());
    // The default Uptime Overview period is 90d; with the daily series
    // merged in, the overwhelming majority of the 90 columns have data
    // (readings alone would populate ~2).
    await waitFor(() => expect(populatedBarCount()).toBeGreaterThan(80));
    expect(screen.getByText(/spans up to 90 days from the daily summary/i)).toBeInTheDocument();
  });

  it('degrades gracefully when the summary is unavailable (readings-only, no error)', async () => {
    mockFetch(url => (url.endsWith('/summary.json') ? {ok: false, status: 404} : {ok: false}));
    render(<StatusHistory />);

    await waitFor(() => expect(screen.getByText(/alpha/i)).toBeInTheDocument());
    // No daily series → the page still renders (no error state) and does
    // NOT claim a 90-day span.
    expect(screen.queryByText(/Error Loading Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/from the daily summary/i)).not.toBeInTheDocument();
    // Only the readings window populates the 90d view.
    expect(populatedBarCount()).toBeLessThan(10);
  });
});
