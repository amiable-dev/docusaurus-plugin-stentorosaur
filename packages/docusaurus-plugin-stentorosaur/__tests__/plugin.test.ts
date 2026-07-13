/**
 * Plugin lifecycle tests — v1.0 (ADR-005; ticket #77).
 *
 * loadContent is read + validate + register: parse status/v1
 * summary.json (from dataUrl or the local dataPath checkout), adapt to
 * StatusData, register the route, publish the snapshot in postBuild.
 * There are no other read paths.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {LoadContext} from '@docusaurus/types';
import pluginStatusPage from '../src/index';
import type {PluginOptions} from '../src/types';

const SUMMARY = {
  schemaVersion: 1,
  generatedAt: '2026-07-13T12:00:00.000Z',
  generatedBy: 'probe@test',
  entities: [
    {
      name: 'api',
      type: 'system',
      displayName: 'API',
      status: 'up',
      uptime: {d1: 100, d7: 99.5, d90: 99.9},
      responseTimeMs: {d1: 42},
      daysEnd: '2026-07-13',
      days: [
        [100, 40, 'u'],
        [98.6, 45, 'g'],
        [100, 42, 'u'],
      ],
    },
    {
      name: 'onboarding',
      type: 'process',
      status: 'degraded',
      uptime: {d1: 100, d7: 100, d90: 100},
      responseTimeMs: {d1: null},
      daysEnd: '2026-07-13',
      days: [[100, null, 'u']],
    },
  ],
  incidents: {
    open: [
      {
        issueNumber: 7,
        title: 'Slow onboarding',
        severity: 'major',
        status: 'open',
        entities: ['onboarding'],
        createdAt: '2026-07-13T09:00:00.000Z',
        closedAt: null,
        bodyHtml: '<p>investigating</p>',
      },
    ],
    recent: [],
  },
  maintenance: {upcoming: [], inProgress: []},
};

let siteDir: string;
function makeContext(): LoadContext {
  return {
    siteDir,
    generatedFilesDir: path.join(siteDir, '.docusaurus'),
    siteConfig: {baseUrl: '/', organizationName: 'test-owner', projectName: 'test-repo'} as any,
  } as LoadContext;
}

function writeLocalSummary(summary: unknown = SUMMARY): void {
  const v1 = path.join(siteDir, 'status-data', 'status', 'v1');
  fs.mkdirSync(v1, {recursive: true});
  fs.writeFileSync(path.join(v1, 'summary.json'), JSON.stringify(summary));
}

beforeEach(() => {
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
  fs.mkdirSync(path.join(siteDir, '.docusaurus'), {recursive: true});
});
afterEach(() => {
  fs.rmSync(siteDir, {recursive: true, force: true});
  jest.restoreAllMocks();
});

describe('loadContent (v1 single read path)', () => {
  it('adapts a local status/v1 summary into StatusData', async () => {
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {} as PluginOptions);
    const content = await plugin.loadContent!();

    expect(content.items.map(i => i.name)).toEqual(['api', 'onboarding']);
    expect(content.items[0].displayName).toBe('API');
    expect(content.items[0].days).toHaveLength(3);
    expect(content.items[0].days![2].date).toBe('2026-07-13');
    expect(content.incidents[0].body).toBe('<p>investigating</p>');
    expect(content.v1Summary).toBeDefined();
    expect(content.repoUrl).toBe('https://github.com/test-owner/test-repo');
    // Snapshot-only build still gets a client refresh endpoint (the
    // postBuild-published copy under the site's own baseUrl).
    expect(content.dataUrl).toBe('/status-data/status/v1/summary.json');
  });

  it('prefers dataUrl when set and reachable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(SUMMARY),
    }) as unknown as typeof fetch;

    const plugin = await pluginStatusPage(makeContext(), {
      dataUrl: 'https://data.example.com/status/v1/summary.json',
    } as PluginOptions);
    const content = await plugin.loadContent!();
    expect(content.items).toHaveLength(2);
    expect(content.dataUrl).toBe('https://data.example.com/status/v1/summary.json');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://data.example.com/status/v1/summary.json',
      expect.anything()
    );
  });

  it('falls back to the local snapshot when the dataUrl fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {
      dataUrl: 'https://data.example.com/status/v1/summary.json',
    } as PluginOptions);
    const content = await plugin.loadContent!();
    expect(content.items).toHaveLength(2);
  });

  it('throws an actionable error when no v1 data exists anywhere', async () => {
    const plugin = await pluginStatusPage(makeContext(), {} as PluginOptions);
    await expect(plugin.loadContent!()).rejects.toThrow(/stentorosaur (init|migrate)/);
  });

  it('rejects an invalid local summary loudly (schema-gated)', async () => {
    writeLocalSummary({schemaVersion: 99, nonsense: true});
    const plugin = await pluginStatusPage(makeContext(), {} as PluginOptions);
    await expect(plugin.loadContent!()).rejects.toThrow();
  });

  it('merges display metadata from plugin options onto items', async () => {
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {
      entities: [{name: 'api', description: 'The public API', displayName: 'Public API'}],
    } as PluginOptions);
    const content = await plugin.loadContent!();
    expect(content.items[0].description).toBe('The public API');
    expect(content.items[0].displayName).toBe('Public API');
  });
});

describe('contentLoaded', () => {
  it('registers the status route with the loaded data', async () => {
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {} as PluginOptions);
    const content = await plugin.loadContent!();

    const addRoute = jest.fn();
    const createData = jest.fn().mockResolvedValue('status-data.json');
    await plugin.contentLoaded!({content, actions: {addRoute, createData}} as any);

    expect(addRoute).toHaveBeenCalledWith(
      expect.objectContaining({path: '/status', component: '@theme/StatusPage', exact: true})
    );
  });

  it('uses the upptime layout when statusView=upptime', async () => {
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {
      statusView: 'upptime',
    } as PluginOptions);
    const content = await plugin.loadContent!();
    const addRoute = jest.fn();
    const createData = jest.fn().mockResolvedValue('status-data.json');
    await plugin.contentLoaded!({content, actions: {addRoute, createData}} as any);
    expect(addRoute).toHaveBeenCalledWith(
      expect.objectContaining({component: '@theme/UptimeStatusPage'})
    );
  });
});

describe('postBuild', () => {
  it('publishes the status/v1 snapshot into the build output', async () => {
    writeLocalSummary();
    const plugin = await pluginStatusPage(makeContext(), {} as PluginOptions);
    await plugin.loadContent!();
    const outDir = path.join(siteDir, 'build');
    fs.mkdirSync(outDir, {recursive: true});
    await (plugin as any).postBuild({outDir});
    expect(
      fs.existsSync(path.join(outDir, 'status-data', 'status', 'v1', 'summary.json'))
    ).toBe(true);
  });

  it('is a no-op when there is no local status/v1 (dataUrl-only site)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(SUMMARY),
    }) as unknown as typeof fetch;
    const plugin = await pluginStatusPage(makeContext(), {
      dataUrl: 'https://data.example.com/status/v1/summary.json',
    } as PluginOptions);
    await plugin.loadContent!();
    const outDir = path.join(siteDir, 'build');
    fs.mkdirSync(outDir, {recursive: true});
    await (plugin as any).postBuild({outDir});
    expect(fs.existsSync(path.join(outDir, 'status-data'))).toBe(false);
  });
});
