/**
 * Incident/maintenance INPUT files on the data branch (ticket #70).
 *
 * status/v1/inputs/incidents.json and maintenance.json are written by
 * the issue-event handler and read by EVERY writer's regenerate step —
 * a probe run must fold the latest incidents into summary.json even
 * though it never talks to the GitHub issues API (ADR-005 §5: the
 * summary is a pure function of ALL on-branch inputs).
 * Raw markdown bodies live under status/v1/raw/ (§7 provenance).
 */

import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {
  incidentSchema,
  maintenanceWindowSchema,
  rawIncidentBodySchema,
} from '@stentorosaur/core';
import type {
  MaintenanceWindowV1,
  RawIncidentBody,
  StatusIncidentV1,
} from '@stentorosaur/core';

const incidentsFileSchema = z.array(incidentSchema);
const maintenanceFileSchema = z.array(maintenanceWindowSchema);

function inputsDir(rootDir: string): string {
  return path.join(rootDir, 'status', 'v1', 'inputs');
}

export function writeIncidentInputs(
  rootDir: string,
  incidents: StatusIncidentV1[],
  maintenance: MaintenanceWindowV1[]
): void {
  incidentsFileSchema.parse(incidents);
  maintenanceFileSchema.parse(maintenance);
  const dir = inputsDir(rootDir);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'incidents.json'), JSON.stringify(incidents));
  fs.writeFileSync(path.join(dir, 'maintenance.json'), JSON.stringify(maintenance));
}

export function readIncidentInputs(rootDir: string): {
  incidents: StatusIncidentV1[];
  maintenance: MaintenanceWindowV1[];
} {
  const dir = inputsDir(rootDir);
  const read = <T>(file: string, schema: z.ZodType<T>, fallback: T): T => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return fallback;
    try {
      return schema.parse(JSON.parse(fs.readFileSync(p, 'utf8')));
    } catch (error) {
      console.warn(`[probe] skipping malformed ${file}:`, error);
      return fallback;
    }
  };
  return {
    incidents: read('incidents.json', incidentsFileSchema, []),
    maintenance: read('maintenance.json', maintenanceFileSchema, []),
  };
}

/** status/v1/raw/<issue>.json — the §7 re-render source. */
export function writeRawIssueBody(rootDir: string, raw: RawIncidentBody): string {
  rawIncidentBodySchema.parse(raw);
  const dir = path.join(rootDir, 'status', 'v1', 'raw');
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${raw.issueNumber}.json`);
  fs.writeFileSync(file, JSON.stringify(raw));
  return file;
}
