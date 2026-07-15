/**
 * Pipeline runner for the fixture harness (ADR-005; tickets #66/#77;
 * ADR-006 Profile C leg: ticket #103).
 *
 * Runs the REAL v1 pipeline end-to-end before Playwright asserts on the
 * DOM. Two profiles, selected by PROFILE (default 'git'):
 *
 * git — the ADR-005 data-branch shape:
 *   1. start mock HTTP endpoints (alpha=200, beta=500)
 *   2. run the probe engine twice against them (real checks)
 *   3. write archives + entity details, seed 'ghost' readings into the
 *      archives — a system with data but no config entry, the issue #62
 *      shape that must NOT render
 *   4. regenerate status/v1 (summary.json + atom) via the probe lib
 *   5. docusaurus build fixtures/site (real plugin, local-snapshot path)
 *
 * r2 — the ADR-006 Profile C shape (zero-Actions):
 *   1. start the same mock endpoints
 *   2. run the REAL Worker probe cycle (runWorkerProbeR2 → immutable
 *      batches → §3-ordered regenerate) against an R2 bucket double,
 *      twice; seed the ghost batch; seed a closed day and run the REAL
 *      compaction pass over it
 *   3. serve the bucket through the REAL serveStatusV1 route over HTTP
 *      (e2e/serve-r2.mjs) and smoke the §4 protocol (ETag, 304, 404)
 *   4. docusaurus build fixtures/site with dataUrl pointing at the
 *      live serving route (build-time fetch + client SWR both hit it)
 *
 * Invoked as the pre-step of `npm run test:e2e[:r2]` (NOT as Playwright
 * globalSetup: the webServer is started before globalSetup, so the build
 * must already exist by the time Playwright runs).
 */
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startMockServer} from './mock-server.mjs';
import {FileBackedR2Bucket} from './r2-bucket.mjs';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'fixtures', 'site');
const DATA = path.join(SITE, 'status-data');
const PROBE_LIB = path.join(ROOT, 'packages', 'probe', 'lib');
const PROFILE = process.env.PROFILE ?? 'git';
const R2_PORT = 39991;
const R2_STATE = path.join(SITE, '.r2-bucket.json');
const R2_DATA_URL = `http://127.0.0.1:${R2_PORT}/status/v1/summary.json`;

const TARGETS = [
  {system: 'alpha', url: 'http://127.0.0.1:39990/alpha', expectedCodes: [200]},
  {system: 'beta', url: 'http://127.0.0.1:39990/beta', expectedCodes: [200]},
];
const ENTITIES = [
  {name: 'alpha', type: 'system'},
  {name: 'beta', type: 'system'},
];

/** The mock returns 200 for alpha and 500 for beta: the harness must
 * see BOTH states, otherwise it cannot catch up/down regressions. */
function assertProbeSanity(readings) {
  if (readings.length === 0) {
    throw new Error('probe produced no readings — pipeline broken before write step');
  }
  const stateOf = svc => readings.filter(r => r.svc === svc).map(r => r.state);
  if (!stateOf('alpha').every(s => s === 'up')) {
    throw new Error(`pipeline sanity: alpha should be up, got ${stateOf('alpha')}`);
  }
  if (!stateOf('beta').every(s => s === 'down')) {
    throw new Error(`pipeline sanity: beta should be down, got ${stateOf('beta')}`);
  }
}

/** Install the plugin the way a CONSUMER does: packed tarballs into
 * the fixture's own node_modules. The workspace symlink's real path
 * escapes webpack's node_modules babel-exclusion, double-transpiles
 * the CJS theme, and breaks hydration ('exports is not defined') —
 * fixture-only, but it hid every client-side behavior from e2e.
 * Tarball install also makes e2e catch packaging bugs (missing
 * `files` entries) that a symlink never would. */
function packPluginIntoFixture() {
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
}

/** cwd MUST be the site dir: Docusaurus resolves browserslist from
 * cwd, and without it babel targets ES5 and injects ESM regenerator
 * helpers into the CJS theme — killing hydration. */
function buildFixtureSite(extraEnv = {}) {
  execFileSync('npx', ['docusaurus', 'build', '.', '--out-dir', path.join(SITE, 'build')], {
    cwd: SITE,
    stdio: 'inherit',
    env: {...process.env, CI: process.env.CI ?? '', ...extraEnv},
  });
}

async function runGitPipeline() {
  const {runChecks} = require(path.join(PROBE_LIB, 'check.js'));
  const {appendArchive, writeEntityDetail} = require(path.join(PROBE_LIB, 'files.js'));
  const {regenerateDerived} = require(path.join(PROBE_LIB, 'regenerate.js'));

  // 1–2. Real checks against real HTTP endpoints, twice (two data points).
  const readings = [];
  const server = await startMockServer(39990);
  try {
    for (let i = 0; i < 2; i++) {
      const batch = await runChecks(TARGETS, {now: Date.now() - (1 - i) * 60_000});
      readings.push(...batch);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assertProbeSanity(readings);

  // 3. Seed the #62 shape: archived readings for a system that is NOT
  // configured. It must appear nowhere in the rendered page.
  const now = Date.now();
  const ghostReadings = [
    {t: now - 60_000, svc: 'ghost', state: 'up', code: 200, lat: 42},
    {t: now, svc: 'ghost', state: 'up', code: 200, lat: 43},
  ];
  for (const reading of [...readings, ...ghostReadings]) {
    appendArchive(DATA, reading);
  }
  const generatedAt = new Date().toISOString();
  for (const entity of ENTITIES) {
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
    entities: ENTITIES,
    siteTitle: 'Fixture Status',
    siteUrl: 'http://127.0.0.1:3999',
  });

  packPluginIntoFixture();
  buildFixtureSite();
}

async function runR2Pipeline() {
  const {runWorkerProbeR2, runWorkerCompactionR2, BindingObjectStore} = require(
    path.join(PROBE_LIB, 'worker.js')
  );
  const {writeReadingsBatch} = require(path.join(PROBE_LIB, 'r2-plane.js'));

  const bucket = new FileBackedR2Bucket();
  const store = new BindingObjectStore(bucket);
  const env = {
    TARGETS: JSON.stringify(TARGETS),
    STATUS_BUCKET: bucket,
    SITE_TITLE: 'Fixture Status',
    SITE_URL: 'http://127.0.0.1:3999',
  };

  // Ghost batch (#62 shape) + a CLOSED day for the compaction pass.
  const now = Date.now();
  await writeReadingsBatch(
    store,
    [
      {t: now - 60_000, svc: 'ghost', state: 'up', code: 200, lat: 42},
      {t: now, svc: 'ghost', state: 'up', code: 200, lat: 43},
    ],
    new Date(now).toISOString(),
    'ghost'
  );
  const closedDayMs = now - 3 * 24 * 60 * 60 * 1000;
  const closedIso = new Date(closedDayMs).toISOString();
  await writeReadingsBatch(
    store,
    [
      {t: closedDayMs, svc: 'alpha', state: 'up', code: 200, lat: 21},
      {t: closedDayMs + 300_000, svc: 'alpha', state: 'up', code: 200, lat: 22},
    ],
    closedIso,
    'old1'
  );

  // The REAL compaction pass (ticket #101 module, as the daily cron runs it).
  const compaction = await runWorkerCompactionR2(env);
  const closedDate = closedIso.split('T')[0];
  if (!compaction.archivedDays.includes(closedDate)) {
    throw new Error(`compaction did not archive ${closedDate}: ${JSON.stringify(compaction)}`);
  }
  const [y, m] = closedDate.split('-');
  if (!(await store.get(`status/v1/archives/${y}/${m}/history-${closedDate}.jsonl`))) {
    throw new Error('compaction reported success but the archive object is missing');
  }
  if (!(await store.get('status/v1/compaction-state.json'))) {
    throw new Error('compaction-state.json missing after the compaction pass');
  }

  // The REAL Worker probe cycle, twice (two data points per entity).
  const readings = [];
  const server = await startMockServer(39990);
  try {
    for (let i = 0; i < 2; i++) {
      const result = await runWorkerProbeR2(env, {now: Date.now() - (1 - i) * 60_000});
      readings.push(...result.readings);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assertProbeSanity(readings);

  // Serving route over real HTTP: the §4 protocol smoke, then the site
  // build fetches its data THROUGH the route (dataUrl).
  bucket.saveTo(R2_STATE);
  const child = spawn('node', [path.join(ROOT, 'e2e', 'serve-r2.mjs'), R2_STATE, String(R2_PORT)], {
    stdio: 'inherit',
  });
  try {
    // Wait for the server, then smoke ETag/304/404 — the same contract
    // the unit tests pin, but over a real socket.
    let response = null;
    for (let attempt = 0; attempt < 50 && !response; attempt++) {
      try {
        response = await fetch(R2_DATA_URL);
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (!response || response.status !== 200) {
      throw new Error(`serving route: expected 200 for summary, got ${response?.status}`);
    }
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('serving route: missing ETag');
    const conditional = await fetch(R2_DATA_URL, {headers: {'if-none-match': etag}});
    if (conditional.status !== 304) {
      throw new Error(`serving route: expected 304 on If-None-Match, got ${conditional.status}`);
    }
    const outside = await fetch(`http://127.0.0.1:${R2_PORT}/secrets.txt`);
    if (outside.status !== 404) {
      throw new Error(`serving route: expected 404 outside status/v1, got ${outside.status}`);
    }

    packPluginIntoFixture();
    buildFixtureSite({STENTOROSAUR_E2E_DATA_URL: R2_DATA_URL});
  } finally {
    child.kill();
  }
}

async function runPipeline() {
  fs.rmSync(DATA, {recursive: true, force: true});
  fs.rmSync(path.join(SITE, 'build'), {recursive: true, force: true});
  fs.rmSync(R2_STATE, {force: true});
  // Webpack's persistent cache survives a tarball re-install and can
  // serve STALE plugin theme modules into the build (found on ticket
  // #103: an old chunk shipped after the component changed). The e2e
  // contract is "build what's packed" — clear both caches.
  fs.rmSync(path.join(SITE, '.docusaurus'), {recursive: true, force: true});
  fs.rmSync(path.join(SITE, 'node_modules', '.cache'), {recursive: true, force: true});

  if (PROFILE === 'r2') {
    console.log('[e2e] PROFILE=r2 — ADR-006 Profile C leg');
    await runR2Pipeline();
  } else {
    await runGitPipeline();
  }
}

runPipeline().catch(err => {
  console.error('[e2e] pipeline failed:', err);
  process.exit(1);
});
