/**
 * status/v1 data-contract tests (ADR-005 §2; epic #63 ticket #67).
 *
 * Every writer output must parse under the reader schema (round-trip),
 * unknown major versions must be rejected with actionable errors, and
 * the summary fixture must stay within the ADR's size target (~2–10 KB
 * for a five-entity site).
 */

import {
  STATUS_SCHEMA_VERSION,
  decodeDayRollups,
  encodeDayRollups,
  parseEntityDetail,
  parseRawIncidentBody,
  parseSummary,
  summarySchema,
} from '../src/status-v1';
import type {DayRollup, StatusSummary} from '../src/status-v1';

/**
 * A representative five-entity summary, exercising every branch.
 * Days use the COMPACT tuple encoding ([uptime, avgMs, worstChar]) with a
 * daysEnd anchor — the verbose per-day object form blew the ADR's 2-10 KB
 * summary budget (~29 KB for 5x90 objects vs ~7 KB for tuples).
 */
function buildFixtureSummary(): StatusSummary {
  const days = (uptime: number, avgMs: number | null) =>
    Array.from({length: 90}, () =>
      [uptime, avgMs, uptime === 100 ? 'u' : 'd'] as [number, number | null, 'u' | 'd']
    );
  const daysEnd = '2026-07-12';

  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAt: '2026-07-12T18:00:00.000Z',
    generatedBy: 'probe@0.1.0',
    entities: [
      {
        name: 'api',
        type: 'system',
        displayName: 'API',
        status: 'up',
        uptime: {d1: 100, d7: 99.98, d90: 99.95},
        responseTimeMs: {d1: 182},
        daysEnd,
        days: days(100, 180),
      },
      {
        name: 'web',
        type: 'system',
        status: 'degraded',
        uptime: {d1: 97.5, d7: 99.1, d90: 99.7},
        responseTimeMs: {d1: 450},
        daysEnd,
        days: days(97.5, 440),
      },
      {
        name: 'database',
        type: 'system',
        status: 'down',
        uptime: {d1: 42, d7: 90.2, d90: 98.8},
        responseTimeMs: {d1: null},
        daysEnd,
        days: days(42, null),
      },
      {
        name: 'onboarding',
        type: 'process',
        status: 'up',
        uptime: {d1: 100, d7: 100, d90: 100},
        responseTimeMs: {d1: null},
        daysEnd,
        days: days(100, null),
      },
      {
        name: 'cdn',
        type: 'system',
        status: 'maintenance',
        uptime: {d1: 99.9, d7: 99.9, d90: 99.9},
        responseTimeMs: {d1: 25},
        daysEnd,
        days: days(99.9, 25),
      },
    ],
    incidents: {
      open: [
        {
          issueNumber: 101,
          title: 'Database outage',
          severity: 'critical',
          status: 'open',
          entities: ['database'],
          createdAt: '2026-07-12T17:00:00.000Z',
          closedAt: null,
          bodyHtml: '<p>Investigating elevated error rates.</p>',
        },
      ],
      recent: [
        {
          issueNumber: 97,
          title: 'Web slowdown',
          severity: 'minor',
          status: 'resolved',
          entities: ['web'],
          createdAt: '2026-07-10T09:00:00.000Z',
          closedAt: '2026-07-10T11:30:00.000Z',
          bodyHtml: '<p>Resolved after cache flush.</p>',
        },
      ],
    },
    maintenance: {
      upcoming: [
        {
          issueNumber: 102,
          title: 'DB migration',
          start: '2026-07-14T02:00:00.000Z',
          end: '2026-07-14T04:00:00.000Z',
          status: 'upcoming',
          entities: ['database', 'api'],
          bodyHtml: '<p>Read-only mode during migration.</p>',
        },
      ],
      inProgress: [],
    },
  };
}

describe('summary round-trip', () => {
  it('writer output parses under the reader schema and is stable', () => {
    const summary = buildFixtureSummary();
    const json = JSON.stringify(summary);
    const parsed = parseSummary(JSON.parse(json));
    expect(parsed).toEqual(summary);
    // Round-trip twice: parse(stringify(parse(x))) === parse(x)
    expect(parseSummary(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('five-entity fixture stays within the ADR size target (~2-10 KB)', () => {
    const bytes = Buffer.byteLength(JSON.stringify(buildFixtureSummary()));
    expect(bytes).toBeGreaterThan(2_000);
    expect(bytes).toBeLessThan(10_000); // ADR-005 §2 target, compact day tuples
  });

  it('strips nothing silently: schema is strict about entity status values', () => {
    const bad = buildFixtureSummary() as any;
    bad.entities[0].status = 'exploded';
    expect(() => parseSummary(bad)).toThrow(/status/);
  });

  it('rejects a missing schemaVersion with an actionable error', () => {
    const {schemaVersion: _drop, ...rest} = buildFixtureSummary() as any;
    expect(() => parseSummary(rest)).toThrow(/schemaVersion/);
  });

  it('rejects an unknown FUTURE major version with an actionable error', () => {
    const future = {...buildFixtureSummary(), schemaVersion: 2};
    expect(() => parseSummary(future)).toThrow(
      /schemaVersion 2.*supports.*1|unsupported.*schemaVersion/i
    );
  });
});

describe('entity detail round-trip', () => {
  it('parses readings produced in the compact format', () => {
    const detail = {
      schemaVersion: STATUS_SCHEMA_VERSION,
      generatedAt: '2026-07-12T18:00:00.000Z',
      name: 'api',
      readings: [
        {t: 1783000000000, svc: 'api', state: 'up', code: 200, lat: 123},
        {t: 1783000300000, svc: 'api', state: 'down', code: 500, lat: 0, err: 'HTTP 500'},
      ],
    };
    const parsed = parseEntityDetail(JSON.parse(JSON.stringify(detail)));
    expect(parsed).toEqual(detail);
  });

  it('rejects readings with unknown states', () => {
    const detail = {
      schemaVersion: STATUS_SCHEMA_VERSION,
      generatedAt: '2026-07-12T18:00:00.000Z',
      name: 'api',
      readings: [{t: 1, svc: 'api', state: 'sideways', code: 200, lat: 1}],
    };
    expect(() => parseEntityDetail(detail)).toThrow();
  });
});

describe('raw provenance entries (sanitizer re-render source, ADR-005 §7)', () => {
  it('round-trips an issue markdown body', () => {
    const raw = {
      schemaVersion: STATUS_SCHEMA_VERSION,
      issueNumber: 101,
      updatedAt: '2026-07-12T17:05:00.000Z',
      bodyMarkdown: '## Outage\n\nRaw **markdown**, never the only copy.',
    };
    expect(parseRawIncidentBody(JSON.parse(JSON.stringify(raw)))).toEqual(raw);
  });
});

describe('day rollup encode/decode', () => {
  it('round-trips through the compact wire form', () => {
    const rollups: DayRollup[] = [
      {date: '2026-07-10', uptime: 100, avgMs: 120, worst: 'up'},
      {date: '2026-07-11', uptime: 97.2, avgMs: 300, worst: 'degraded'},
      {date: '2026-07-12', uptime: 40, avgMs: null, worst: 'down'},
    ];
    const encoded = encodeDayRollups(rollups);
    expect(encoded.daysEnd).toBe('2026-07-12');
    expect(encoded.days).toEqual([
      [100, 120, 'u'],
      [97.2, 300, 'g'],
      [40, null, 'd'],
    ]);
    expect(decodeDayRollups(encoded)).toEqual(rollups);
  });

  it('decode reconstructs dates backward across month boundaries', () => {
    const decoded = decodeDayRollups({
      daysEnd: '2026-07-01',
      days: [
        [100, 1, 'u'],
        [100, 1, 'u'],
        [100, 1, 'm'],
      ],
    });
    expect(decoded.map(d => d.date)).toEqual(['2026-06-29', '2026-06-30', '2026-07-01']);
    expect(decoded[2].worst).toBe('maintenance');
  });

  it('encode rejects empty input', () => {
    expect(() => encodeDayRollups([])).toThrow(/at least one day/);
  });
});

describe('schema exports', () => {
  it('exposes the zod schema for composition by probe/plugin', () => {
    expect(summarySchema.safeParse(buildFixtureSummary()).success).toBe(true);
  });
});
