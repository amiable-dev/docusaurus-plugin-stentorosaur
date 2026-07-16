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
import {writeEntityDetail} from './files';
import {readArchiveReadings} from './archives';
import {readIncidentInputs} from './inputs';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Recent per-check window the entity-detail drill-down carries — kept
 * in step with the r2 plane's CURRENT_WINDOW_DAYS. */
const CURRENT_WINDOW_DAYS = 14;

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

  const generatedAtMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedAtMs)) {
    throw new Error(
      `regenerateDerived: generatedAt is not a parseable ISO timestamp: '${generatedAt}'`
    );
  }

  // Read the FULL rollup window from the archives — the append-only
  // source of truth. Nothing below modifies the archives; this only
  // rebuilds DERIVED files from them.
  const archiveReadings = readArchiveReadings(rootDir, windowDays, generatedAtMs);
  const {incidents, maintenance} = readIncidentInputs(rootDir);

  // The recent per-check window that the entity-detail drill-down and
  // the summary's short-window stats read. Derived from the ARCHIVES,
  // not from the on-disk entity details — the probe's writeReadings
  // overwrites each detail with only its latest batch, so reading them
  // back would collapse the window to a single point (#119). The r2
  // plane already rebuilds details this way; this makes the git plane
  // symmetric.
  const windowStart = generatedAtMs - CURRENT_WINDOW_DAYS * DAY_MS;
  const recent = archiveReadings.filter(r => r.t >= windowStart);

  const summary = buildSummary({
    generatedAt,
    generatedBy,
    entities,
    readings: recent,
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

  // Rebuild each probed entity's detail from the recent window so the
  // drill-down charts (Response Time, short-range Uptime/SLI) render
  // real history instead of the single latest batch (#119). Entities
  // with no readings in the window are left untouched — a process-only
  // entity keeps having no detail file, and a temporarily-silent probed
  // entity keeps its last good detail rather than being blanked.
  for (const entity of entities) {
    const detailReadings = recent
      .filter(r => r.svc === entity.name)
      .sort((a, b) => a.t - b.t);
    if (detailReadings.length === 0) continue;
    writeEntityDetail(rootDir, entity.name, detailReadings, generatedAt);
  }
}
