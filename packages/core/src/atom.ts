/**
 * incidents.atom — machine-readable incident feed (ADR-005 §2, §11: the
 * v1.0 substitute for push notifications). Pure and deterministic; the
 * feed's updated timestamp is injected.
 */

import type {StatusIncidentV1} from './status-v1';

export interface AtomFeedOptions {
  siteTitle: string;
  /** Absolute site URL, no trailing slash required */
  siteUrl: string;
  /** ISO timestamp for the feed's <updated> — injected, not clock-read */
  updated: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function incidentsToAtom(
  incidents: StatusIncidentV1[],
  options: AtomFeedOptions
): string {
  const base = options.siteUrl.replace(/\/+$/, '');
  const feedId = `${base}/status`;

  const entries = incidents
    .map(incident => {
      const entryUpdated = incident.closedAt ?? incident.createdAt;
      const statusLine =
        incident.status === 'open'
          ? `Open ${incident.severity} incident`
          : `Resolved ${incident.severity} incident`;
      return [
        '  <entry>',
        `    <id>${escapeXml(feedId)}/incidents/${incident.issueNumber}</id>`,
        `    <title>${escapeXml(incident.title)}</title>`,
        `    <updated>${escapeXml(entryUpdated)}</updated>`,
        `    <link href="${escapeXml(`${base}/status`)}"/>`,
        `    <category term="${escapeXml(incident.severity)}"/>`,
        `    <summary>${escapeXml(
          `${statusLine} affecting: ${incident.entities.join(', ') || 'unspecified'}`
        )}</summary>`,
        `    <content type="html">${escapeXml(incident.bodyHtml)}</content>`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(feedId)}</id>`,
    `  <title>${escapeXml(options.siteTitle)} — incidents</title>`,
    `  <updated>${escapeXml(options.updated)}</updated>`,
    `  <link href="${escapeXml(feedId)}" rel="alternate"/>`,
    entries,
    '</feed>',
    '',
  ].join('\n');
}
