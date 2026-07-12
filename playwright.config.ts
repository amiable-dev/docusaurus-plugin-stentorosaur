import {defineConfig} from '@playwright/test';

/**
 * Pipeline fixture harness (ADR-005 Phase 0, ticket #66).
 * globalSetup runs the real pipeline: mock HTTP server → monitor.js →
 * seeded ghost readings (#62) → docusaurus build of fixtures/site.
 * The webServer then serves that build for DOM assertions.
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
