/**
 * Golden-file test for the server-side aggregation pipeline (ADR-005
 * Migration Phase 0, ticket #65).
 *
 * The goldens under __tests__/golden/*.golden.json were captured from the
 * PRE-refactor implementation (loadContent + postBuild at main@86dfd1b).
 * The core extraction must reproduce them byte-for-byte: this test runs
 * the REAL plugin (unmocked fs) against a fixture current.json in a temp
 * site dir and compares the deterministic outputs.
 *
 * To regenerate (only when behavior change is INTENDED and reviewed):
 *   UPDATE_GOLDENS=1 npx jest __tests__/golden
 */

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import type {LoadContext} from '@docusaurus/types';
import pluginStatusPage from '../../src/index';
import type {PluginOptions} from '../../src/types';

const GOLDEN_DIR = path.join(__dirname);
const ITEMS_GOLDEN = path.join(GOLDEN_DIR, 'load-content-items.golden.json');
const SYSTEMS_GOLDEN = path.join(GOLDEN_DIR, 'post-build-systems.golden.json');

/**
 * Deterministic fixture readings exercising the edge cases the
 * aggregation must preserve:
 * - alpha: all up, varying latency (plain average)
 * - beta:  mixed up/down PLUS an 'up' reading with a non-2xx code (301),
 *          which must be EXCLUDED from response-time averages but count
 *          toward uptime
 * - gamma: all down (avg undefined / omitted)
 * - delta: single reading
 * Timestamps are fixed and out of order to exercise the sort.
 */
const T0 = Date.UTC(2026, 6, 1, 0, 0, 0); // 2026-07-01T00:00:00Z
const MIN = 60_000;
const FIXTURE_READINGS = [
  {t: T0 + 10 * MIN, svc: 'alpha', state: 'up', code: 200, lat: 120},
  {t: T0 + 0 * MIN, svc: 'alpha', state: 'up', code: 200, lat: 100},
  {t: T0 + 5 * MIN, svc: 'alpha', state: 'up', code: 204, lat: 110},

  {t: T0 + 0 * MIN, svc: 'beta', state: 'up', code: 200, lat: 50},
  {t: T0 + 5 * MIN, svc: 'beta', state: 'down', code: 500, lat: 0, err: 'HTTP 500'},
  {t: T0 + 10 * MIN, svc: 'beta', state: 'up', code: 301, lat: 400},
  {t: T0 + 15 * MIN, svc: 'beta', state: 'up', code: 200, lat: 70},

  {t: T0 + 0 * MIN, svc: 'gamma', state: 'down', code: 503, lat: 0, err: 'HTTP 503'},
  {t: T0 + 5 * MIN, svc: 'gamma', state: 'down', code: 0, lat: 0, err: 'timeout'},

  {t: T0 + 7 * MIN, svc: 'delta', state: 'up', code: 200, lat: 33},
];

const ENTITIES = [
  {name: 'alpha', type: 'system' as const},
  {name: 'beta', type: 'system' as const},
  {name: 'gamma', type: 'system' as const},
  {name: 'delta', type: 'system' as const},
];

async function runPipeline(): Promise<{items: unknown; systems: Record<string, unknown>}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stentorosaur-golden-'));
  try {
    const siteDir = path.join(tmp, 'site');
    const outDir = path.join(tmp, 'build');
    const generatedFilesDir = path.join(siteDir, '.docusaurus');
    await fs.ensureDir(path.join(siteDir, 'status-data'));
    await fs.writeJson(path.join(siteDir, 'status-data', 'current.json'), FIXTURE_READINGS);

    const context = {
      siteDir,
      generatedFilesDir,
      outDir,
      baseUrl: '/',
      siteConfig: {baseUrl: '/'} as any,
    } as LoadContext;

    const options: PluginOptions = {
      owner: 'golden-owner',
      repo: 'golden-repo',
      entities: ENTITIES,
      useDemoData: false,
      showServices: true,
      showIncidents: true,
    };

    const plugin = await pluginStatusPage(context, options);
    const content = await plugin.loadContent!();
    await (plugin as any).postBuild({outDir});

    const systems: Record<string, unknown> = {};
    for (const entity of ENTITIES) {
      systems[entity.name] = await fs.readJson(
        path.join(outDir, 'status-data', 'systems', `${entity.name}.json`)
      );
    }
    return {items: content.items, systems};
  } finally {
    await fs.remove(tmp);
  }
}

describe('server aggregation golden (pre-refactor behavior pinned)', () => {
  jest.setTimeout(30_000);

  it('loadContent items and postBuild system files match the goldens', async () => {
    const {items, systems} = await runPipeline();

    if (process.env.UPDATE_GOLDENS) {
      await fs.writeJson(ITEMS_GOLDEN, items, {spaces: 2});
      await fs.writeJson(SYSTEMS_GOLDEN, systems, {spaces: 2});
      // eslint-disable-next-line no-console
      console.warn('[golden] goldens rewritten — review the diff carefully');
      return;
    }

    expect(fs.existsSync(ITEMS_GOLDEN)).toBe(true);
    expect(fs.existsSync(SYSTEMS_GOLDEN)).toBe(true);
    // Byte-level comparison via canonical JSON stringification
    expect(JSON.stringify(items, null, 2)).toBe(
      JSON.stringify(await fs.readJson(ITEMS_GOLDEN), null, 2)
    );
    expect(JSON.stringify(systems, null, 2)).toBe(
      JSON.stringify(await fs.readJson(SYSTEMS_GOLDEN), null, 2)
    );
  });
});
