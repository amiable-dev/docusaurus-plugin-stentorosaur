import {defineConfig} from '@playwright/test';

/**
 * Pipeline fixture harness (ADR-005 Phase 0, ticket #66).
 * The pipeline (mock HTTP server → monitor.js → seeded ghost readings
 * (#62) → docusaurus build of fixtures/site) runs as the
 * `node e2e/run-pipeline.mjs` pre-step of `npm run test:e2e` — NOT as
 * Playwright globalSetup, because the webServer starts before
 * globalSetup in this Playwright version. The webServer below serves
 * the already-built site for DOM assertions.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3999',
  },
  webServer: {
    command:
      'npx docusaurus serve fixtures/site --port 3999 --host 127.0.0.1 --no-open',
    url: 'http://127.0.0.1:3999/status/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
