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
import {MemoryObjectStore} from '../src/object-store';
import {main, setObjectStoreFactory} from '../src/cli';

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

describe('loadConfig with a relative path (runbook §2 regression)', () => {
  it('resolves relative --config directories before handing to jiti', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), VALID_CONFIG);
    const prev = process.cwd();
    try {
      process.chdir(tmp);
      const config = await loadConfig('.');
      expect(config.owner).toBe('o');
    } finally {
      process.chdir(prev);
    }
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

  it('seeds an empty-but-valid summary so the site builds before the first probe', async () => {
    await main(['init', '--workdir', tmp]);
    const seed = path.join(tmp, 'status-data', 'status', 'v1', 'summary.json');
    expect(fs.existsSync(seed)).toBe(true);
    const summary = parseSummary(JSON.parse(fs.readFileSync(seed, 'utf8')));
    expect(summary.entities).toEqual([]);
    expect(summary.generatedBy).toBe('stentorosaur-init');
  });

  it('never clobbers an existing summary when re-seeding', async () => {
    const seed = path.join(tmp, 'status-data', 'status', 'v1', 'summary.json');
    fs.mkdirSync(path.dirname(seed), {recursive: true});
    fs.writeFileSync(seed, JSON.stringify({real: 'data'}));
    await main(['init', '--workdir', tmp]);
    expect(JSON.parse(fs.readFileSync(seed, 'utf8'))).toEqual({real: 'data'});
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

describe('stentorosaur doctor (r2 mode, ticket #101)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    (global as any).fetch = realFetch; // the probe tests need the real one
  });

  const R2_CONFIG = `module.exports = {owner: 'o', repo: 'r',
    entities: [{name: 'api', type: 'system'}],
    dataPlane: {kind: 'r2', bucket: 'status',
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      publicBaseUrl: 'https://status.example.com/'}};`; // trailing slash on purpose

  const freshSummary = JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'test',
    entities: [],
    incidents: {open: [], recent: []},
    maintenance: {upcoming: [], inProgress: []},
  });

  function mockPlane(state: {status: number; body?: string}) {
    const calls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/summary.json')) {
        return {ok: true, status: 200, text: async () => freshSummary, headers: {get: () => null}};
      }
      return {
        ok: state.status >= 200 && state.status < 300,
        status: state.status,
        text: async () => state.body ?? '',
        headers: {get: () => null},
      };
    });
    return calls;
  }

  it('polls publicBaseUrl (normalized) and warns when the last compaction success is >48h old', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    const staleState = JSON.stringify({
      schemaVersion: 1,
      lastRun: new Date().toISOString(),
      lastSuccess: new Date(Date.now() - 72 * 3600_000).toISOString(),
      archivedDays: [],
      deletedBatches: 0,
    });
    const calls = mockPlane({status: 200, body: staleState});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await main(['doctor', '--config', tmp])).toBe(0); // warn, never fail
      expect(calls).toContain('https://status.example.com/status/v1/summary.json');
      expect(calls).toContain('https://status.example.com/status/v1/compaction-state.json');
      expect(warnSpy.mock.calls.flat().join(' ')).toMatch(/compaction success was \d+h ago/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reports compaction healthy when lastSuccess is fresh, and surfaces quarantined batches', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    mockPlane({
      status: 200,
      body: JSON.stringify({
        schemaVersion: 1,
        lastRun: new Date().toISOString(),
        lastSuccess: new Date().toISOString(),
        archivedDays: ['2026-07-13'],
        deletedBatches: 288,
        batchesLeft: 2,
      }),
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await main(['doctor', '--config', tmp])).toBe(0);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/compaction healthy/);
      expect(warnSpy.mock.calls.flat().join(' ')).toMatch(/2 quarantined batch object/);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('warns (without failing) when compaction has never run', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    mockPlane({status: 404});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await main(['doctor', '--config', tmp])).toBe(0);
      expect(warnSpy.mock.calls.flat().join(' ')).toMatch(/no compaction-state\.json yet/);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('stentorosaur migrate --to (plane portability, ticket #102)', () => {
  const R2_CONFIG = `module.exports = {owner: 'o', repo: 'r',
    entities: [{name: 'api', type: 'system'}],
    dataPlane: {kind: 'r2', bucket: 'status',
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      publicBaseUrl: 'https://status.example.com'}};`;

  it('rejects an unknown --to target', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    expect(await main(['migrate', '--config', tmp, '--to', 'ftp'])).toBe(1);
  });

  it('refuses plane migration on a git-only config', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), VALID_CONFIG);
    expect(await main(['migrate', '--config', tmp, '--to', 'r2'])).toBe(1);
  });

  it('--to r2 --dry-run plans against the store without writing', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    const archiveDir = path.join(tmp, 'status', 'v1', 'archives', '2026', '07');
    fs.mkdirSync(archiveDir, {recursive: true});
    fs.writeFileSync(
      path.join(archiveDir, 'history-2026-07-01.jsonl'),
      '{"t":1782900000000,"svc":"api","state":"up","code":200,"lat":5}\n'
    );
    const store = new MemoryObjectStore();
    setObjectStoreFactory(() => store);
    try {
      expect(
        await main(['migrate', '--config', tmp, '--workdir', tmp, '--to', 'r2', '--dry-run'])
      ).toBe(0);
      expect(store.keys()).toEqual([]); // nothing written
    } finally {
      setObjectStoreFactory(() => {
        throw new Error('factory reset');
      });
    }
  });

  it('--to git --dry-run reports the plan and leaves the workdir untouched', async () => {
    fs.writeFileSync(path.join(tmp, 'stentorosaur.config.js'), R2_CONFIG);
    const store = new MemoryObjectStore();
    await store.put('status/v1/inputs/incidents.json', '[]');
    setObjectStoreFactory(() => store);
    try {
      expect(
        await main(['migrate', '--config', tmp, '--workdir', tmp, '--to', 'git', '--dry-run'])
      ).toBe(0);
      expect(fs.existsSync(path.join(tmp, 'status'))).toBe(false); // nothing written
    } finally {
      setObjectStoreFactory(() => {
        throw new Error('factory reset');
      });
    }
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
      // ONE clock read per command (Council PR #89 r=3): the entity
      // detail and the summary must carry the identical timestamp.
      const detail = JSON.parse(
        fs.readFileSync(path.join(tmp, 'status', 'v1', 'entities', 'api.json'), 'utf8')
      );
      expect(detail.generatedAt).toBe(summary.generatedAt);
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
