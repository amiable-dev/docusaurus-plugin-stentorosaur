/**
 * @jest-environment jsdom
 *
 * ADR-004 minimal layout integration — v1.0 (ticket #77): the layouts
 * render from the v1 summary; the uptime bars derive from summary day
 * tuples via StatusDataProvider (no runtime fetch).
 */

import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusPage from '../../src/theme/StatusPage';
import {makeSummary, makeStatusData} from '../helpers/v1-fixtures';

jest.mock('@theme/Layout', () => ({
  __esModule: true,
  default: ({children}: any) => <div data-testid="layout">{children}</div>,
}));

jest.mock('../../src/v1/useStatusSummary', () => ({
  useStatusSummary: ({snapshot}: any) => ({summary: snapshot, source: 'snapshot', lastError: null}),
}));

const summary = makeSummary({
  entities: [
    {name: 'api', displayName: 'API', status: 'up'},
    {name: 'web', displayName: 'Website', status: 'degraded'},
  ],
  incidents: [
    {issueNumber: 5, title: 'Website slowdown', severity: 'major', status: 'open', entities: ['web']},
  ],
});

describe('ADR-004: minimal layout on v1 data', () => {
  it('defaults to the minimal card layout', () => {
    const {container} = render(<StatusPage statusData={makeStatusData(summary)} />);
    // SystemCard buttons carry the display names.
    expect(screen.getAllByText('API').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Website').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[class*="systemCards"]').length).toBeGreaterThan(0);
  });

  it('renders the detailed layout when statusCardLayout is "detailed"', () => {
    const {container} = render(
      <StatusPage statusData={makeStatusData(summary, {statusCardLayout: 'detailed'})} />
    );
    expect(container.querySelectorAll('[class*="systemCards"]').length).toBe(0);
    expect(screen.getAllByText('API').length).toBeGreaterThan(0);
  });

  it('shows an uptime bar per system derived from summary day tuples', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    // Each SystemCard hosts an UptimeBar (role=img with an uptime label).
    // UptimeBar renders role=group (labelled with the uptime summary)
    // when data exists, role=img when empty.
    const bars = [
      ...screen.queryAllByRole('group', {name: /uptime/i}),
      ...screen.queryAllByRole('img', {name: /uptime/i}),
    ];
    expect(bars.length).toBe(2);
  });

  it('shows the overall status banner reflecting degraded systems', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('Some Systems Experiencing Issues')).toBeInTheDocument();
  });

  it('renders all-operational when every entity is up', () => {
    const healthy = makeSummary({entities: [{name: 'api', status: 'up'}]});
    render(<StatusPage statusData={makeStatusData(healthy)} />);
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
  });

  it('renders open incidents below the board', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('Website slowdown')).toBeInTheDocument();
  });
});
