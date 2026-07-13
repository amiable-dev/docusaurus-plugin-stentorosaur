/**
 * v1 → legacy adapter tests (ADR-005; epic #63 ticket #72).
 *
 * The adapter is the bridge that lets every EXISTING theme component
 * render the status/v1 contract unchanged: StatusSummary → StatusData.
 * It dies at the #77 cutover when components consume v1 natively (#73).
 */

import {encodeDayRollups} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';
import {summaryToStatusData} from '../../src/v1/summary-adapter';

const NOW = '2026-07-12T18:00:00.000Z';

function fixtureSummary(): StatusSummary {
  const days = encodeDayRollups([
    {date: '2026-07-11', uptime: 100, avgMs: 100, worst: 'up'},
    {date: '2026-07-12', uptime: 99.5, avgMs: 120, worst: 'degraded'},
  ]);
  return {
    schemaVersion: 1,
    generatedAt: NOW,
    generatedBy: 'probe@0.1.0',
    entities: [
      {
        name: 'api',
        type: 'system',
        displayName: 'API',
        status: 'down',
        uptime: {d1: 99.5, d7: 99.9, d90: 99.95},
        responseTimeMs: {d1: 120},
        ...days,
      },
      {
        name: 'onboarding',
        type: 'process',
        status: 'up',
        uptime: {d1: 100, d7: 100, d90: 100},
        responseTimeMs: {d1: null},
        ...days,
      },
    ],
    incidents: {
      open: [
        {
          issueNumber: 201,
          title: 'API outage',
          severity: 'critical',
          status: 'open',
          entities: ['api'],
          createdAt: '2026-07-12T17:00:00.000Z',
          closedAt: null,
          bodyHtml: '<p>Elevated errors.</p>',
        },
      ],
      recent: [
        {
          issueNumber: 197,
          title: 'Past blip',
          severity: 'minor',
          status: 'resolved',
          entities: ['api'],
          createdAt: '2026-07-10T09:00:00.000Z',
          closedAt: '2026-07-10T10:00:00.000Z',
          bodyHtml: '',
        },
      ],
    },
    maintenance: {
      upcoming: [
        {
          issueNumber: 202,
          title: 'DB migration',
          start: '2026-07-14T02:00:00.000Z',
          end: '2026-07-14T04:00:00.000Z',
          status: 'upcoming',
          entities: ['api'],
          bodyHtml: '<p>Read-only.</p>',
        },
      ],
      inProgress: [],
    },
  };
}

describe('summaryToStatusData', () => {
  it('maps entities to StatusItems with displayName, status, uptime, latency', () => {
    const data = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    expect(data.items).toHaveLength(2);
    const api = data.items.find(i => i.name === 'api')!;
    expect(api.displayName).toBe('API');
    expect(api.status).toBe('down');
    expect(api.uptime).toBe('99.95%'); // d90, matching legacy all-time semantics
    expect(api.responseTime).toBe(120);
    expect(api.incidentCount).toBe(1); // one OPEN incident affecting api
    const onboarding = data.items.find(i => i.name === 'onboarding')!;
    expect(onboarding.status).toBe('up');
    expect(onboarding.responseTime).toBeUndefined();
  });

  it('maps incidents (open + recent) to the legacy shape with issue URLs', () => {
    const data = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    expect(data.incidents.map(i => i.id)).toEqual([201, 197]);
    const open = data.incidents[0];
    expect(open.status).toBe('open');
    expect(open.severity).toBe('critical');
    expect(open.url).toBe('https://github.com/o/r/issues/201');
    expect(open.affectedSystems).toEqual(['API']); // displayName mapping
    expect(open.body).toBe('<p>Elevated errors.</p>');
    expect(data.incidents[1].status).toBe('closed');
    expect(data.incidents[1].closedAt).toBe('2026-07-10T10:00:00.000Z');
  });

  it('maps maintenance windows to ScheduledMaintenance', () => {
    const data = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    expect(data.maintenance).toHaveLength(1);
    expect(data.maintenance[0]).toMatchObject({
      id: 202,
      title: 'DB migration',
      status: 'upcoming',
      start: '2026-07-14T02:00:00.000Z',
      affectedSystems: ['API'],
      description: '<p>Read-only.</p>',
      url: 'https://github.com/o/r/issues/202',
    });
  });

  it('threads lastUpdated from generatedAt and marks v1 provenance', () => {
    const data = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    expect(data.lastUpdated).toBe(NOW);
    expect(data.useDemoData).toBe(false);
  });

  it('is deterministic (no clock reads)', () => {
    const a = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    const b = summaryToStatusData(fixtureSummary(), {repoUrl: 'https://github.com/o/r'});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
