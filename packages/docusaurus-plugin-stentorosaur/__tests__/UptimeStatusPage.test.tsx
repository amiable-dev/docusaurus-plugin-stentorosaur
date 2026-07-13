/**
 * @jest-environment jsdom
 *
 * UptimeStatusPage tests — v1.0 (ticket #77): the page renders from the
 * v1 summary (snapshot-first, useStatusSummary pass-through mocked).
 */

import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import UptimeStatusPage from '../src/theme/UptimeStatusPage';
import {makeSummary, makeStatusData} from './helpers/v1-fixtures';

jest.mock('@theme/Layout', () => ({
  __esModule: true,
  default: ({children}: any) => <div data-testid="layout">{children}</div>,
}));

jest.mock('../src/v1/useStatusSummary', () => ({
  useStatusSummary: ({snapshot}: any) => ({summary: snapshot, source: 'snapshot', lastError: null}),
}));

describe('UptimeStatusPage (v1)', () => {
  const summary = makeSummary({
    entities: [
      {name: 'API Service', status: 'up'},
      {name: 'Database', status: 'degraded'},
    ],
    incidents: [
      {issueNumber: 1, title: 'Active Issue', severity: 'major', status: 'open', entities: ['Database']},
      {
        issueNumber: 2,
        title: 'Resolved Issue',
        severity: 'minor',
        status: 'resolved',
        entities: ['API Service'],
      },
    ],
    maintenance: [{issueNumber: 101, title: 'Upcoming Maintenance', status: 'upcoming'}],
  });

  it('renders live status with systems from the summary', () => {
    render(<UptimeStatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getAllByText('API Service').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Database').length).toBeGreaterThan(0);
    expect(screen.getByText('📊 Live System Status')).toBeInTheDocument();
  });

  it('displays active incidents in their own section', () => {
    render(<UptimeStatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('🚨 Active Incidents')).toBeInTheDocument();
    expect(screen.getByText('Active Issue')).toBeInTheDocument();
  });

  it('displays past incidents (resolved) separately', () => {
    render(<UptimeStatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('📜 Past Incidents')).toBeInTheDocument();
    expect(screen.getByText('Resolved Issue')).toBeInTheDocument();
  });

  it('displays scheduled maintenance', () => {
    render(<UptimeStatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('🔧 Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Maintenance')).toBeInTheDocument();
  });

  it('renders sanitized incident HTML bodies directly (no client re-render)', () => {
    const withHtml = makeSummary({
      entities: [{name: 'API Service'}],
      incidents: [
        {
          issueNumber: 3,
          title: 'HTML Incident',
          bodyHtml: '<strong>bold detail</strong>',
        },
      ],
    });
    render(<UptimeStatusPage statusData={makeStatusData(withHtml)} />);
    expect(screen.getByText('bold detail').tagName).toBe('STRONG');
  });

  it('hides sections when they have no data', () => {
    const quiet = makeSummary({entities: [{name: 'API Service'}]});
    render(<UptimeStatusPage statusData={makeStatusData(quiet)} />);
    expect(screen.queryByText('🚨 Active Incidents')).not.toBeInTheDocument();
    expect(screen.queryByText('🔧 Scheduled Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('📜 Past Incidents')).not.toBeInTheDocument();
  });
});
