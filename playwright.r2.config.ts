import {defineConfig} from '@playwright/test';

// The spec adapts its data-plane assertions to the profile (the DOM
// invariants are identical). Config files execute before test load, so
// this is the deterministic way to flag the leg.
process.env.E2E_PROFILE = 'r2';

/**
 * Profile C leg of the pipeline fixture harness (ADR-006; ticket #103).
 * `PROFILE=r2 node e2e/run-pipeline.mjs` ran the Worker probe cycle +
 * compaction against the bucket double, smoked the serving route, and
 * built the fixture site with dataUrl pointing at that route. Here the
 * SAME spec (identical DOM invariants as the git leg) runs against the
 * built site, with the serving route alive as a second webServer so the
 * client-side §4 SWR fetch works in the browser.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3999',
  },
  webServer: [
    {
      command:
        'npx docusaurus serve fixtures/site --port 3999 --host 127.0.0.1 --no-open',
      url: 'http://127.0.0.1:3999/status/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node e2e/serve-r2.mjs fixtures/site/.r2-bucket.json 39991',
      url: 'http://127.0.0.1:39991/status/v1/summary.json',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
