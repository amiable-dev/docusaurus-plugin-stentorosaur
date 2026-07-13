// Fixture site for the ADR-005 pipeline e2e harness (tickets #66/#77).
// Deliberately minimal: one page + the status plugin reading the
// status/v1 snapshot produced by the probe lib in e2e/run-pipeline.mjs.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Stentorosaur Fixture',
  url: 'http://127.0.0.1',
  baseUrl: '/',
  organizationName: 'fixture-org',
  projectName: 'fixture-repo',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  presets: [
    [
      'classic',
      {
        docs: false,
        blog: false,
        theme: {},
      },
    ],
  ],

  plugins: [
    [
      '@amiable-dev/docusaurus-plugin-stentorosaur',
      {
        title: 'Fixture Status',
        description: 'Pipeline harness status page',
        showIncidents: false,
        // ADR-005 §4: client-side live refresh from the self-served v1
        // summary (relative URL — build-time fetch only applies to http(s)).
        dataUrl: '/status-data/status/v1/summary.json',
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Fixture',
      items: [{to: '/status', label: 'Status', position: 'left'}],
    },
  },
};

module.exports = config;
