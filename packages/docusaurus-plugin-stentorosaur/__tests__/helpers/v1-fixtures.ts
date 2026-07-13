/**
 * Shared v1 test fixtures (ticket #77): build a StatusSummary and the
 * StatusData the plugin would produce from it, so component tests
 * exercise the ONE real data path.
 */

import type {StatusSummary} from '@stentorosaur/core';
import type {StatusData} from '../../src/types';

export interface FixtureEntity {
  name: string;
  displayName?: string;
  status?: 'up' | 'down' | 'degraded' | 'maintenance';
  responseTime?: number | null;
  uptimeD90?: number;
}

export interface FixtureIncident {
  issueNumber: number;
  title: string;
  severity?: 'critical' | 'major' | 'minor';
  status?: 'open' | 'resolved';
  entities?: string[];
  createdAt?: string;
  closedAt?: string | null;
  bodyHtml?: string;
}

export interface FixtureMaintenance {
  issueNumber: number;
  title: string;
  start?: string;
  end?: string;
  status?: 'upcoming' | 'in-progress';
  entities?: string[];
  bodyHtml?: string;
}

export function makeSummary(opts: {
  entities?: FixtureEntity[];
  incidents?: FixtureIncident[];
  maintenance?: FixtureMaintenance[];
  generatedAt?: string;
}): StatusSummary {
  const generatedAt = opts.generatedAt ?? '2026-07-13T12:00:00.000Z';
  const daysEnd = generatedAt.split('T')[0];
  return {
    schemaVersion: 1,
    generatedAt,
    generatedBy: 'test',
    entities: (opts.entities ?? []).map(e => ({
      name: e.name,
      type: 'system' as const,
      ...(e.displayName ? {displayName: e.displayName} : {}),
      status: e.status ?? 'up',
      uptime: {d1: 100, d7: 100, d90: e.uptimeD90 ?? 100},
      responseTimeMs: {d1: e.responseTime ?? 42},
      daysEnd,
      days: [[100, 40, 'u'], [99, 41, 'u'], [100, 42, 'u']] as any,
    })),
    incidents: {
      open: (opts.incidents ?? [])
        .filter(i => (i.status ?? 'open') === 'open')
        .map(fixIncident),
      recent: (opts.incidents ?? [])
        .filter(i => i.status === 'resolved')
        .map(fixIncident),
    },
    maintenance: {
      upcoming: (opts.maintenance ?? [])
        .filter(m => (m.status ?? 'upcoming') === 'upcoming')
        .map(fixMaintenance),
      inProgress: (opts.maintenance ?? [])
        .filter(m => m.status === 'in-progress')
        .map(fixMaintenance),
    },
  } as StatusSummary;
}

function fixIncident(i: FixtureIncident) {
  return {
    issueNumber: i.issueNumber,
    title: i.title,
    severity: i.severity ?? 'minor',
    status: i.status ?? 'open',
    entities: i.entities ?? [],
    createdAt: i.createdAt ?? '2026-07-13T09:00:00.000Z',
    closedAt: i.closedAt ?? (i.status === 'resolved' ? '2026-07-13T11:00:00.000Z' : null),
    bodyHtml: i.bodyHtml ?? '<p>details</p>',
  };
}

function fixMaintenance(m: FixtureMaintenance) {
  return {
    issueNumber: m.issueNumber,
    title: m.title,
    start: m.start ?? '2026-07-20T02:00:00.000Z',
    end: m.end ?? '2026-07-20T04:00:00.000Z',
    status: m.status ?? 'upcoming',
    entities: m.entities ?? [],
    bodyHtml: m.bodyHtml ?? '<p>planned work</p>',
  };
}

export function makeStatusData(
  summary: StatusSummary,
  extra: Partial<StatusData> = {}
): StatusData {
  return {
    items: [],
    incidents: [],
    maintenance: [],
    lastUpdated: summary.generatedAt,
    showServices: true,
    showIncidents: true,
    showPerformanceMetrics: true,
    v1Summary: summary,
    dataUrl: '/status-data/status/v1/summary.json',
    repoUrl: 'https://github.com/test/test',
    ...extra,
  };
}
