/**
 * Regenerate every derived file on the data branch from on-branch inputs
 * (ADR-005 §5). Used as the `regenerate` step of pushWithRegenerateRetry
 * by BOTH the probe run and the issue-event handler, so whichever writer
 * wins or retries a race rebuilds the identical summary from the merged
 * tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import {buildDailyRollups, buildSummary} from '@stentorosaur/core/server';
import {incidentsToAtom} from '@stentorosaur/core/server';
import type {EntityRef} from '@stentorosaur/core';
import {readAllEntityDetails} from './files';
import {readArchiveReadings} from './archives';
import {readIncidentInputs} from './inputs';

export interface RegenerateOptions {
  /** Injected timestamps keep buildSummary deterministic */
  generatedAt: string;
  generatedBy: string;
  entities: EntityRef[];
  /** Site metadata for the atom feed */
  siteTitle: string;
  siteUrl: string;
  /** Rollup window (default 90 days) */
  windowDays?: number;
}

export function regenerateDerived(rootDir: string, options: RegenerateOptions): void {
  const {
    generatedAt,
    generatedBy,
    entities,
    siteTitle,
    siteUrl,
    windowDays = 90,
  } = options;

  const details = readAllEntityDetails(rootDir);
  const currentReadings = details.flatMap(d => d.readings);
  const archiveReadings = readArchiveReadings(
    rootDir,
    windowDays,
    Date.parse(generatedAt)
  );
  const {incidents, maintenance} = readIncidentInputs(rootDir);

  const summary = buildSummary({
    generatedAt,
    generatedBy,
    entities,
    readings: currentReadings,
    dailyRollups: buildDailyRollups(archiveReadings),
    incidents,
    maintenance,
  });

  const v1 = path.join(rootDir, 'status', 'v1');
  fs.mkdirSync(v1, {recursive: true});
  fs.writeFileSync(path.join(v1, 'summary.json'), JSON.stringify(summary));
  fs.writeFileSync(
    path.join(v1, 'incidents.atom'),
    incidentsToAtom([...summary.incidents.open, ...summary.incidents.recent], {
      siteTitle,
      siteUrl,
      updated: generatedAt,
    })
  );
}
