/**
 * status/v1 → legacy StatusData adapter (ADR-005; epic #63 ticket #72).
 *
 * The bridge that lets every existing theme component render the v1
 * contract unchanged: loadContent parses summary.json and adapts it to
 * the shape the components already consume. Pure and deterministic.
 * Dies at the #77 cutover when components consume v1 natively (#73).
 */

import type {StatusSummary, StatusIncidentV1, SummaryEntity} from '@stentorosaur/core';
import type {
  ScheduledMaintenance,
  StatusData,
  StatusIncident,
  StatusItem,
} from '../types';

export interface AdapterOptions {
  /** e.g. https://github.com/owner/repo — used to reconstruct issue URLs */
  repoUrl: string;
}

function displayNameOf(entities: SummaryEntity[], name: string): string {
  const entity = entities.find(e => e.name === name);
  return entity?.displayName || name;
}

function toLegacyIncident(
  incident: StatusIncidentV1,
  summary: StatusSummary,
  repoUrl: string
): StatusIncident {
  return {
    id: incident.issueNumber,
    title: incident.title,
    status: incident.status === 'resolved' ? 'closed' : 'open',
    severity: incident.severity,
    createdAt: incident.createdAt,
    updatedAt: incident.closedAt ?? incident.createdAt,
    ...(incident.closedAt ? {closedAt: incident.closedAt} : {}),
    url: `${repoUrl}/issues/${incident.issueNumber}`,
    // v1 bodies are sanitized HTML rendered at write time; the legacy
    // markdown pipeline re-sanitizes on render (harmless double guard
    // during the bridge period).
    body: incident.bodyHtml,
    labels: [incident.severity, ...incident.entities],
    affectedSystems: incident.entities.map(name =>
      displayNameOf(summary.entities, name)
    ),
  };
}

export function summaryToStatusData(
  summary: StatusSummary,
  options: AdapterOptions
): StatusData {
  const {repoUrl} = options;

  const openByEntity = new Map<string, number>();
  for (const incident of summary.incidents.open) {
    for (const entity of incident.entities) {
      openByEntity.set(entity, (openByEntity.get(entity) ?? 0) + 1);
    }
  }

  const items: StatusItem[] = summary.entities.map(entity => ({
    name: entity.name,
    ...(entity.displayName ? {displayName: entity.displayName} : {}),
    status: entity.status,
    lastChecked: summary.generatedAt,
    ...(entity.responseTimeMs.d1 !== null
      ? {responseTime: entity.responseTimeMs.d1}
      : {}),
    uptime: `${entity.uptime.d90.toFixed(2)}%`,
    incidentCount: openByEntity.get(entity.name) ?? 0,
  }));

  const incidents: StatusIncident[] = [
    ...summary.incidents.open,
    ...summary.incidents.recent,
  ].map(incident => toLegacyIncident(incident, summary, repoUrl));

  const maintenance: ScheduledMaintenance[] = [
    ...summary.maintenance.inProgress,
    ...summary.maintenance.upcoming,
  ].map(window => ({
    id: window.issueNumber,
    title: window.title,
    start: window.start,
    end: window.end,
    status: window.status,
    affectedSystems: window.entities.map(name =>
      displayNameOf(summary.entities, name)
    ),
    description: window.bodyHtml,
    comments: [],
    url: `${repoUrl}/issues/${window.issueNumber}`,
    createdAt: window.start,
  }));

  return {
    items,
    incidents,
    maintenance,
    lastUpdated: summary.generatedAt,
    showServices: true,
    showIncidents: true,
    showPerformanceMetrics: true,
    useDemoData: false,
  };
}
