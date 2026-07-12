/**
 * Pipeline fixture test (ADR-005 Migration Phase 0, ticket #66).
 *
 * Asserts on the /status DOM of the fixture site after the REAL pipeline
 * ran: monitor.js against a mock HTTP server → status-data files →
 * docusaurus build → served build. Each assertion targets a bug shape
 * from the v0.21.x cluster:
 *   - ghost-system absence  → issue #62 (entity filtering, fixed twice)
 *   - data-file presence    → v0.21.2 (postBuild copy omissions)
 *   - card content rendered → v0.21.1/.3 (option threading)
 */
import {expect, test} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BUILD_DIR = path.resolve(__dirname, '..', 'fixtures', 'site', 'build');

test.describe('status page renders pipeline output', () => {
  test('shows monitored systems from current.json', async ({page}) => {
    await page.goto('/status');
    // Both configured systems render as cards
    await expect(page.getByText('alpha', {exact: false}).first()).toBeVisible();
    await expect(page.getByText('beta', {exact: false}).first()).toBeVisible();
  });

  test('does NOT render systems absent from .monitorrc.json (issue #62)', async ({page}) => {
    // 'ghost' has readings in current.json but is not a configured entity;
    // v0.21.8 and earlier rendered it (#62 — the bug fixed twice).
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
});

test.describe('postBuild copied the data plane (v0.21.2 regression shape)', () => {
  const dataFiles = [
    'status-data/status.json',
    'status-data/current.json',
    'status-data/daily-summary.json',
  ];
  for (const rel of dataFiles) {
    test(`build output contains ${rel}`, async () => {
      expect(fs.existsSync(path.join(BUILD_DIR, rel))).toBe(true);
    });
  }

  test('generated system files are filtered to configured entities (#62)', async () => {
    const systemsDir = path.join(BUILD_DIR, 'status-data', 'systems');
    const files = fs.readdirSync(systemsDir);
    expect(files).toContain('alpha.json');
    expect(files).toContain('beta.json');
    expect(files).not.toContain('ghost.json');
  });

  test('system files carry the observed up/down states', async () => {
    const systemsDir = path.join(BUILD_DIR, 'status-data', 'systems');
    const alpha = JSON.parse(
      fs.readFileSync(path.join(systemsDir, 'alpha.json'), 'utf8')
    );
    const beta = JSON.parse(
      fs.readFileSync(path.join(systemsDir, 'beta.json'), 'utf8')
    );
    expect(alpha.currentStatus).toBe('up');
    expect(alpha.timeDay).toBeGreaterThan(0); // real measured latency
    expect(beta.currentStatus).toBe('down');
  });

  test('client fetch of current.json succeeds from the served build', async ({request}) => {
    const res = await request.get('/status-data/current.json');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
