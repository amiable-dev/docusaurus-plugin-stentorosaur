/**
 * Pipeline runner for the fixture harness (ADR-005 Phase 0, ticket #66).
 *
 * Runs the REAL pipeline end-to-end before Playwright asserts on the DOM:
 *   1. start mock HTTP endpoints (alpha=200, beta=500)
 *   2. run scripts/monitor.js twice against them (real checks, real archives)
 *   3. seed 'ghost' readings into current.json — a system with data but no
 *      config entry, the issue #62 shape that must NOT render
 *   4. docusaurus build fixtures/site (real plugin, committed-data path)
 *
 * Invoked as the pre-step of `npm run test:e2e` (NOT as Playwright
 * globalSetup: the webServer is started before globalSetup, so the build
 * must already exist by the time Playwright runs).
 */
import {execFile, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {startMockServer} from './mock-server.mjs';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'fixtures', 'site');
const DATA = path.join(SITE, 'status-data');
const MONITOR = path.join(
  ROOT,
  'packages',
  'docusaurus-plugin-stentorosaur',
  'scripts',
  'monitor.js'
);

async function runPipeline() {
  fs.rmSync(DATA, {recursive: true, force: true});
  fs.rmSync(path.join(SITE, 'build'), {recursive: true, force: true});

  const server = await startMockServer(39990);
  try {
    for (let i = 0; i < 2; i++) {
      // Async spawn — execFileSync would block THIS process's event loop,
      // starving the mock server and timing every check out to 'down'.
      const {stdout, stderr} = await execFileAsync(
        'node',
        [MONITOR, '--config', path.join(SITE, '.monitorrc.json'), '--output-dir', DATA],
        {cwd: SITE}
      );
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  // The mock returns 200 for alpha and 500 for beta: the harness must see
  // BOTH states, otherwise it cannot catch up/down regressions.
  const seeded = JSON.parse(
    fs.readFileSync(path.join(DATA, 'current.json'), 'utf8')
  );
  const stateOf = svc =>
    seeded.filter(r => r.svc === svc).map(r => r.state);
  if (!stateOf('alpha').every(s => s === 'up')) {
    throw new Error(`pipeline sanity: alpha should be up, got ${stateOf('alpha')}`);
  }
  if (!stateOf('beta').every(s => s === 'down')) {
    throw new Error(`pipeline sanity: beta should be down, got ${stateOf('beta')}`);
  }

  // Seed the #62 shape: readings for a system that is NOT configured.
  const currentPath = path.join(DATA, 'current.json');
  const readings = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new Error('monitor.js produced no readings — pipeline broken before seed step');
  }
  const now = Date.now();
  readings.push(
    {t: now - 60_000, svc: 'ghost', state: 'up', code: 200, lat: 42},
    {t: now, svc: 'ghost', state: 'up', code: 200, lat: 43}
  );
  fs.writeFileSync(currentPath, JSON.stringify(readings));

  // Build the fixture site with the real plugin (committed-data path).
  execFileSync('npx', ['docusaurus', 'build', SITE, '--out-dir', path.join(SITE, 'build')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {...process.env, CI: process.env.CI ?? ''},
  });
}

runPipeline().catch(err => {
  console.error('[e2e] pipeline failed:', err);
  process.exit(1);
});
