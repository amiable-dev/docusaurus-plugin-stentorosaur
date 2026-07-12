/**
 * Maintenance-issue parsing (ported from the plugin's maintenance-utils
 * in ticket #68; deterministic — `now` and reference dates are injected,
 * never read from the clock). SERVER-ONLY via '@stentorosaur/core/server'
 * (chrono-node is a write-side dependency).
 */

import * as chrono from 'chrono-node';
import type {MaintenanceWindowV1} from './status-v1';
import type {IssuePayload, TransformContext} from './issues';

export interface MaintenanceFrontmatter {
  type?: string;
  start?: string;
  end?: string;
  systems?: string[];
}

/**
 * Parse human-friendly date strings to ISO 8601.
 * ISO passthrough, '@tomorrow 2am UTC' shorthand, relative ('+2h').
 */
export function parseHumanDate(dateStr: string, referenceDate?: Date): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const trimmed = dateStr.trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(trimmed)) {
    return trimmed;
  }

  let processedStr = trimmed;
  if (processedStr.startsWith('@')) {
    processedStr = processedStr.substring(1);
  }

  const parsed = chrono.parseDate(processedStr, referenceDate ?? new Date());
  if (parsed) {
    return parsed.toISOString();
  }

  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString();
  }
  return null;
}

/**
 * Extract YAML-ish frontmatter from an issue body, skipping GitHub
 * issue-form headings that precede the first '---' delimiter.
 */
export function extractFrontmatter(
  body: string,
  referenceDate?: Date
): {frontmatter: MaintenanceFrontmatter; content: string} {
  const lines = body.split('\n');
  let contentStart = 0;

  const firstDelimiterIndex = lines.findIndex(line => line.trim() === '---');
  if (firstDelimiterIndex !== -1) {
    while (contentStart < firstDelimiterIndex) {
      const line = lines[contentStart].trim();
      if (line.startsWith('#') || line === '') {
        contentStart++;
      } else {
        break;
      }
    }
  }

  const cleanedBody = lines.slice(contentStart).join('\n');
  const match = cleanedBody.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return {frontmatter: {}, content: cleanedBody};
  }

  const [, frontmatterText, content] = match;
  const frontmatter: MaintenanceFrontmatter = {};
  const frontmatterLines = frontmatterText.split('\n');

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key === 'type') {
      frontmatter.type = value;
    } else if (key === 'start') {
      frontmatter.start = parseHumanDate(value, referenceDate) || value;
    } else if (key === 'end') {
      frontmatter.end = parseHumanDate(value, referenceDate) || value;
    } else if (key === 'systems') {
      const systemsStart = frontmatterLines.indexOf(line);
      const systems: string[] = [];
      for (let i = systemsStart + 1; i < frontmatterLines.length; i++) {
        const systemLine = frontmatterLines[i];
        if (systemLine.trim().startsWith('-')) {
          systems.push(systemLine.trim().substring(1).trim());
        } else if (!systemLine.trim().startsWith(' ')) {
          break;
        }
      }
      if (systems.length > 0) {
        frontmatter.systems = systems;
      }
    }
  }

  return {frontmatter, content};
}

/**
 * Maintenance window status from its times and issue state, evaluated
 * against an INJECTED `now` (determinism: buildSummary must be a pure
 * function of its inputs).
 */
export function getMaintenanceStatus(
  start: string,
  end: string,
  issueState: 'open' | 'closed',
  now: Date
): MaintenanceWindowV1['status'] {
  if (issueState === 'closed') {
    return 'completed';
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (now >= startDate && now <= endDate) {
    return 'in-progress';
  }
  if (now < startDate) {
    return 'upcoming';
  }
  return 'completed';
}

export interface MaintenanceTransformContext extends TransformContext {
  now: Date;
}

/**
 * Convert a maintenance issue into a status/v1 window. Returns null when
 * the frontmatter lacks parseable start/end times (malformed tickets are
 * skipped, never fatal — the probe reports them separately).
 */
export function issueToMaintenanceV1(
  issue: IssuePayload,
  ctx: MaintenanceTransformContext
): MaintenanceWindowV1 | null {
  const {frontmatter, content} = extractFrontmatter(issue.body ?? '', ctx.now);
  if (!frontmatter.start || !frontmatter.end) {
    return null;
  }
  const start = Date.parse(frontmatter.start);
  const end = Date.parse(frontmatter.end);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }

  const labels = issue.labels.map(l => l.name);
  const labelEntities = ctx.labelParser
    .extractEntitiesFromLabels(labels, ctx.entities)
    .map(e => e.name);
  const knownNames = new Set(ctx.entities.map(e => e.name));
  const frontmatterEntities = (frontmatter.systems ?? []).filter(s => knownNames.has(s));

  return {
    issueNumber: issue.number,
    title: issue.title,
    start: frontmatter.start,
    end: frontmatter.end,
    status: getMaintenanceStatus(frontmatter.start, frontmatter.end, issue.state, ctx.now),
    entities: [...new Set([...labelEntities, ...frontmatterEntities])],
    bodyHtml: ctx.renderHtml(content),
  };
}
