/**
 * Issue-event handler tests (ticket #70): fixture issues → inputs +
 * provenance → regenerated summary on a REAL data-branch repo, including
 * the probe-vs-issue-event race (§5).
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseSummary} from '@stentorosaur/core';
import type {IssuePayload} from '@stentorosaur/core';
import {writeEntityDetail} from '../src/files';
import {pushWithRegenerateRetry} from '../src/git-writer';
import {readIncidentInputs} from '../src/inputs';
import {regenerateDerived} from '../src/regenerate';
import {fetchStatusIssues, writeIssueInputs} from '../src/update-incidents';

const NOW = '2026-07-12T18:00:00.000Z';
const ENTITIES = [
  {name: 'api', type: 'system' as const},
  {name: 'web', type: 'system' as const},
];
const REGEN = {
  generatedAt: NOW,
  generatedBy: 'test@0.0.0',
  entities: ENTITIES,
  siteTitle: 'Fixture',
  siteUrl: 'https://status.example.com',
};

const issue = (over: Partial<IssuePayload> = {}): IssuePayload => ({
  number: 201,
  title: 'API outage',
  state: 'open',
  created_at: '2026-07-12T17:00:00.000Z',
  updated_at: '2026-07-12T17:30:00.000Z',
  html_url: 'https://github.com/o/r/issues/201',
  body: 'Elevated errors.',
  labels: [{name: 'status'}, {name: 'critical'}, {name: 'system:api'}],
  ...over,
});

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-issues-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

describe('writeIssueInputs + regenerateDerived', () => {
  it('an open critical issue reaches summary.incidents.open and flips entity status', () => {
    writeEntityDetail(tmp, 'api', [{t: Date.parse(NOW) - 60_000, svc: 'api', state: 'up', code: 200, lat: 50}], NOW);
    const counts = writeIssueInputs(tmp, [issue()], {entities: ENTITIES, maintenanceLabels: ['maintenance'], now: new Date(NOW)});
    expect(counts).toEqual({incidents: 1, maintenance: 0, skipped: 0});

    regenerateDerived(tmp, REGEN);
    const summary = parseSummary(JSON.parse(fs.readFileSync(path.join(tmp, 'status', 'v1', 'summary.json'), 'utf8')));
    expect(summary.incidents.open.map(i => i.issueNumber)).toEqual([201]);
    expect(summary.entities.find(e => e.name === 'api')!.status).toBe('down');
    // Raw provenance written (§7)
    expect(fs.existsSync(path.join(tmp, 'status', 'v1', 'raw', '201.json'))).toBe(true);
    // Atom feed regenerated
    expect(fs.readFileSync(path.join(tmp, 'status', 'v1', 'incidents.atom'), 'utf8')).toContain('API outage');
  });

  it('closing the issue moves it to recent and restores probe status', () => {
    writeEntityDetail(tmp, 'api', [{t: Date.parse(NOW) - 60_000, svc: 'api', state: 'up', code: 200, lat: 50}], NOW);
    writeIssueInputs(
      tmp,
      [issue({state: 'closed', closed_at: '2026-07-12T17:45:00.000Z'})],
      {entities: ENTITIES, maintenanceLabels: ['maintenance'], now: new Date(NOW)}
    );
    regenerateDerived(tmp, REGEN);
    const summary = parseSummary(JSON.parse(fs.readFileSync(path.join(tmp, 'status', 'v1', 'summary.json'), 'utf8')));
    expect(summary.incidents.open).toEqual([]);
    expect(summary.incidents.recent.map(i => i.issueNumber)).toEqual([201]);
    expect(summary.entities.find(e => e.name === 'api')!.status).toBe('up');
  });

  it('maintenance frontmatter produces upcoming/in-progress windows; malformed skipped', () => {
    const maintenanceIssue = (number: number, start: string, end: string): IssuePayload =>
      issue({
        number,
        title: `Maint ${number}`,
        labels: [{name: 'maintenance'}, {name: 'system:web'}],
        body: `---\nstart: ${start}\nend: ${end}\n---\n\nWork.`,
      });
    const counts = writeIssueInputs(
      tmp,
      [
        maintenanceIssue(301, '2026-07-14T02:00:00Z', '2026-07-14T04:00:00Z'), // upcoming
        maintenanceIssue(302, '2026-07-12T17:00:00Z', '2026-07-12T19:00:00Z'), // in-progress
        issue({number: 303, labels: [{name: 'maintenance'}], body: 'no frontmatter'}), // skipped
      ],
      {entities: ENTITIES, maintenanceLabels: ['maintenance'], now: new Date(NOW)}
    );
    expect(counts).toEqual({incidents: 0, maintenance: 2, skipped: 1});
    const {maintenance} = readIncidentInputs(tmp);
    expect(maintenance.map(m => m.status).sort()).toEqual(['in-progress', 'upcoming']);
  });
});

describe('probe-vs-issue-event race (§5)', () => {
  it('converges: both the probe readings and the incident survive', async () => {
    const origin = path.join(tmp, 'origin.git');
    execFileSync('git', ['init', '--bare', '--initial-branch=status-data', origin]);
    const cloneA = path.join(tmp, 'probe-writer');
    const cloneB = path.join(tmp, 'issue-writer');
    execFileSync('git', ['clone', origin, cloneA], {stdio: 'pipe'});
    execFileSync('git', ['clone', origin, cloneB], {stdio: 'pipe'});

    // Writer A: probe readings for api.
    await pushWithRegenerateRetry({
      workdir: cloneA,
      branch: 'status-data',
      commitMessage: 'probe: api readings',
      writeInputs: async dir => {
        writeEntityDetail(dir, 'api', [{t: Date.parse(NOW) - 60_000, svc: 'api', state: 'up', code: 200, lat: 50}], NOW);
      },
      regenerate: async dir => regenerateDerived(dir, REGEN),
      sleep: async () => {},
      jitterMs: () => 0,
    });

    // Writer B cloned BEFORE A pushed (stale) — must fetch, land incident
    // on top, and regenerate a summary containing BOTH inputs.
    await pushWithRegenerateRetry({
      workdir: cloneB,
      branch: 'status-data',
      commitMessage: 'issues: incident 201',
      writeInputs: async dir => {
        writeIssueInputs(dir, [issue()], {entities: ENTITIES, maintenanceLabels: ['maintenance'], now: new Date(NOW)});
      },
      regenerate: async dir => regenerateDerived(dir, REGEN),
      sleep: async () => {},
      jitterMs: () => 0,
    });

    const verify = path.join(tmp, 'verify');
    execFileSync('git', ['clone', origin, verify], {stdio: 'pipe'});
    const summary = parseSummary(
      JSON.parse(fs.readFileSync(path.join(verify, 'status', 'v1', 'summary.json'), 'utf8'))
    );
    const api = summary.entities.find(e => e.name === 'api')!;
    expect(api.status).toBe('down'); // probe said up, incident escalates
    expect(api.responseTimeMs.d1).toBe(50); // probe readings survived
    expect(summary.incidents.open.map(i => i.issueNumber)).toEqual([201]);
  });
});

describe('fetchStatusIssues', () => {
  it('pages, dedupes across labels, drops PRs, and sends auth', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: any, init: any) => {
      calls.push(String(url));
      expect(init.headers.authorization).toBe('Bearer tok');
      const page = new URL(String(url)).searchParams.get('page');
      const label = new URL(String(url)).searchParams.get('labels');
      const body =
        page === '1'
          ? [
              issue({number: 1}),
              {...issue({number: 2}), pull_request: {url: 'x'}},
              ...(label === 'status' ? [issue({number: 3})] : []),
              ...Array.from({length: label === 'status' ? 97 : 99}, () => issue({number: 1})),
            ]
          : ['2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(page ?? '')
            ? Array.from({length: 100}, () => issue({number: 1}))
          : page === '11' && label === 'status'
            ? [issue({number: 11})]
          : [];
      return new Response(JSON.stringify(body), {status: 200});
    }) as typeof fetch;

    const issues = await fetchStatusIssues({
      owner: 'o',
      repo: 'r',
      statusLabel: 'status',
      maintenanceLabels: ['maintenance'],
      token: 'tok',
      fetchImpl,
    });
    expect(issues.map(i => i.number)).toEqual([1, 3, 11]); // PR dropped, dedup across labels
    expect(calls.some(u => u.includes('labels=maintenance'))).toBe(true);
    expect(calls.some(u => u.includes('page=11'))).toBe(true);
  });

  it('throws loudly on API errors', async () => {
    const fetchImpl = (async () => new Response('nope', {status: 403})) as typeof fetch;
    await expect(
      fetchStatusIssues({owner: 'o', repo: 'r', statusLabel: 'status', maintenanceLabels: [], fetchImpl})
    ).rejects.toThrow(/HTTP 403/);
  });
});
