/**
 * GitHub issue payload → status/v1 transforms (ADR-005 §1: fetching is
 * I/O and lives in probe; these functions only transform already-fetched
 * payloads). Pure and client-safe — HTML rendering is INJECTED so the
 * sanitizer (jsdom-backed, server-only) never enters client bundles.
 */

import type {LabelParser, EntityRef} from './labels';
import type {StatusIncidentV1} from './status-v1';

/** The subset of a GitHub REST issue the transforms consume. */
export interface IssuePayload {
  number: number;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  html_url: string;
  body?: string | null;
  labels: Array<{name: string}>;
}

export interface TransformContext {
  entities: EntityRef[];
  labelParser: LabelParser;
  /** Write-time markdown → sanitized HTML (see server-only render.ts) */
  renderHtml: (markdown: string) => string;
}

/** Severity from labels: critical > major > minor (default). */
export function extractSeverity(labels: string[]): 'critical' | 'major' | 'minor' {
  if (labels.includes('critical')) return 'critical';
  if (labels.includes('major')) return 'major';
  return 'minor';
}

/** Whether the label set marks a scheduled-maintenance issue. */
export function isMaintenanceIssue(
  labels: string[],
  maintenanceLabels: string[]
): boolean {
  return labels.some(label => maintenanceLabels.includes(label));
}

/**
 * Convert an issue into a status/v1 incident. Entity references use
 * canonical NAMES (displayName mapping is a presentation concern).
 */
export function issueToIncidentV1(
  issue: IssuePayload,
  ctx: TransformContext
): StatusIncidentV1 {
  const labels = issue.labels.map(l => l.name);
  return {
    issueNumber: issue.number,
    title: issue.title,
    severity: extractSeverity(labels),
    status: issue.state === 'closed' ? 'resolved' : 'open',
    entities: ctx.labelParser
      .extractEntitiesFromLabels(labels, ctx.entities)
      .map(e => e.name),
    createdAt: issue.created_at,
    closedAt: issue.closed_at ?? null,
    bodyHtml: ctx.renderHtml(issue.body ?? ''),
  };
}

type EntityState = 'up' | 'degraded' | 'down' | 'maintenance';

/**
 * Worst-wins entity status: starts from the probe-observed state and
 * escalates for OPEN incidents affecting the entity (port of the
 * plugin's generateStatusItems ordering: down > degraded > maintenance > up).
 */
export function worstEntityStatus(
  probeState: EntityState,
  incidents: StatusIncidentV1[],
  entityName: string
): EntityState {
  let status: EntityState = probeState;
  for (const incident of incidents) {
    if (incident.status !== 'open') continue;
    if (!incident.entities.includes(entityName)) continue;

    const incidentStatus: EntityState =
      incident.severity === 'critical' ? 'down' : 'degraded';

    if (
      incidentStatus === 'down' ||
      (incidentStatus === 'degraded' && status !== 'down')
    ) {
      status = incidentStatus;
    }
  }
  return status;
}
