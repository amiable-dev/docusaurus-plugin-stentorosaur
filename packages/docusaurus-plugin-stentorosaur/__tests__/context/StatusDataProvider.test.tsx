/**
 * @jest-environment jsdom
 *
 * StatusDataProvider tests — v1.0 (ADR-005; ticket #77). The provider
 * is a pure derivation over the summary prop: day tuples → DayStatus[]
 * for UptimeBar. No fetching, no loading states.
 */

import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {StatusDataProvider, useStatusData} from '../../src/context/StatusDataProvider';
import type {StatusSummary} from '@stentorosaur/core';

const SUMMARY = {
  schemaVersion: 1,
  generatedAt: '2026-07-13T12:00:00.000Z',
  generatedBy: 'test',
  entities: [
    {
      name: 'API v1',
      type: 'system',
      status: 'up',
      uptime: {d1: 100, d7: 99, d90: 99},
      responseTimeMs: {d1: 42},
      daysEnd: '2026-07-13',
      days: [
        [100, 40, 'u'], // 2026-07-11 (oldest)
        [85, 45, 'd'], // 2026-07-12
        [97.5, 42, 'g'], // 2026-07-13 (newest)
      ],
    },
  ],
  incidents: {open: [], recent: []},
  maintenance: {upcoming: [], inProgress: []},
} as unknown as StatusSummary;

function Probe({service}: {service: string}): JSX.Element {
  const {getMerged90Days, loading, error, dailySummary} = useStatusData();
  const days = getMerged90Days(service);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{String(error)}</span>
      <span data-testid="has-summary">{String(Boolean(dailySummary))}</span>
      <span data-testid="count">{days.length}</span>
      <span data-testid="first">{days[0] ? `${days[0].date}:${days[0].status}:${days[0].uptimePercent}` : ''}</span>
      <span data-testid="last">{days[2] ? `${days[2].date}:${days[2].status}` : ''}</span>
    </div>
  );
}

describe('StatusDataProvider (v1 summary-fed)', () => {
  it('derives DayStatus[] newest-first from the entity day tuples', () => {
    render(
      <StatusDataProvider summary={SUMMARY}>
        <Probe service="API v1" />
      </StatusDataProvider>
    );
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    // Newest first: 07-13 (97.5% degraded), then 07-12 (85% outage), then 07-11.
    expect(screen.getByTestId('first')).toHaveTextContent('2026-07-13:degraded:97.5');
    expect(screen.getByTestId('last')).toHaveTextContent('2026-07-11:operational');
  });

  it('never loads or errors — data is already in props', () => {
    render(
      <StatusDataProvider summary={SUMMARY}>
        <Probe service="API v1" />
      </StatusDataProvider>
    );
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
    expect(screen.getByTestId('has-summary')).toHaveTextContent('true');
  });

  it('is case-insensitive on service names and empty for unknown ones', () => {
    render(
      <StatusDataProvider summary={SUMMARY}>
        <Probe service="api V1" />
      </StatusDataProvider>
    );
    expect(screen.getByTestId('count')).toHaveTextContent('3');

    render(
      <StatusDataProvider summary={SUMMARY}>
        <Probe service="ghost" />
      </StatusDataProvider>
    );
    expect(screen.getAllByTestId('count')[1]).toHaveTextContent('0');
  });

  it('useStatusData outside a provider throws the guidance error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe service="x" />)).toThrow(/StatusDataProvider/);
    spy.mockRestore();
  });
});
