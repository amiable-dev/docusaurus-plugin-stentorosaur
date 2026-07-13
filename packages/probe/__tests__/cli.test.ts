/**
 * Config loader + unified CLI tests (ADR-005 §8/§11; ticket #74).
 */

import fs from 'node:fs';
import http from 'node:http';
import {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {parseSummary} from '@stentorosaur/core';
import {loadConfig} from '../src/config-loader';
import {reRenderFromRaw} from '../src/regenerate-from-raw';
import {writeIncidentInputs, writeRawIssueBody, readIncidentInputs} from '../src/inputs';
import {main} from '../src/cli';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-cli-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const VALID_CONFIG = `module.exports = {
  owner: 'o', repo: 'r',
  entities: [
    {name: 'api', type: 'system', probe: {url: 'http://127.0.0.1:1/health'}},
    {name: 'onboarding', type: 'process'},
  ],
};`;

describe('loadConfig', () => {
  it('loads a .js config with defaults applied', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), VALID_CONFIG);
    const config = await loadConfig(tmp);
    expect(config.dataBranch).toBe('status-data');
    expect(config.incidents.statusLabel).toBe('status');
    expect(config.entities).toHaveLength(2);
  });

  it('loads a .ts config via jiti (defineConfig)', async () => {
    fs.writeFileSync(
      path.join(tmp, 'stentorosaur.config.ts'),
      `import {defineConfig} from '@stentorosaur/core';
export default defineConfig({owner: 'o', repo: 'r', entities: [{name: 'api', type: 'system'}]});`
    );
    const config = await loadConfig(tmp);
    expect(config.owner).toBe('o');
  });

  it('loads a .json config', async () => {
    fs.writeFileSync(
      path.join(tmp, 'stentorosaur.config.json'),
      JSON.stringify({owner: 'o', repo: 'r', entities: [{name: 'api', type: 'system'}]})
    );
    const config = await loadConfig(tmp);
    expect(config.repo).toBe('r');
  });

  it('rejects invalid configs with actionable errors', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.json'), JSON.stringify({owner: 'o'}));
    await expect(loadConfig(tmp)).rejects.toThrow(/invalid stentorosaur config/);
  });

  it('tells you to run init when no config exists', async () => {
    await expect(loadConfig(tmp)).rejects.toThrow(/stentorosaur init/);
  });
});

describe('stentorosaur init', () => {
  it('scaffolds a config and refuses to overwrite', async () => {
    expect(await main(['init', '--workdir', tmp])).toBe(0);
    expect(fs.existsSync(path.join(tmp, 'stentorosaur.config.js'))).toBe(true);
    expect(await main(['init', '--workdir', tmp])).toBe(1);
  });

  it('the scaffolded config parses', async () => {
    await main(['init', '--workdir', tmp]);
    const config = await loadConfig(tmp);
    expect(config.entities.length).toBeGreaterThan(0);
  });
});

describe('stentorosaur doctor', () => {
  it('fails loudly on slug collisions and unreachable data plane', async () => {
    fs.writeFileSync(
      path.join(tmp, 'stentorosaur.config.js'),
      `module.exports = {owner: 'o', repo: 'r', entities: [
        {name: 'API v1', type: 'system'},
        {name: 'API-v1', type: 'system'},
      ]};`
    );
    const fetchMock = jest.fn().mockRejectedValue(new Error('offline'));
    (global as any).fetch = fetchMock;
    expect(await main(['doctor', '--config', tmp])).toBe(1);
  });

  it('passes with a fresh summary on the data plane', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), VALID_CONFIG);
    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: 'test',
      entities: [],
      incidents: {open: [], recent: []},
      maintenance: {upcoming: [], inProgress: []},
    };
    parseSummary(summary); // fixture sanity
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(summary),
      headers: {get: () => null},
    });
    expect(await main(['doctor', '--config', tmp])).toBe(0);
  });
});

describe('stentorosaur probe --no-push (local pipeline)', () => {
  it('checks entities, writes details/archives, regenerates a valid summary', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      fs.writeFileSync(
        path.join(tmp, 'stentorosaur.config.js'),
        `module.exports = {owner: 'o', repo: 'r', entities: [
          {name: 'api', type: 'system', probe: {url: 'http://127.0.0.1:${port}/health'}},
          {name: 'onboarding', type: 'process'},
        ]};`
      );
      expect(await main(['probe', '--config', tmp, '--workdir', tmp, '--no-push'])).toBe(0);
      const summary = parseSummary(
        JSON.parse(fs.readFileSync(path.join(tmp, 'status', 'v1', 'summary.json'), 'utf8'))
      );
      expect(summary.entities.map(e => e.name)).toEqual(['api', 'onboarding']);
      expect(summary.entities[0].status).toBe('up');
      expect(fs.existsSync(path.join(tmp, 'status', 'v1', 'entities', 'api.json'))).toBe(true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

describe('reRenderFromRaw (§7 runbook)', () => {
  it('re-renders incident and maintenance bodies from raw markdown', () => {
    const now = new Date('2026-07-13T18:00:00.000Z');
    writeIncidentInputs(
      tmp,
      [
        {
          issueNumber: 11, title: 'Outage', severity: 'critical', status: 'open',
          entities: ['api'], createdAt: now.toISOString(), closedAt: null,
          bodyHtml: '<p>STALE-SANITIZER-OUTPUT</p>',
        },
      ],
      [
        {
          issueNumber: 12, title: 'Maint', start: now.toISOString(), end: now.toISOString(),
          status: 'completed', entities: ['api'], bodyHtml: '<p>STALE</p>',
        },
      ]
    );
    writeRawIssueBody(tmp, {
      schemaVersion: 1, issueNumber: 11, updatedAt: now.toISOString(),
      bodyMarkdown: '**fresh** body',
    });
    writeRawIssueBody(tmp, {
      schemaVersion: 1, issueNumber: 12, updatedAt: now.toISOString(),
      bodyMarkdown: '---\nstart: 2026-07-14T02:00:00Z\nend: 2026-07-14T04:00:00Z\n---\n\n*fresh* maintenance',
    });

    const counts = reRenderFromRaw(tmp, now);
    expect(counts).toEqual({incidents: 1, maintenance: 1});
    const {incidents, maintenance} = readIncidentInputs(tmp);
    expect(incidents[0].bodyHtml).toContain('<strong>fresh</strong>');
    expect(incidents[0].bodyHtml).not.toContain('STALE');
    expect(maintenance[0].bodyHtml).toContain('<em>fresh</em>');
    expect(maintenance[0].bodyHtml).not.toContain('start:'); // frontmatter stripped
  });
});

describe('Council PR #89 r=1 regression guards', () => {
  it('trailing flags without values fail with a clear message (no out-of-bounds read)', async () => {
    expect(await main(['doctor', '--config'])).toBe(1);
    expect(await main(['probe', '--branch', '--no-push'])).toBe(1);
  });

  it('parseConfig error paths use zod v4 prettifyError with field paths (disposition: the API exists)', async () => {
    fs.writeFileSync(
      path.join(tmp, 'stentorosaur.config.json'),
      JSON.stringify({owner: 'o', repo: 'r', entities: [{name: '', type: 'starship'}]})
    );
    await expect(loadConfig(tmp)).rejects.toThrow(/entities/); // pretty output names the failing path
  });

  it('init refuses when ANY config flavor exists', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.json'), JSON.stringify({owner: 'o', repo: 'r', entities: [{name: 'a', type: 'system'}]}));
    expect(await main(['init', '--workdir', tmp])).toBe(1);
  });

  it('doctor treats staleness as a warning, not a failure', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), `module.exports = {owner: 'o', repo: 'r', entities: [{name: 'api', type: 'system'}]};`);
    const staleSummary = {
      schemaVersion: 1,
      generatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      generatedBy: 'test',
      entities: [],
      incidents: {open: [], recent: []},
      maintenance: {upcoming: [], inProgress: []},
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify(staleSummary), headers: {get: () => null},
    });
    expect(await main(['doctor', '--config', tmp])).toBe(0); // warn, exit 0
  });
});
