/**
 * Pipeline runner for the fixture harness (ADR-005; tickets #66/#77).
 *
 * Runs the REAL v1 pipeline end-to-end before Playwright asserts on the
 * DOM — pure status/v1 since the #77 cutover:
 *   1. start mock HTTP endpoints (alpha=200, beta=500)
 *   2. run the probe engine twice against them (real checks)
 *   3. write archives + entity details, seed 'ghost' readings into the
 *      archives — a system with data but no config entry, the issue #62
 *      shape that must NOT render
 *   4. regenerate status/v1 (summary.json + atom) via the probe lib
 *   5. docusaurus build fixtures/site (real plugin, local-snapshot path)
 *
 * Invoked as the pre-step of `npm run test:e2e` (NOT as Playwright
 * globalSetup: the webServer is started before globalSetup, so the build
 * must already exist by the time Playwright runs).
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startMockServer} from './mock-server.mjs';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'fixtures', 'site');
const DATA = path.join(SITE, 'status-data');
const PROBE_LIB = path.join(ROOT, 'packages', 'probe', 'lib');

async function runPipeline() {
  fs.rmSync(DATA, {recursive: true, force: true});
  fs.rmSync(path.join(SITE, 'build'), {recursive: true, force: true});

  const {runChecks} = require(path.join(PROBE_LIB, 'check.js'));
  const {appendArchive, writeEntityDetail} = require(path.join(PROBE_LIB, 'files.js'));
  const {regenerateDerived} = require(path.join(PROBE_LIB, 'regenerate.js'));

  const targets = [
    {system: 'alpha', url: 'http://127.0.0.1:39990/alpha', expectedCodes: [200]},
    {system: 'beta', url: 'http://127.0.0.1:39990/beta', expectedCodes: [200]},
  ];

  // 1–2. Real checks against real HTTP endpoints, twice (two data points).
  const readings = [];
  const server = await startMockServer(39990);
  try {
    for (let i = 0; i < 2; i++) {
      const batch = await runChecks(targets, {now: Date.now() - (1 - i) * 60_000});
      readings.push(...batch);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  if (readings.length === 0) {
    throw new Error('probe produced no readings — pipeline broken before write step');
  }
  // The mock returns 200 for alpha and 500 for beta: the harness must see
  // BOTH states, otherwise it cannot catch up/down regressions.
  const stateOf = svc => readings.filter(r => r.svc === svc).map(r => r.state);
  if (!stateOf('alpha').every(s => s === 'up')) {
    throw new Error(`pipeline sanity: alpha should be up, got ${stateOf('alpha')}`);
  }
  if (!stateOf('beta').every(s => s === 'down')) {
    throw new Error(`pipeline sanity: beta should be down, got ${stateOf('beta')}`);
  }

  // 3. Seed the #62 shape: archived readings for a system that is NOT
  // configured. It must appear nowhere in the rendered page.
  const now = Date.now();
  const ghostReadings = [
    {t: now - 60_000, svc: 'ghost', state: 'up', code: 200, lat: 42},
    {t: now, svc: 'ghost', state: 'up', code: 200, lat: 43},
  ];

  const entities = [
    {name: 'alpha', type: 'system'},
    {name: 'beta', type: 'system'},
  ];
  for (const reading of [...readings, ...ghostReadings]) {
    appendArchive(DATA, reading);
  }
  const generatedAt = new Date().toISOString();
  for (const entity of entities) {
    writeEntityDetail(
      DATA,
      entity.name,
      readings.filter(r => r.svc === entity.name),
      generatedAt
    );
  }

  // 4. The real §5 regenerate — summary.json + incidents.atom.
  regenerateDerived(DATA, {
    generatedAt,
    generatedBy: 'e2e-pipeline',
    entities,
    siteTitle: 'Fixture Status',
    siteUrl: 'http://127.0.0.1:3999',
  });

  // 5. Install the plugin the way a CONSUMER does: packed tarballs into
  // the fixture's own node_modules. The workspace symlink's real path
  // escapes webpack's node_modules babel-exclusion, double-transpiles
  // the CJS theme, and breaks hydration ('exports is not defined') —
  // fixture-only, but it hid every client-side behavior from e2e.
  // Tarball install also makes e2e catch packaging bugs (missing
  // `files` entries) that a symlink never would.
  const PACK_DIR = path.join(SITE, '.packed');
  fs.rmSync(PACK_DIR, {recursive: true, force: true});
  fs.mkdirSync(PACK_DIR, {recursive: true});
  const PACKED = [
    ['packages/core', '@stentorosaur/core'],
    ['packages/docusaurus-plugin-stentorosaur', '@amiable-dev/docusaurus-plugin-stentorosaur'],
  ];
  for (const [pkgDir, pkgName] of PACKED) {
    const tarball = execFileSync(
      'npm',
      ['pack', path.join(ROOT, pkgDir), '--pack-destination', PACK_DIR],
      {cwd: ROOT, encoding: 'utf8'}
    )
      .trim()
      .split('\n')
      .pop();
    const dest = path.join(SITE, 'node_modules', pkgName);
    fs.rmSync(dest, {recursive: true, force: true});
    fs.mkdirSync(dest, {recursive: true});
    // npm tarballs root everything under package/ — strip it. Their
    // remaining deps resolve upward to the workspace root install.
    execFileSync('tar', ['-xzf', path.join(PACK_DIR, tarball), '--strip-components=1', '-C', dest]);
  }

  // 6. Build the fixture site with the real (packed) plugin. cwd MUST
  // be the site dir: Docusaurus resolves browserslist from cwd, and
  // without it babel targets ES5 and injects ESM regenerator helpers
  // into the CJS theme — killing hydration.
  execFileSync('npx', ['docusaurus', 'build', '.', '--out-dir', path.join(SITE, 'build')], {
    cwd: SITE,
    stdio: 'inherit',
    env: {...process.env, CI: process.env.CI ?? ''},
  });
}

runPipeline().catch(err => {
  console.error('[e2e] pipeline failed:', err);
  process.exit(1);
});
