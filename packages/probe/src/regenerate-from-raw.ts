/**
 * §7 sanitizer-CVE runbook (ticket #74): re-render every derived
 * bodyHtml from the raw/ markdown provenance, then rebuild all derived
 * files. `stentorosaur regenerate` wraps this — the runbook for a
 * sanitizer CVE is: bump the sanitizer in core, run regenerate, push.
 */

import fs from 'node:fs';
import path from 'node:path';
import {extractFrontmatter, renderMarkdownToSafeHtml} from '@stentorosaur/core/server';
import {rawIncidentBodySchema} from '@stentorosaur/core';
import type {RawIncidentBody} from '@stentorosaur/core';
import {readIncidentInputs, writeIncidentInputs} from './inputs';

function readRawBodies(rootDir: string): Map<number, RawIncidentBody> {
  const dir = path.join(rootDir, 'status', 'v1', 'raw');
  const map = new Map<number, RawIncidentBody>();
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const raw = rawIncidentBodySchema.parse(
        JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      );
      map.set(raw.issueNumber, raw);
    } catch (error) {
      console.warn(`[regenerate] skipping malformed raw body ${f}:`, error);
    }
  }
  return map;
}

/**
 * Re-render input bodyHtml from raw markdown with the CURRENT sanitizer.
 * Returns how many entries were re-rendered.
 */
export function reRenderFromRaw(rootDir: string, now: Date): {incidents: number; maintenance: number} {
  const rawBodies = readRawBodies(rootDir);
  const {incidents, maintenance} = readIncidentInputs(rootDir);

  let incidentCount = 0;
  const nextIncidents = incidents.map(incident => {
    const raw = rawBodies.get(incident.issueNumber);
    if (!raw) return incident;
    incidentCount++;
    return {...incident, bodyHtml: renderMarkdownToSafeHtml(raw.bodyMarkdown)};
  });

  let maintenanceCount = 0;
  const nextMaintenance = maintenance.map(window => {
    const raw = rawBodies.get(window.issueNumber);
    if (!raw) return window;
    maintenanceCount++;
    // Maintenance bodies carry frontmatter; re-render the CONTENT half.
    const {content} = extractFrontmatter(raw.bodyMarkdown, now);
    return {...window, bodyHtml: renderMarkdownToSafeHtml(content)};
  });

  writeIncidentInputs(rootDir, nextIncidents, nextMaintenance);
  return {incidents: incidentCount, maintenance: maintenanceCount};
}
