/**
 * Option validation tests — v1.0 (ADR-005 §11; ticket #77). The plugin
 * options are display concerns plus the data endpoint; monitoring
 * config lives in stentorosaur.config.js.
 */

import {validateOptions, DEFAULT_OPTIONS} from '../src/options';
import type {PluginOptions} from '../src/types';

// Mirror of Docusaurus's validate helper for Joi schemas.
function validate(schema: any, options: unknown): PluginOptions {
  const {error, value} = schema.validate(options, {convert: false});
  if (error) throw error;
  return value;
}

function run(options: unknown): PluginOptions {
  return validateOptions({validate, options} as any);
}

describe('v1 plugin options', () => {
  it('applies defaults to an empty config', () => {
    const result = run({});
    expect(result.dataPath).toBe('status-data');
    expect(result.title).toBe(DEFAULT_OPTIONS.title);
    expect(result.showServices).toBe(true);
    expect(result.statusView).toBe('default');
    expect(result.statusCardLayout).toBe('minimal');
  });

  it('accepts a full v1 config', () => {
    const result = run({
      owner: 'acme',
      repo: 'status',
      dataUrl: 'https://acme.github.io/status/status/v1/summary.json',
      title: 'Acme Status',
      entities: [{name: 'api', displayName: 'API', description: 'Public API'}],
      statusView: 'upptime',
      uptimeConfig: {sections: [{id: 'live-status', enabled: true}]},
      systemSLOs: {api: 99.9},
      defaultSLO: 99.5,
    });
    expect(result.dataUrl).toContain('summary.json');
    expect(result.entities).toHaveLength(1);
  });

  it.each([
    ['non-http dataUrl', {dataUrl: 'ftp://x.test/summary.json'}],
    ['bad statusView', {statusView: 'fancy'}],
    ['bad card layout', {statusCardLayout: 'gigantic'}],
    ['entity without name', {entities: [{displayName: 'X'}]}],
    ['SLO above 100', {defaultSLO: 101}],
    ['bad uptime section id', {uptimeConfig: {sections: [{id: 'nope', enabled: true}]}}],
  ])('rejects %s', (_label, options) => {
    expect(() => run(options)).toThrow();
  });

  it('rejects removed legacy options (unknown keys fail loudly)', () => {
    for (const legacy of [
      {token: 'ghp_x'},
      {useDemoData: true},
      {entitiesSource: 'monitorrc'},
      {fetchUrl: 'https://x.test'},
      {dataSource: {strategy: 'github', owner: 'o', repo: 'r'}},
      {scheduledMaintenance: {enabled: true}},
      {statusLabel: 'status'},
      {sites: []},
    ]) {
      expect(() => run(legacy)).toThrow();
    }
  });
});
