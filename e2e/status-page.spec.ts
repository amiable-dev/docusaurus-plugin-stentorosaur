/**
 * Pipeline fixture test (ADR-005; tickets #66/#77).
 *
 * Asserts on the /status DOM of the fixture site after the REAL v1
 * pipeline ran: probe engine against a mock HTTP server → status/v1
 * files → docusaurus build → served build. Each assertion targets a bug
 * shape from the v0.21.x cluster:
 *   - ghost-system absence  → issue #62 (entity filtering, fixed twice)
 *   - data-plane presence   → v0.21.2 (postBuild copy omissions)
 *   - card content rendered → v0.21.1/.3 (option threading)
 */
import {expect, test} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SITE_DIR = path.resolve(__dirname, '..', 'fixtures', 'site');
const BUILD_DIR = path.join(SITE_DIR, 'build');

// Profile selection (ticket #103): the DOM invariants below are
// IDENTICAL for both profiles; only the data-plane publication
// assertions differ — git publishes a snapshot into the build
// (postBuild copy), r2 publishes through the live serveStatusV1 route.
const PROFILE = process.env.E2E_PROFILE ?? 'git';
const R2_BASE = 'http://127.0.0.1:39991';
const EXPECTED_DATA_URL =
  PROFILE === 'r2' ? `${R2_BASE}/status/v1/summary.json` : '/status-data/status/v1/summary.json';
/** Fetchable URL for a status/v1 file on the active profile. */
const v1Url = (rel: string) =>
  PROFILE === 'r2' ? `${R2_BASE}/status/v1/${rel}` : `/status-data/status/v1/${rel}`;

test.describe('status page renders pipeline output', () => {
  test('hydrates without page errors (client interactivity guard)', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/status');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('shows monitored systems from the v1 summary', async ({page}) => {
    await page.goto('/status');
    await expect(page.getByText('alpha', {exact: false}).first()).toBeVisible();
    await expect(page.getByText('beta', {exact: false}).first()).toBeVisible();
  });

  test('does NOT render systems absent from the config (issue #62)', async ({page}) => {
    // 'ghost' has readings in the archives but is not a configured
    // entity; v0.21.8 and earlier rendered it (#62 — fixed twice).
    // Scoped to visible main-content text (not raw HTML) so a class name
    // or script chunk containing 'ghost' can't false-positive.
    await page.goto('/status');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('ghost');
    // And the configured systems ARE in the same scope, proving the
    // negative assertion is looking at real content.
    await expect(page.locator('main')).toContainText('alpha');
  });

  test('renders the plugin footer with an injected version (no version.ts)', async ({page}) => {
    await page.goto('/status');
    await expect(
      page.getByText(/Docusaurus Stentorosaur Plugin v\d+\.\d+\.\d+/)
    ).toBeVisible();
  });

  test('down system is not reported as operational', async ({page}) => {
    await page.goto('/status');
    // beta's mock endpoint returns 500 on every check; the page must not
    // claim all systems operational.
    const banner = page.getByText(/all systems operational/i);
    await expect(banner).toHaveCount(0);
  });

  test('per-entity history page renders charts from v1 entity detail (v1.0.1)', async ({page}) => {
    await page.goto('/status/history/alpha');
    await page.waitForLoadState('networkidle');
    // The page fetches status/v1/entities/alpha.json client-side and
    // renders the chart layout — never the error state.
    await expect(page.getByText(/Error Loading Data/i)).toHaveCount(0);
    await expect(page.locator('main')).toContainText(/alpha/i);
  });

  test('renders an uptime bar per configured system (summary day tuples)', async ({page}) => {
    await page.goto('/status');
    await page.waitForLoadState('networkidle');
    const bars = page.locator('main [role="group"]');
    await expect(bars).toHaveCount(2);
  });
});

test.describe('the v1 data plane is published', () => {
  // git: postBuild copies the snapshot into the build (v0.21.2 shape).
  // r2: the serving route publishes the SAME contract over HTTP —
  // there is deliberately no snapshot in the build (ADR-006 §2).
  const v1Files = [
    'summary.json',
    'incidents.atom',
    'entities/alpha.json',
    'entities/beta.json',
  ];
  for (const rel of v1Files) {
    test(`the ${PROFILE} plane publishes status/v1/${rel}`, async ({request}) => {
      if (PROFILE === 'r2') {
        const res = await request.get(v1Url(rel));
        expect(res.status()).toBe(200);
      } else {
        expect(fs.existsSync(path.join(BUILD_DIR, 'status-data', 'status', 'v1', rel))).toBe(true);
      }
    });
  }

  test('entity details are filtered to configured entities (#62)', async ({request}) => {
    if (PROFILE === 'r2') {
      expect((await request.get(v1Url('entities/alpha.json'))).status()).toBe(200);
      expect((await request.get(v1Url('entities/beta.json'))).status()).toBe(200);
      expect((await request.get(v1Url('entities/ghost.json'))).status()).toBe(404);
    } else {
      const entitiesDir = path.join(BUILD_DIR, 'status-data', 'status', 'v1', 'entities');
      const files = fs.readdirSync(entitiesDir);
      expect(files).toContain('alpha.json');
      expect(files).toContain('beta.json');
      expect(files).not.toContain('ghost.json');
    }
  });

  test('legacy data files are gone from the build output (#77 cutover)', async () => {
    for (const legacy of [
      'status-data/current.json',
      'status-data/daily-summary.json',
      'status-data/systems',
    ]) {
      expect(fs.existsSync(path.join(BUILD_DIR, legacy))).toBe(false);
    }
  });
});

test.describe('status/v1 read path (ADR-005 §4)', () => {
  test('summary.json is served and schema-shaped', async ({request}) => {
    const res = await request.get(v1Url('summary.json'));
    expect(res.ok()).toBe(true);
    const summary = await res.json();
    expect(summary.schemaVersion).toBe(1);
    expect(summary.entities.map((e: {name: string}) => e.name).sort()).toEqual(['alpha', 'beta']);
    // ghost has readings in the archives but is NOT a configured entity —
    // it must never enter the v1 contract (#62, v1 edition).
    expect(JSON.stringify(summary)).not.toContain('ghost');
    // beta observed down from the mock's 500s
    const beta = summary.entities.find((e: {name: string}) => e.name === 'beta');
    expect(beta.status).toBe('down');
  });

  test('entity detail is served and fetchable by the drill-down path', async ({request}) => {
    const res = await request.get(v1Url('entities/alpha.json'));
    expect(res.ok()).toBe(true);
    const detail = await res.json();
    expect(detail.schemaVersion).toBe(1);
    expect(detail.readings.length).toBeGreaterThan(0);
    expect(detail.readings.every((r: {svc: string}) => r.svc === 'alpha')).toBe(true);
  });

  test('the build consumed the v1 path (route data carries the snapshot)', async () => {
    const statusJson = JSON.parse(
      fs.readFileSync(
        path.join(SITE_DIR, '.docusaurus', 'docusaurus-plugin-stentorosaur', 'status.json'),
        'utf8'
      )
    );
    expect(statusJson.v1Summary).toBeDefined();
    expect(statusJson.v1Summary.schemaVersion).toBe(1);
    expect(statusJson.dataUrl).toBe(EXPECTED_DATA_URL);
    const beta = statusJson.items.find((i: {name: string}) => i.name === 'beta');
    expect(beta.status).toBe('down');
    // v1 items carry decoded day rollups for the uptime bars.
    expect(beta.days.length).toBeGreaterThan(0);
  });
});
