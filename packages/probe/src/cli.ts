/**
 * The unified `stentorosaur` CLI (ADR-005 §11; epic #63 ticket #74).
 * Replaces the nine legacy bin scripts at the #77 cutover.
 *
 *   stentorosaur init               scaffold stentorosaur.config.js
 *   stentorosaur doctor             validate config + data plane health
 *   stentorosaur probe              run checks, write + push (§5 retry)
 *   stentorosaur update-incidents   sync issues, write + push (§5 retry)
 *   stentorosaur regenerate         §7 re-render from raw/ + rebuild
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
import {parseSummary} from '@stentorosaur/core';
import type {StentorosaurConfig} from '@stentorosaur/core';

interface CliOptions {
  config: string;
  workdir: string;
  branch?: string;
  push: boolean;
}

function parseArgs(argv: string[]): {command: string; options: CliOptions} {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = {config: process.cwd(), workdir: process.cwd(), push: true};
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
  writeInputs: (workdir: string) => Promise<void>
): Promise<void> {
  // ONE clock read per command run; retries regenerate with the same
  // timestamp (Council PR #89 r=1).
  const generatedAt = new Date().toISOString();
  const branch = options.branch ?? config.dataBranch;
  if (options.push) {
    await pushWithRegenerateRetry({
      workdir: options.workdir,
      branch,
      commitMessage,
      writeInputs,
      regenerate: async dir => regenerateDerived(dir, regenOptions(config, generatedAt)),
    });
  } else {
    await writeInputs(options.workdir);
    regenerateDerived(options.workdir, regenOptions(config, generatedAt));
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
  const generatedAt = new Date().toISOString();

  await withDataBranch(options, config, `probe: ${readings.length} checks`, async dir => {
    for (const reading of readings) {
      appendArchive(dir, reading);
      const existing = readings.filter(r => r.svc === reading.svc);
      writeEntityDetail(dir, reading.svc, existing, generatedAt);
    }
  });
  for (const reading of readings) {
    console.log(`  ${reading.state === 'up' ? '✓' : '✗'} ${reading.svc}: ${reading.state} (${reading.code} in ${reading.lat}ms)`);
  }
  return 0;
}

async function cmdUpdateIncidents(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  const issues = await fetchStatusIssues({
    owner: config.owner,
    repo: config.repo,
    statusLabel: config.incidents.statusLabel,
    maintenanceLabels: config.incidents.maintenanceLabels,
    token: process.env.GITHUB_TOKEN,
  });
  const now = new Date();

  let counts = {incidents: 0, maintenance: 0, skipped: 0};
  await withDataBranch(options, config, `issues: sync ${issues.length} issues`, async dir => {
    counts = writeIssueInputs(dir, issues, {
      entities: config.entities,
      maintenanceLabels: config.incidents.maintenanceLabels,
      labelScheme: config.labelScheme,
      now,
    });
  });
  console.log(`synced ${counts.incidents} incidents, ${counts.maintenance} maintenance windows (${counts.skipped} skipped)`);
  return 0;
}

async function cmdRegenerate(options: CliOptions): Promise<number> {
  const config = await loadConfig(options.config);
  const now = new Date();
  await withDataBranch(options, config, 'regenerate: re-render from raw provenance (§7)', async dir => {
    const counts = reRenderFromRaw(dir, now);
    console.log(`re-rendered ${counts.incidents} incident and ${counts.maintenance} maintenance bodies from raw/`);
  });
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
      default:
        console.log('usage: stentorosaur <init|doctor|probe|update-incidents|regenerate> [--config <path>] [--workdir <dir>] [--branch <name>] [--no-push]');
        return command === 'help' ? 0 : 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
