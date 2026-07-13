/**
 * @jest-environment jsdom
 *
 * StatusPage tests — v1.0 (ticket #77): everything renders from the v1
 * summary; chart drill-down fetches the canonical entity-detail path.
 */

import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusPage, {deriveV1BaseUrl, entitySlug, detailToSystemFile} from '../src/theme/StatusPage';
import {makeSummary, makeStatusData} from './helpers/v1-fixtures';

jest.mock('@theme/Layout', () => ({
  __esModule: true,
  default: ({children, title, description}: any) => (
    <div data-testid="layout" data-title={title} data-description={description}>
      {children}
    </div>
  ),
}));

jest.mock('../src/v1/useStatusSummary', () => ({
  useStatusSummary: ({snapshot}: any) => ({summary: snapshot, source: 'snapshot', lastError: null}),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StatusPage (v1)', () => {
  const summary = makeSummary({
    entities: [
      {name: 'API', status: 'up'},
      {name: 'Database', status: 'up'},
    ],
    incidents: [
      {
        issueNumber: 1,
        title: 'API Degraded Performance',
        severity: 'minor',
        status: 'resolved',
        entities: ['API'],
      },
    ],
    maintenance: [
      {
        issueNumber: 10,
        title: 'Database Upgrade',
        status: 'upcoming',
        bodyHtml: '<p>Upgrading database to version 2.0</p>',
      },
    ],
  });

  it('renders systems from the summary', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getAllByText('API').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Database').length).toBeGreaterThan(0);
  });

  it('renders incident history from the summary', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('API Degraded Performance')).toBeInTheDocument();
  });

  it('renders upcoming scheduled maintenance with its sanitized HTML body', () => {
    render(<StatusPage statusData={makeStatusData(summary)} />);
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Database Upgrade')).toBeInTheDocument();
    expect(screen.getByText('Upgrading database to version 2.0')).toBeInTheDocument();
  });

  it('does not render the maintenance section without maintenance data', () => {
    const quiet = makeSummary({entities: [{name: 'API'}]});
    render(<StatusPage statusData={makeStatusData(quiet)} />);
    expect(screen.queryByText('Scheduled Maintenance')).not.toBeInTheDocument();
  });

  it('respects showServices flag', () => {
    const {container} = render(
      <StatusPage statusData={makeStatusData(summary, {showServices: false})} />
    );
    // No system cards — the name may still appear in incident/maintenance tags.
    expect(container.querySelectorAll('[class*="systemCards"]').length).toBe(0);
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
  });

  it('respects showIncidents flag', () => {
    render(<StatusPage statusData={makeStatusData(summary, {showIncidents: false})} />);
    expect(screen.queryByText('API Degraded Performance')).not.toBeInTheDocument();
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
  });

  it('uses the title/description from the plugin options', () => {
    render(
      <StatusPage
        statusData={makeStatusData(summary, {title: 'Acme Status', description: 'How Acme is doing'})}
      />
    );
    expect(screen.getByTestId('layout')).toHaveAttribute('data-title', 'Acme Status');
  });

  it('fetches entity detail from the canonical slugged v1 path on expand', async () => {
    const withDisplay = makeSummary({
      entities: [{name: 'API v1', displayName: 'Public API', status: 'up'}],
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: withDisplay.generatedAt,
          name: 'API v1',
          readings: [
            {t: Date.parse(withDisplay.generatedAt), svc: 'API v1', state: 'up', code: 200, lat: 50},
          ],
        }),
    });
    (global as any).fetch = fetchMock;

    render(
      <StatusPage
        statusData={makeStatusData(withDisplay, {
          dataUrl: '/docs/status-data/status/v1/summary.json',
        })}
      />
    );
    expect(screen.getByText('Public API')).toBeInTheDocument();

    // Expand the card → the canonical (name-derived, not displayName)
    // entity path is fetched.
    fireEvent.click(screen.getByRole('button', {name: /Public API/i}));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/docs/status-data/status/v1/entities/api-v1.json',
        expect.anything()
      )
    );
  });
});

describe('v1 helpers', () => {
  it('deriveV1BaseUrl maps any summary.json mount to its directory', () => {
    expect(deriveV1BaseUrl('/docs/status-data/status/v1/summary.json')).toBe(
      '/docs/status-data/status/v1'
    );
    // Custom mounts that preserve the directory layout work too (r=1).
    expect(deriveV1BaseUrl('https://cdn.test/mirror/summary.json')).toBe(
      'https://cdn.test/mirror'
    );
    expect(deriveV1BaseUrl('https://x.test/nope.json')).toBeUndefined();
    expect(deriveV1BaseUrl(undefined)).toBeUndefined();
  });

  it('entitySlug matches the probe slug rules', () => {
    expect(entitySlug('API v1')).toBe('api-v1');
    expect(entitySlug('  Fancy -- Name!! ')).toBe('fancy-name');
  });

  it('detailToSystemFile sorts readings and maps the latest state', () => {
    const file = detailToSystemFile({
      name: 'api',
      generatedAt: '2026-07-13T12:00:00.000Z',
      readings: [
        {t: 2000, state: 'down', code: 500, lat: 0},
        {t: 1000, state: 'up', code: 200, lat: 40},
      ],
    });
    expect(file.currentStatus).toBe('down');
    expect(file.history.map(h => h.responseTime)).toEqual([40, 0]);
  });
});
