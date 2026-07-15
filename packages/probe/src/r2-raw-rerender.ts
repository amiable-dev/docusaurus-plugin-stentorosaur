/**
 * §7 sanitizer runbook on the r2 plane — SERVER-ONLY (jsdom via the
 * core server barrel). Kept out of r2-plane.ts so Worker bundles never
 * pull jsdom (ADR-006 ticket #100).
 */

import {z} from 'zod';
import {extractFrontmatter, renderMarkdownToSafeHtml} from '@stentorosaur/core/server';
import {incidentSchema, maintenanceWindowSchema, rawIncidentBodySchema} from '@stentorosaur/core';
import type {ObjectStore} from './object-store';
import {PreconditionFailedError} from './object-store';
import {V1} from './r2-plane';

const incidentsFileSchema = z.array(incidentSchema);
const maintenanceFileSchema = z.array(maintenanceWindowSchema);

/**
 * §7 runbook on the r2 plane: re-render every derived bodyHtml from the
 * raw/ markdown with the CURRENT sanitizer, rewriting the inputs.
 * Mirrors regenerate-from-raw.ts (git plane).
 */
export async function reRenderFromRawR2(
  store: ObjectStore,
  now: Date,
  maxRetries = 3,
  onWarn: (message: string) => void = () => {}
): Promise<{incidents: number; maintenance: number}> {
  const rawKeys = await store.list(`${V1}/raw/`);
  const raws = new Map<number, string>();
  for (const key of rawKeys) {
    const object = await store.get(key);
    if (!object) continue;
    try {
      const parsed = rawIncidentBodySchema.safeParse(JSON.parse(object.body));
      if (parsed.success) raws.set(parsed.data.issueNumber, parsed.data.bodyMarkdown);
    } catch {
      // A corrupt raw object must not abort the runbook (Council r=1).
    }
  }

  const parseInputsOrAbort = <T>(
    object: {body: string} | null,
    schema: z.ZodType<T[]>,
    key: string
  ): T[] => {
    if (!object) return [];
    try {
      return schema.parse(JSON.parse(object.body));
    } catch (error) {
      // ABORT, do not fall back (Council r=2): the runbook REWRITES the
      // inputs — proceeding with [] would silently wipe real incidents.
      throw new Error(
        `refusing to re-render: ${key} is malformed (fix or delete it first): ${String(error).slice(0, 200)}`
      );
    }
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const incidentsObj = await store.get(`${V1}/inputs/incidents.json`);
    const maintenanceObj = await store.get(`${V1}/inputs/maintenance.json`);
    const incidents = parseInputsOrAbort(incidentsObj, incidentsFileSchema, `${V1}/inputs/incidents.json`);
    const maintenance = parseInputsOrAbort(maintenanceObj, maintenanceFileSchema, `${V1}/inputs/maintenance.json`);

    let incidentCount = 0;
    const nextIncidents = incidents.map(incident => {
      const raw = raws.get(incident.issueNumber);
      if (raw === undefined) return incident;
      incidentCount++;
      return {...incident, bodyHtml: renderMarkdownToSafeHtml(raw)};
    });

    let maintenanceCount = 0;
    const nextMaintenance = maintenance.map(window => {
      const raw = raws.get(window.issueNumber);
      if (raw === undefined) return window;
      maintenanceCount++;
      const {content} = extractFrontmatter(raw, now);
      return {...window, bodyHtml: renderMarkdownToSafeHtml(content)};
    });

    try {
      // Conditional on the versions we read — a concurrent incident
      // sync must not be clobbered (Council r=1). Two objects cannot
      // commit atomically (Council r=2): maintenance is written FIRST
      // and incidents LAST, and the whole runbook is idempotent — if
      // retries exhaust between the two writes, simply re-running
      // converges (each attempt re-reads both and re-renders from the
      // immutable raw/ set).
      await store.put(`${V1}/inputs/maintenance.json`, JSON.stringify(nextMaintenance), {
        ...(maintenanceObj ? {ifMatch: maintenanceObj.etag} : {ifNoneMatch: '*' as const}),
      });
      await store.put(`${V1}/inputs/incidents.json`, JSON.stringify(nextIncidents), {
        ...(incidentsObj ? {ifMatch: incidentsObj.etag} : {ifNoneMatch: '*' as const}),
      });
      return {incidents: incidentCount, maintenance: maintenanceCount};
    } catch (error) {
      if (!(error instanceof PreconditionFailedError)) throw error;
      // Surface every lost race, not just exhaustion (Council PR #106
      // polish): a busy plane shows up in the operator's logs early.
      onWarn(`re-render commit lost a race (attempt ${attempt}), retrying`);
    }
  }
  throw new Error(
    `re-render commit failed after ${maxRetries} attempts (write contention) — the runbook is idempotent, re-run to converge`
  );
}
