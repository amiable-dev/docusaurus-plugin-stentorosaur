/**
 * SVG chart tests (ADR-005 §11; epic #63 ticket #73).
 * chart.js is gone: the three chart components render accessible inline
 * SVG in jsdom (canvas never could), so they're finally unit-testable.
 * @jest-environment jsdom
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import ResponseTimeChart from '../src/theme/ResponseTimeChart';
import UptimeChart from '../src/theme/UptimeChart';
import SLIChart from '../src/theme/SLIChart';
import type {StatusCheckHistory} from '../src/types';

function makeHistory(hours: number, everyMinutes = 30): StatusCheckHistory[] {
  const now = Date.now();
  const history: StatusCheckHistory[] = [];
  for (let m = 0; m < hours * 60; m += everyMinutes) {
    const t = now - m * 60_000;
    const down = m % 240 === 0 && m > 0; // periodic failures
    history.push({
      timestamp: new Date(t).toISOString(),
      status: down ? 'down' : 'up',
      responseTime: down ? 0 : 100 + (m % 90),
      code: down ? 500 : 200,
    });
  }
  return history;
}

describe('ResponseTimeChart (SVG)', () => {
  it('renders an accessible SVG line with one point per check', () => {
    const history = makeHistory(24);
    render(<ResponseTimeChart name="api" history={history} period="24h" showPeriodSelector={false} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/Response time chart for api/);
    expect(screen.getAllByTestId('line-point')).toHaveLength(history.length);
    expect(screen.getByText(/Average Response Time:/)).toBeInTheDocument();
  });

  it('period selector switches the window', () => {
    render(<ResponseTimeChart name="api" history={makeHistory(24)} period="90d" />);
    fireEvent.click(screen.getByText('Last 24 Hours'));
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Last 24 Hours/);
  });

  it('shows the no-data state for an empty window', () => {
    render(<ResponseTimeChart name="api" history={[]} />);
    expect(screen.getByText(/No response time data/)).toBeInTheDocument();
  });

  it('offers CSV and JSON export only (chart-image export is gone)', () => {
    render(<ResponseTimeChart name="api" history={makeHistory(24)} />);
    expect(screen.getByLabelText(/as CSV/)).toBeInTheDocument();
    expect(screen.getByLabelText(/as JSON/)).toBeInTheDocument();
    expect(screen.queryByText('PNG')).not.toBeInTheDocument();
    expect(screen.queryByText('JPG')).not.toBeInTheDocument();
  });
});

describe('frozen-snapshot anchoring (Council PR #92 r=2)', () => {
  function makeStaleHistory(hours: number, ageDays: number): StatusCheckHistory[] {
    // Data whose NEWEST reading is ageDays old — a snapshot-only build.
    const anchor = Date.now() - ageDays * 24 * 60 * 60 * 1000;
    const history: StatusCheckHistory[] = [];
    for (let m = 0; m < hours * 60; m += 30) {
      history.push({
        timestamp: new Date(anchor - m * 60_000).toISOString(),
        status: 'up',
        responseTime: 100,
        code: 200,
      });
    }
    return history;
  }

  it('ResponseTimeChart still renders data whose newest reading is days old', () => {
    const history = makeStaleHistory(24, 10);
    render(
      <ResponseTimeChart name="api" history={history} period="24h" showPeriodSelector={false} />
    );
    // Wall-clock windowing would render the no-data state here.
    expect(screen.getAllByTestId('line-point')).toHaveLength(history.length);
  });

  it('SLIChart still renders SLI data whose newest reading is days old', () => {
    render(<SLIChart name="api" history={makeStaleHistory(24, 10)} sloTarget={99} period="24h" />);
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument();
  });
});

describe('UptimeChart (SVG)', () => {
  it('renders 24 hourly bars for the 24h period', () => {
    render(<UptimeChart name="api" history={makeHistory(24)} period="24h" showPeriodSelector={false} />);
    expect(screen.getAllByTestId('uptime-bar')).toHaveLength(24);
    expect(screen.getByText(/Overall Uptime:/)).toBeInTheDocument();
  });

  it('renders heatmap cells in heatmap mode', () => {
    render(
      <UptimeChart name="api" history={makeHistory(24)} period="24h" chartType="heatmap" showPeriodSelector={false} />
    );
    expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(24);
    expect(screen.queryAllByTestId('uptime-bar')).toHaveLength(0);
  });

  it('lists annotations inside the window instead of a canvas overlay', () => {
    const annotations = [
      {
        id: 'a1',
        type: 'incident' as const,
        timestamp: new Date().toISOString(),
        title: 'API outage',
        severity: 'critical' as const,
      },
    ];
    render(
      <UptimeChart name="api" history={makeHistory(24)} period="24h" annotations={annotations} showPeriodSelector={false} />
    );
    const items = screen.getAllByTestId('chart-annotation');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('API outage');
  });
});

describe('SLIChart (SVG)', () => {
  it('renders the SLO threshold line and SLI points', () => {
    render(<SLIChart name="api" history={makeHistory(72)} period="30d" showPeriodSelector={false} sloTarget={99.9} />);
    expect(screen.getByTestId('threshold-line')).toBeInTheDocument();
    expect(screen.getByText(/SLO Target:/)).toBeInTheDocument();
    expect(screen.getAllByTestId('line-point').length).toBeGreaterThan(0);
  });

  it('error-budget mode drops the SLO line and relabels the stat', () => {
    render(
      <SLIChart name="api" history={makeHistory(72)} period="30d" showPeriodSelector={false} showErrorBudget />
    );
    expect(screen.queryByTestId('threshold-line')).not.toBeInTheDocument();
    expect(screen.getByText(/Error Budget Remaining:/)).toBeInTheDocument();
  });

  it('shows the no-data state for an empty window', () => {
    render(<SLIChart name="api" history={[]} />);
    expect(screen.getByText(/No historical data/)).toBeInTheDocument();
  });
});

describe('Council PR #88 r=1 regression guards', () => {
  it('a changed period PROP flows through after mount (no frozen useState)', () => {
    const {rerender} = render(
      <ResponseTimeChart name="api" history={makeHistory(24)} period="90d" />
    );
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Last 90 Days/);
    rerender(<ResponseTimeChart name="api" history={makeHistory(24)} period="24h" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Last 24 Hours/);
  });

  it('charts scale uniformly (no preserveAspectRatio="none" distortion)', () => {
    render(<ResponseTimeChart name="api" history={makeHistory(24)} showPeriodSelector={false} />);
    expect(screen.getByRole('img').getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('a 0% uptime block still renders a visible bar', () => {
    const now = Date.now();
    const allDown: StatusCheckHistory[] = Array.from({length: 4}, (_, i) => ({
      timestamp: new Date(now - i * 10 * 60_000).toISOString(),
      status: 'down',
      responseTime: 0,
      code: 500,
    }));
    render(<UptimeChart name="api" history={allDown} period="24h" showPeriodSelector={false} />);
    const bars = screen.getAllByTestId('uptime-bar');
    const zeroBar = bars.find(bar => bar.querySelector('title')?.textContent?.includes('0.00%'));
    expect(zeroBar).toBeDefined();
    expect(Number(zeroBar!.getAttribute('height'))).toBeGreaterThanOrEqual(2);
  });
});
