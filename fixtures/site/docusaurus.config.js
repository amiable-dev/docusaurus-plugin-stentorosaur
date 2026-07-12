// Fixture site for the ADR-005 pipeline e2e harness (ticket #66).
// Deliberately minimal: one page + the status plugin reading the
// committed-data path produced by monitor.js in e2e/global-setup.mjs.

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
        // Single source of truth: entities auto-discovered from
        // .monitorrc.json — the #62 shape ('ghost' in data, not in
        // config) must therefore not render.
        entitiesSource: 'monitorrc',
        useDemoData: false,
        showIncidents: false,
        scheduledMaintenance: {enabled: false},
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
