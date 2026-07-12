/**
 * Core transforms tests (ADR-005 §2/§7; epic #63 ticket #68).
 *
 * - issue → incident / maintenance-window transforms (pure; renderHtml injected)
 * - write-time markdown sanitization (XSS corpus)
 * - buildSummary determinism (shuffled inputs → identical bytes)
 * - incidents.atom generation (escaping, determinism)
 */

import {LabelParser} from '../src/labels';
import {
  extractSeverity,
  isMaintenanceIssue,
  issueToIncidentV1,
  worstEntityStatus,
} from '../src/issues';
import type {IssuePayload} from '../src/issues';
import {renderMarkdownToSafeHtml} from '../src/render';
import {
  extractFrontmatter,
  getMaintenanceStatus,
  issueToMaintenanceV1,
  parseHumanDate,
} from '../src/maintenance';
import {buildSummary} from '../src/build-summary';
import type {BuildSummaryInputs} from '../src/build-summary';
import {incidentsToAtom} from '../src/atom';
import {parseSummary} from '../src/status-v1';
import type {CompactReading} from '../src/types';

const ENTITIES = [
  {name: 'api', type: 'system' as const, displayName: 'API'},
  {name: 'web', type: 'system' as const},
  {name: 'onboarding', type: 'process' as const},
];
const parser = new LabelParser();
const NOW = '2026-07-12T18:00:00.000Z';

const issue = (over: Partial<IssuePayload> = {}): IssuePayload => ({
  number: 101,
  title: 'API outage',
  state: 'open',
  created_at: '2026-07-12T17:00:00.000Z',
  updated_at: '2026-07-12T17:30:00.000Z',
  html_url: 'https://github.com/o/r/issues/101',
  body: 'Investigating **elevated** error rates.',
  labels: [{name: 'status'}, {name: 'critical'}, {name: 'system:api'}],
  ...over,
});

describe('severity + entity extraction', () => {
  it('maps labels to severity with critical > major > minor default', () => {
    expect(extractSeverity(['critical', 'major'])).toBe('critical');
    expect(extractSeverity(['major'])).toBe('major');
    expect(extractSeverity(['status'])).toBe('minor');
  });
  it('detects maintenance issues by configured labels', () => {
    expect(isMaintenanceIssue(['maintenance'], ['maintenance'])).toBe(true);
    expect(isMaintenanceIssue(['status'], ['maintenance'])).toBe(false);
  });
});

describe('issueToIncidentV1', () => {
  const renderHtml = (md: string) => `<p>${md}</p>`; // injected fake
  it('produces a valid v1 incident with entity NAMES (not displayNames)', () => {
    const inc = issueToIncidentV1(issue(), {entities: ENTITIES, labelParser: parser, renderHtml});
    expect(inc).toEqual({
      issueNumber: 101,
      title: 'API outage',
      severity: 'critical',
      status: 'open',
      entities: ['api'],
      createdAt: '2026-07-12T17:00:00.000Z',
      closedAt: null,
      bodyHtml: '<p>Investigating **elevated** error rates.</p>',
    });
  });
  it('closed issues become resolved with closedAt', () => {
    const inc = issueToIncidentV1(
      issue({state: 'closed', closed_at: '2026-07-12T17:45:00.000Z', labels: [{name: 'minor'}, {name: 'web'}]}),
      {entities: ENTITIES, labelParser: parser, renderHtml}
    );
    expect(inc.status).toBe('resolved');
    expect(inc.closedAt).toBe('2026-07-12T17:45:00.000Z');
    expect(inc.entities).toEqual(['web']); // legacy untyped label
  });
});

describe('worstEntityStatus (port of generateStatusItems worst-wins)', () => {
  const inc = (severity: 'critical' | 'major' | 'minor', entities: string[]) => ({
    issueNumber: 1,
    title: 't',
    severity,
    status: 'open' as const,
    entities,
    createdAt: NOW,
    closedAt: null,
    bodyHtml: '',
  });
  it('critical → down beats degraded; unaffected entity stays as probe state', () => {
    expect(worstEntityStatus('up', [inc('critical', ['api'])], 'api')).toBe('down');
    expect(worstEntityStatus('up', [inc('major', ['api'])], 'api')).toBe('degraded');
    expect(worstEntityStatus('up', [inc('minor', ['api'])], 'api')).toBe('degraded');
    expect(worstEntityStatus('up', [inc('critical', ['web'])], 'api')).toBe('up');
  });
  it('probe-down wins over incident-degraded; resolved incidents ignored', () => {
    expect(worstEntityStatus('down', [inc('minor', ['api'])], 'api')).toBe('down');
    expect(
      worstEntityStatus('up', [{...inc('critical', ['api']), status: 'resolved' as const}], 'api')
    ).toBe('up');
  });
});

describe('renderMarkdownToSafeHtml (write-time sanitization)', () => {
  it('renders GFM markdown', () => {
    const html = renderMarkdownToSafeHtml('**bold** and [link](https://example.com)');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
  });
  it.each([
    ['<script>alert(1)</script>', '<script'],
    ['<img src=x onerror=alert(1)>', 'onerror'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<iframe src="https://evil.example"></iframe>', '<iframe'],
    ['<div style="background:url(javascript:1)">x</div>', 'style='],
  ])('neutralizes XSS vector %s', (payload, mustNotContain) => {
    const html = renderMarkdownToSafeHtml(payload);
    expect(html.toLowerCase()).not.toContain(mustNotContain.toLowerCase());
  });
  it('returns empty string for empty input', () => {
    expect(renderMarkdownToSafeHtml('')).toBe('');
  });
});

describe('maintenance parsing (deterministic: now injected)', () => {
  it('parses ISO frontmatter and derives status from injected now', () => {
    const body = '---\nstart: 2026-07-14T02:00:00Z\nend: 2026-07-14T04:00:00Z\n---\n\nDB migration.';
    const {frontmatter} = extractFrontmatter(body);
    expect(frontmatter.start).toBe('2026-07-14T02:00:00Z');
    expect(getMaintenanceStatus(frontmatter.start!, frontmatter.end!, 'open', new Date(NOW))).toBe('upcoming');
    expect(
      getMaintenanceStatus('2026-07-12T17:00:00Z', '2026-07-12T19:00:00Z', 'open', new Date(NOW))
    ).toBe('in-progress');
    expect(getMaintenanceStatus('2026-07-01T00:00:00Z', '2026-07-01T01:00:00Z', 'open', new Date(NOW))).toBe('completed');
    expect(getMaintenanceStatus('2026-07-14T02:00:00Z', '2026-07-14T04:00:00Z', 'closed', new Date(NOW))).toBe('completed');
  });
  it('parseHumanDate resolves relative dates against the injected reference', () => {
    const ref = new Date('2026-07-12T00:00:00Z');
    const parsed = parseHumanDate('tomorrow at 2am UTC', ref);
    expect(parsed).toMatch(/^2026-07-13T/);
  });
  it('skips GitHub issue-form headings before frontmatter', () => {
    const body = '### Maintenance Details\n\n---\nstart: 2026-07-14T02:00:00Z\nend: 2026-07-14T04:00:00Z\n---\nBody';
    expect(extractFrontmatter(body).frontmatter.start).toBe('2026-07-14T02:00:00Z');
  });
  it('issueToMaintenanceV1 produces a valid window', () => {
    const win = issueToMaintenanceV1(
      issue({
        number: 102,
        title: 'DB migration',
        labels: [{name: 'maintenance'}, {name: 'system:api'}],
        body: '---\nstart: 2026-07-14T02:00:00Z\nend: 2026-07-14T04:00:00Z\n---\n\nRead-only mode.',
      }),
      {entities: ENTITIES, labelParser: parser, renderHtml: md => `<p>${md.trim()}</p>`, now: new Date(NOW)}
    );
    expect(win).toEqual({
      issueNumber: 102,
      title: 'DB migration',
      start: '2026-07-14T02:00:00Z',
      end: '2026-07-14T04:00:00Z',
      status: 'upcoming',
      entities: ['api'],
      bodyHtml: '<p>Read-only mode.</p>',
    });
  });
  it('accepts frontmatter-only maintenance bodies', () => {
    const win = issueToMaintenanceV1(
      issue({
        number: 103,
        title: 'API maintenance',
        labels: [{name: 'maintenance'}, {name: 'system:api'}],
        body: '---\nstart: 2026-07-14T02:00:00Z\nend: 2026-07-14T04:00:00Z\n---',
      }),
      {entities: ENTITIES, labelParser: parser, renderHtml: md => `<p>${md}</p>`, now: new Date(NOW)}
    );
    expect(win).toEqual({
      issueNumber: 103,
      title: 'API maintenance',
      start: '2026-07-14T02:00:00Z',
      end: '2026-07-14T04:00:00Z',
      status: 'upcoming',
      entities: ['api'],
      bodyHtml: '<p></p>',
    });
  });
});

describe('buildSummary', () => {
  const MIN = 60_000;
  const T = Date.parse(NOW);
  const readings: CompactReading[] = [
    {t: T - 10 * MIN, svc: 'api', state: 'up', code: 200, lat: 100},
    {t: T - 5 * MIN, svc: 'api', state: 'up', code: 200, lat: 140},
    {t: T - 10 * MIN, svc: 'web', state: 'down', code: 500, lat: 0},
    {t: T - 5 * MIN, svc: 'web', state: 'down', code: 500, lat: 0},
  ];
  const rollups = {
    api: [
      {date: '2026-07-11', uptime: 100, avgMs: 120, worst: 'up' as const},
      {date: '2026-07-12', uptime: 100, avgMs: 120, worst: 'up' as const},
    ],
    web: [{date: '2026-07-12', uptime: 50, avgMs: 200, worst: 'down' as const}],
  };
  const baseInputs = (): BuildSummaryInputs => ({
    generatedAt: NOW,
    generatedBy: 'test@0.0.0',
    entities: ENTITIES,
    readings,
    dailyRollups: rollups,
    incidents: [
      {
        issueNumber: 101, title: 'API outage', severity: 'critical', status: 'open',
        entities: ['api'], createdAt: '2026-07-12T17:00:00.000Z', closedAt: null, bodyHtml: '<p>x</p>',
      },
      {
        issueNumber: 97, title: 'Old', severity: 'minor', status: 'resolved',
        entities: ['web'], createdAt: '2026-07-10T09:00:00.000Z', closedAt: '2026-07-10T11:00:00.000Z', bodyHtml: '',
      },
    ],
    maintenance: [
      {
        issueNumber: 102, title: 'DB migration', start: '2026-07-14T02:00:00.000Z',
        end: '2026-07-14T04:00:00.000Z', status: 'upcoming', entities: ['api'], bodyHtml: '',
      },
    ],
  });

  it('produces a summary that parses under the v1 schema', () => {
    expect(() => parseSummary(JSON.parse(JSON.stringify(buildSummary(baseInputs()))))).not.toThrow();
  });

  it('entity status is worst of probe state and open incidents', () => {
    const summary = buildSummary(baseInputs());
    const api = summary.entities.find(e => e.name === 'api')!;
    const web = summary.entities.find(e => e.name === 'web')!;
    const onboarding = summary.entities.find(e => e.name === 'onboarding')!;
    expect(api.status).toBe('down'); // probe up, but open critical incident
    expect(web.status).toBe('down'); // probe down
    expect(onboarding.status).toBe('up'); // no probe, no incidents
  });

  it('is referentially transparent: shuffled inputs → identical bytes', () => {
    const a = buildSummary(baseInputs());
    const shuffled = baseInputs();
    shuffled.readings = [...shuffled.readings].reverse();
    shuffled.incidents = [...shuffled.incidents].reverse();
    shuffled.entities = [...ENTITIES]; // same order — entity order is config-owned
    const b = buildSummary(shuffled);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('partitions incidents into open/recent and maintenance by status', () => {
    const s = buildSummary(baseInputs());
    expect(s.incidents.open.map(i => i.issueNumber)).toEqual([101]);
    expect(s.incidents.recent.map(i => i.issueNumber)).toEqual([97]);
    expect(s.maintenance.upcoming.map(m => m.issueNumber)).toEqual([102]);
    expect(s.maintenance.inProgress).toEqual([]);
  });

  it('computes d1 uptime/latency from readings and d7/d90 from rollups', () => {
    const s = buildSummary(baseInputs());
    const api = s.entities.find(e => e.name === 'api')!;
    expect(api.uptime.d1).toBe(100);
    expect(api.responseTimeMs.d1).toBe(120); // (100+140)/2
    const web = s.entities.find(e => e.name === 'web')!;
    expect(web.uptime.d1).toBe(0);
    expect(web.responseTimeMs.d1).toBeNull();
  });
});

describe('incidentsToAtom', () => {
  it('escapes XML and is deterministic', () => {
    const atom = incidentsToAtom(
      [
        {
          issueNumber: 5, title: 'Outage <&> "quotes"', severity: 'major', status: 'open',
          entities: ['api'], createdAt: '2026-07-12T17:00:00.000Z', closedAt: null,
          bodyHtml: '<p>detail & more</p>',
        },
      ],
      {siteTitle: 'Fixture Status', siteUrl: 'https://status.example.com', updated: NOW}
    );
    expect(atom).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(atom).toContain('Outage &lt;&amp;&gt; &quot;quotes&quot;');
    expect(atom).not.toMatch(/<title>[^<]*<&>/);
    expect(atom).toContain('https://status.example.com');
    // Deterministic: same inputs → same bytes
    expect(atom).toBe(
      incidentsToAtom(
        [
          {
            issueNumber: 5, title: 'Outage <&> "quotes"', severity: 'major', status: 'open',
            entities: ['api'], createdAt: '2026-07-12T17:00:00.000Z', closedAt: null,
            bodyHtml: '<p>detail & more</p>',
          },
        ],
        {siteTitle: 'Fixture Status', siteUrl: 'https://status.example.com', updated: NOW}
      )
    );
  });
});
