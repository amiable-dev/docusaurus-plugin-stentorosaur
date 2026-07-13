/**
 * The unified `stentorosaur` CLI (ADR-005 §11; epic #63 ticket #74).
 * Replaces the nine legacy bin scripts at the #77 cutover.
 *
 *   stentorosaur init               scaffold stentorosaur.config.js
 *   stentorosaur doctor             validate config + data plane health
 *   stentorosaur probe              run checks, write + push (§5 retry)
 *   stentorosaur update-incidents   sync issues, write + push (§5 retry)
 *   stentorosaur regenerate         §7 re-render from raw/ + rebuild
 *   stentorosaur migrate            one-time legacy → status/v1 (#75)
 *   stentorosaur ingest             receive dispatched readings (§6, #76)
 *
 * probe/update-incidents/regenerate operate on a git worktree of the
 * data branch (the workflow templates check it out first) or any dir
 * via --workdir.
 */

import fs from 'node:fs';
import path from 'node:path';
import {appendArchive, assertUniqueSlugs, writeEntityDetail} from './files';
import {findConfigFile, loadConfig} from './config-loader';
import {runChecks} from './check';
import type {CheckTarget} from './check';
import {pushWithRegenerateRetry} from './git-writer';
import {regenerateDerived} from './regenerate';
import {reRenderFromRaw} from './regenerate-from-raw';
import {fetchStatusIssues, writeIssueInputs} from './update-incidents';
import {migrateHistoricalData, planMigration} from './migrate';
import type {MigrationReport} from './migrate';
import {parseProbeDispatch, parseSummary} from '@stentorosaur/core';
import type {CompactReading, StentorosaurConfig} from '@stentorosaur/core';

interface CliOptions {
  config: string;
  workdir: string;
  branch?: string;
  push: boolean;
  /** migrate: legacy status-data directory */
  from: string;
  /** migrate: plan only, write nothing */
  dryRun: boolean;
  /** ingest: path to the repository_dispatch client_payload JSON */
  payload?: string;
}

function parseArgs(argv: string[]): {command: string; options: CliOptions} {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = {
    config: process.cwd(),
    workdir: process.cwd(),
    push: true,
    from: 'status-data',
    dryRun: false,
  };
  const takeValue = (flag: string, i: number): string => {
    const value = rest[i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };
  for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
      case '--config':
        options.config = takeValue('--config', ++i);
        break;
      case '--workdir':
        options.workdir = takeValue('--workdir', ++i);
        break;
      case '--branch':
        options.branch = takeValue('--branch', ++i);
        break;
      case '--no-push':
        options.push = false;
        break;
      case '--from':
        options.from = takeValue('--from', ++i);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--payload':
        options.payload = takeValue('--payload', ++i);
        break;
      default:
        throw new Error(`unknown flag: ${rest[i]}`);
    }
  }
  return {command, options};
}

function regenOptions(config: StentorosaurConfig, generatedAt: string) {
  return {
    generatedAt,
    generatedBy: `stentorosaur-cli`,
    entities: config.entities.map(({name, type, displayName}) => ({
      name,
      type,
      ...(displayName ? {displayName} : {}),
    })),
    siteTitle: config.site.title,
    siteUrl: config.site.url ?? `https://github.com/${config.owner}/${config.repo}`,
  };
}

const CONFIG_TEMPLATE = `// stentorosaur.config.js — single source of truth for the probe, the
// CLI, and the status plugin (ADR-005 §8). TypeScript configs work too:
// rename to stentorosaur.config.ts and import {defineConfig} for types.

/** @type {import('@stentorosaur/core').StentorosaurConfigInput} */
module.exports = {
  owner: 'OWNER',
  repo: 'REPO',
  dataBranch: 'status-data',
  entities: [
    {
      name: 'api',
      type: 'system',
      displayName: 'API',
      probe: {url: 'https://example.com/health', expectedCodes: [200]},
    },
    {name: 'onboarding', type: 'process'}, // issue-tracked only
  ],
  incidents: {statusLabel: 'status', maintenanceLabels: ['maintenance']},
  site: {title: 'System Status'},
};
`;

async function cmdInit(options: CliOptions): Promise<number> {
  const existing = findConfigFile(options.workdir);
  if (existing) {
    console.error(`refusing to scaffold: config already exists at ${existing}`);
    return 1;
  }
  const target = path.join(options.workdir, 'stentorosaur.config.js');
  fs.writeFileSync(target, CONFIG_TEMPLATE);
  console.log(`wrote ${target}`);
  console.log('\nNext steps:');
  console.log('  1. Fill in owner/repo/entities.');
  console.log("  2. Create the data branch: git switch --orphan status-data && git commit --allow-empty -m init && git push -u origin status-data && git switch -");
  console.log('  3. Install the v1 workflow templates (templates/workflows/*-v1.yml).');
  console.log('  4. Serve the branch via GitHub Pages and set the plugin dataUrl (see templates/workflows/README.md).');
  return 0;
}

async function cmdDoctor(options: CliOptions): Promise<number> {
  let failures = 0;
  const ok = (label: string) => console.log(`  ✓ ${label}`);
  const bad = (label: string) => {
    failures++;
    console.error(`  ✗ ${label}`);
  };

  let config: StentorosaurConfig;
  try {
    config = await loadConfig(options.config);
    ok('config parses');
  } catch (error) {
    bad(`config: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  try {
    assertUniqueSlugs(config.entities.map(e => e.name));
    ok('entity slugs are unique');
  } catch (error) {
    bad(String(error instanceof Error ? error.message : error));
  }

  const probed = config.entities.filter(e => e.probe).length;
  ok(`${config.entities.length} entities (${probed} probed, ${config.entities.length - probed} issue-tracked only)`);

  // Data plane: summary reachable and fresh?
  const summaryUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.dataBranch}/status/v1/summary.json`;
  try {
    const response = await fetch(summaryUrl, {headers: {accept: 'application/json'}});
    if (response.status === 404) {
      bad(`no summary.json on the '${config.dataBranch}' branch yet (probe not run, or private repo — private repos use the build-time snapshot only, ADR-005 §9)`);
    } else if (!response.ok) {
      bad(`summary fetch: HTTP ${response.status}`);
    } else {
      const summary = parseSummary(JSON.parse(await response.text()));
      ok(`summary.json parses (schemaVersion ${summary.schemaVersion})`);
      const ageMinutes = (Date.now() - Date.parse(summary.generatedAt)) / 60_000;
      if (ageMinutes > 60) {
        // WARNING, not failure (Council PR #89 r=1): a paused probe
        // shouldn't flap CI that runs doctor.
        console.warn(`  ⚠ summary is ${Math.round(ageMinutes)} min old — is the probe workflow running?`);
      } else {
        ok(`summary is fresh (${Math.round(ageMinutes)} min old)`);
      }
    }
  } catch (error) {
    bad(`data plane unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(failures === 0 ? '\ndoctor: all checks passed' : `\ndoctor: ${failures} problem(s) found`);
  return failures === 0 ? 0 : 1;
}

async function withDataBranch(
  options: CliOptions,
  config: StentorosaurConfig,
  commitMessage: string,
  writeInputs: (workdir: string, generatedAt: string) => Promise<void>
): Promise<void> {
  // ONE clock read per command run, threaded into writeInputs so every
  // file a command touches carries the same timestamp; retries
  // regenerate with it too (Council PR #89 r=1, r=3).
  const generatedAt = new Date().toISOString();
  const branch = options.branch ?? config.dataBranch;
  if (options.push) {
    await pushWithRegenerateRetry({
      workdir: options.workdir,
      branch,
      commitMessage,
      writeInputs: dir => writeInputs(dir, generatedAt),
      regenerate: async dir => regenerateDerived(dir, regenOptions(config, generatedAt)),
    });
  } else {
    await writeInputs(options.workdir, generatedAt);
    // regenerateDerived is synchronous (returns void) — all writes
    // complete before it returns.
    regenerateDerived(options.workdir, regenOptions(config, generatedAt));
  }
}

/**
 * Group once: one entity-detail write per entity, one archive append
 * per reading (Council PR #89 r=2: a per-reading filter was O(n²) and
 * rewrote each entity file repeatedly). Shared by probe and ingest.
 */
function writeReadings(dir: string, readings: CompactReading[], generatedAt: string): void {
  const bySvc = new Map<string, CompactReading[]>();
  for (const reading of readings) {
    appendArchive(dir, reading);
    const list = bySvc.get(reading.svc);
    if (list) {
      list.push(reading);
    } else {
      bySvc.set(reading.svc, [reading]);
    }
  }
  for (const [svc, svcReadings] of bySvc) {
    writeEntityDetail(dir, svc, svcReadings, generatedAt);
  }
}

async function cmdProbe(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  assertUniqueSlugs(config.entities.map(e => e.name));
  const targets: CheckTarget[] = config.entities
    .filter(e => e.probe)
    .map(e => ({system: e.name, ...e.probe!}));
  if (targets.length === 0) {
    console.error('no probed entities in config');
    return 1;
  }
  const readings = await runChecks(targets);

  await withDataBranch(options, config, `probe: ${readings.length} checks`, async (dir, generatedAt) => {
    writeReadings(dir, readings, generatedAt);
  });
  for (const reading of readings) {
    console.log(`  ${reading.state === 'up' ? '✓' : '✗'} ${reading.svc}: ${reading.state} (${reading.code} in ${reading.lat}ms)`);
  }
  return 0;
}

async function cmdUpdateIncidents(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  if (!process.env.GITHUB_TOKEN) {
    // Unauthenticated works for PUBLIC repos (60 req/hr); private repos
    // and busy CI need the token. Loud but not fatal.
    console.warn('⚠ GITHUB_TOKEN not set — using unauthenticated GitHub API (public repos only, 60 req/hr)');
  }
  const issues = await fetchStatusIssues({
    owner: config.owner,
    repo: config.repo,
    statusLabel: config.incidents.statusLabel,
    maintenanceLabels: config.incidents.maintenanceLabels,
    token: process.env.GITHUB_TOKEN,
  });

  let counts = {incidents: 0, maintenance: 0, skipped: 0};
  await withDataBranch(options, config, `issues: sync ${issues.length} issues`, async (dir, generatedAt) => {
    counts = writeIssueInputs(dir, issues, {
      entities: config.entities,
      maintenanceLabels: config.incidents.maintenanceLabels,
      labelScheme: config.labelScheme,
      now: new Date(generatedAt),
    });
  });
  console.log(`synced ${counts.incidents} incidents, ${counts.maintenance} maintenance windows (${counts.skipped} skipped)`);
  return 0;
}

async function cmdRegenerate(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  await withDataBranch(options, config, 'regenerate: re-render from raw provenance (§7)', async (dir, generatedAt) => {
    const counts = reRenderFromRaw(dir, new Date(generatedAt));
    console.log(`re-rendered ${counts.incidents} incident and ${counts.maintenance} maintenance bodies from raw/`);
  });
  return 0;
}

/**
 * Receive a repository_dispatch probe payload (ADR-005 §6, the Worker
 * trust model; ticket #76): validate against the core schema BEFORE any
 * write — a malformed payload exits 1 without touching the data branch.
 */
async function cmdIngest(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  if (!options.payload) {
    console.error('ingest requires --payload <file> (the dispatch client_payload JSON)');
    return 1;
  }
  let payload;
  try {
    payload = parseProbeDispatch(JSON.parse(fs.readFileSync(options.payload, 'utf8')));
  } catch (error) {
    console.error(
      `rejecting dispatch payload — nothing written: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }

  // Readings must belong to configured entities; unknown svcs are the
  // #62 ghost shape and a dispatcher bug — reject the whole payload
  // rather than archive unvetted names from an external sender.
  const configured = new Set(config.entities.map(e => e.name));
  const unknown = [...new Set(payload.readings.map(r => r.svc))].filter(svc => !configured.has(svc));
  if (unknown.length > 0) {
    console.error(`rejecting dispatch payload — unknown entities: ${unknown.join(', ')}`);
    return 1;
  }

  await withDataBranch(
    options,
    config,
    `probe(${payload.source}): ${payload.readings.length} dispatched readings`,
    async (dir, generatedAt) => {
      writeReadings(dir, payload.readings, generatedAt);
    }
  );
  console.log(`ingested ${payload.readings.length} readings from '${payload.source}'`);
  return 0;
}

/**
 * .monitorrc.json systems → stentorosaur.config.js scaffold (ADR-005
 * Migration Phase 1: config conversion half of `stentorosaur migrate`).
 * Owner/repo aren't recorded in .monitorrc.json, so they land as
 * placeholders the user must fill in before the data migration runs.
 */
function monitorrcToConfigSource(monitorrcPath: string): string {
  const rc = JSON.parse(fs.readFileSync(monitorrcPath, 'utf8')) as {
    systems?: Array<{
      system?: string;
      url?: string;
      method?: string;
      timeout?: number;
      expectedCodes?: number[];
      maxResponseTime?: number;
    }>;
  };
  const entities = (rc.systems ?? [])
    .filter(s => s.system)
    .map(s => ({
      name: s.system!,
      type: 'system' as const,
      ...(s.url
        ? {
            probe: {
              url: s.url,
              ...(s.method && s.method !== 'GET' ? {method: s.method} : {}),
              ...(s.timeout ? {timeout: s.timeout} : {}),
              ...(s.expectedCodes ? {expectedCodes: s.expectedCodes} : {}),
              ...(s.maxResponseTime ? {maxResponseTime: s.maxResponseTime} : {}),
            },
          }
        : {}),
    }));
  const config = {
    owner: 'OWNER',
    repo: 'REPO',
    dataBranch: 'status-data',
    entities,
    site: {title: 'System Status'},
  };
  return (
    '// Migrated from .monitorrc.json by `stentorosaur migrate`.\n' +
    '// FILL IN owner/repo before running the data migration.\n\n' +
    `/** @type {import('@stentorosaur/core').StentorosaurConfigInput} */\n` +
    `module.exports = ${JSON.stringify(config, null, 2)};\n`
  );
}

async function cmdMigrate(options: CliOptions): Promise<number> {
  const legacyDir = path.resolve(options.from);

  // Config half first: no stentorosaur config yet + a .monitorrc.json
  // present → convert it, then stop so the user fills in owner/repo.
  if (!findConfigFile(options.workdir)) {
    const monitorrc = path.join(path.dirname(legacyDir), '.monitorrc.json');
    const fallback = path.join(options.workdir, '.monitorrc.json');
    const rcPath = fs.existsSync(monitorrc) ? monitorrc : fs.existsSync(fallback) ? fallback : null;
    if (rcPath) {
      const target = path.join(options.workdir, 'stentorosaur.config.js');
      fs.writeFileSync(target, monitorrcToConfigSource(rcPath));
      console.log(`converted ${rcPath} → ${target}`);
      console.log('Fill in owner/repo, then re-run `stentorosaur migrate` for the data migration.');
      return 1;
    }
    console.error("no stentorosaur config and no .monitorrc.json found — run 'stentorosaur init' first");
    return 1;
  }

  const config = await loadConfig(options.config);
  if (!fs.existsSync(legacyDir)) {
    console.error(`legacy status-data directory not found: ${legacyDir} (use --from <dir>)`);
    return 1;
  }

  const migrateOpts = {
    legacyDir,
    entities: config.entities.map(({name, type, displayName}) => ({
      name,
      type,
      ...(displayName ? {displayName} : {}),
    })),
    siteTitle: config.site.title,
    siteUrl: config.site.url ?? `https://github.com/${config.owner}/${config.repo}`,
    onWarn: (message: string) => console.warn(`  ⚠ ${message}`),
  };

  if (options.dryRun) {
    const plan = planMigration({...migrateOpts, targetDir: options.workdir, generatedAt: new Date().toISOString()});
    const r = plan.report;
    console.log(`dry run — nothing written. Plan from ${legacyDir}:`);
    console.log(`  sources: ${r.sources.join(', ') || '(none found)'}`);
    console.log(`  ${r.readingsMigrated} readings across ${plan.days.size} days (${r.synthesizedDays} days synthesized from daily-summary.json)`);
    if (r.corruptLines > 0) console.log(`  ${r.corruptLines} corrupt lines will be skipped`);
    if (r.ghostEntities.length > 0)
      console.log(`  ghost entities in data but not config (archived, not summarized): ${r.ghostEntities.join(', ')}`);
    console.log(`  would write ${plan.archiveFiles.length} archive files + ${plan.entityFiles.length} entity details + summary.json:`);
    for (const f of [...plan.archiveFiles, ...plan.entityFiles]) console.log(`    ${f}`);
    return 0;
  }

  let report: MigrationReport | null = null;
  await withDataBranch(options, config, 'migrate: legacy status-data → status/v1', async (dir, generatedAt) => {
    report = migrateHistoricalData({...migrateOpts, targetDir: dir, generatedAt});
  });
  if (report) {
    const r: MigrationReport = report;
    console.log(`migrated ${r.readingsMigrated} readings (${r.synthesizedDays} days synthesized, ${r.corruptLines} corrupt lines skipped)`);
    if (r.ghostEntities.length > 0)
      console.log(`ghost entities preserved in archives only: ${r.ghostEntities.join(', ')}`);
  }
  console.log('legacy files were not modified — remove status-data/ after verifying the site renders.');
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    const {command, options} = parseArgs(argv);
    switch (command) {
      case 'init':
        return await cmdInit(options);
      case 'doctor':
        return await cmdDoctor(options);
      case 'probe':
        return await cmdProbe(options);
      case 'update-incidents':
        return await cmdUpdateIncidents(options);
      case 'regenerate':
        return await cmdRegenerate(options);
      case 'migrate':
        return await cmdMigrate(options);
      case 'ingest':
        return await cmdIngest(options);
      default:
        console.log('usage: stentorosaur <init|doctor|probe|update-incidents|regenerate|migrate|ingest> [--config <file-or-dir>] [--workdir <dir>] [--branch <name>] [--no-push] [--from <legacy-dir>] [--dry-run] [--payload <file>]');
        return command === 'help' ? 0 : 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
