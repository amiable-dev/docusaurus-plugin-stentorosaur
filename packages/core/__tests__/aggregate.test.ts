import {
  aggregateDayReadings,
  aggregateSystem,
  averageRecentResponseTime,
  calculateAvgResponseTime,
  calculateP95,
  calculateStatusFromUptime,
  calculateUptimePercent,
  countIncidentTransitions,
  formatUptimePercent,
  groupReadingsByDate,
  groupReadingsBySystem,
  sortReadingsDesc,
} from '../src/aggregate';
import type {CompactReading} from '../src/types';

const r = (
  t: number,
  state: CompactReading['state'],
  lat: number,
  code = 200,
  svc = 'api'
): CompactReading => ({t, svc, state, code, lat});

describe('groupReadingsBySystem', () => {
  it('groups by svc preserving insertion order', () => {
    const readings = [r(1, 'up', 10), {...r(2, 'up', 20), svc: 'web'}, r(3, 'down', 0)];
    const map = groupReadingsBySystem(readings);
    expect([...map.keys()]).toEqual(['api', 'web']);
    expect(map.get('api')!.map(x => x.t)).toEqual([1, 3]);
  });
});

describe('sortReadingsDesc', () => {
  it('sorts most-recent-first without mutating input', () => {
    const input = [r(1, 'up', 10), r(3, 'up', 30), r(2, 'up', 20)];
    const sorted = sortReadingsDesc(input);
    expect(sorted.map(x => x.t)).toEqual([3, 2, 1]);
    expect(input.map(x => x.t)).toEqual([1, 3, 2]);
  });
});

describe('calculateUptimePercent / formatUptimePercent', () => {
  it('is up-count over total', () => {
    expect(
      calculateUptimePercent([r(1, 'up', 1), r(2, 'down', 0), r(3, 'up', 1), r(4, 'up', 1)])
    ).toBe(75);
  });
  it('returns 0 for empty input', () => {
    expect(calculateUptimePercent([])).toBe(0);
  });
  it('maintenance does NOT count as up at system level', () => {
    expect(calculateUptimePercent([r(1, 'maintenance', 1), r(2, 'up', 1)])).toBe(50);
  });
  it('formats with two decimals', () => {
    expect(formatUptimePercent(100)).toBe('100.00%');
    expect(formatUptimePercent(2 / 3 * 100)).toBe('66.67%');
  });
});

describe('calculateAvgResponseTime', () => {
  it('averages only up readings with 2xx codes, rounded', () => {
    const readings = [
      r(1, 'up', 100, 200),
      r(2, 'up', 200, 301), // non-2xx: excluded
      r(3, 'down', 999, 500), // down: excluded
      r(4, 'up', 101, 204),
    ];
    expect(calculateAvgResponseTime(readings)).toBe(Math.round((100 + 101) / 2));
  });
  it('returns undefined when no successful readings', () => {
    expect(calculateAvgResponseTime([r(1, 'down', 5, 500)])).toBeUndefined();
    expect(calculateAvgResponseTime([])).toBeUndefined();
  });
});

describe('averageRecentResponseTime', () => {
  it('averages the first N entries, rounded', () => {
    const entries = Array.from({length: 12}, (_, i) => ({responseTime: i + 1}));
    // first 10: 1..10 → avg 5.5 → round 6
    expect(averageRecentResponseTime(entries)).toBe(6);
  });
  it('handles fewer than N entries and empty input', () => {
    expect(averageRecentResponseTime([{responseTime: 7}])).toBe(7);
    expect(averageRecentResponseTime([])).toBeUndefined();
  });
});

describe('aggregateSystem', () => {
  it('produces latest, sorted history, uptime and avg', () => {
    const agg = aggregateSystem('api', [r(10, 'down', 0, 500), r(20, 'up', 50)]);
    expect(agg.latest.t).toBe(20);
    expect(agg.readingsDesc.map(x => x.t)).toEqual([20, 10]);
    expect(agg.uptimePercent).toBe(50);
    expect(agg.uptimeFormatted).toBe('50.00%');
    expect(agg.avgResponseTime).toBe(50);
  });
});

describe('calculateStatusFromUptime', () => {
  it.each([
    [100, 10, 'operational'],
    [99, 10, 'operational'],
    [98.99, 10, 'degraded'],
    [95, 10, 'degraded'],
    [94.99, 10, 'outage'],
    [100, 0, 'no-data'],
  ] as const)('%s%% over %s checks → %s', (pct, total, expected) => {
    expect(calculateStatusFromUptime(pct, total)).toBe(expected);
  });
});

describe('calculateP95', () => {
  it('uses nearest-rank on a sorted copy', () => {
    expect(calculateP95([5, 1, 3])).toBe(5); // ceil(3*0.95)-1 = 2 → sorted[2]
    expect(calculateP95([1])).toBe(1);
    expect(calculateP95([])).toBeNull();
  });
});

describe('countIncidentTransitions', () => {
  it('counts up→down transitions only', () => {
    const readings = [
      r(1, 'up', 1),
      r(2, 'down', 0),
      r(3, 'down', 0),
      r(4, 'up', 1),
      r(5, 'down', 0),
    ];
    expect(countIncidentTransitions(readings)).toBe(2);
  });
});

describe('aggregateDayReadings', () => {
  it('maintenance counts as passed; latency stats use up readings only', () => {
    const day = aggregateDayReadings('2026-07-01', [
      r(1, 'up', 100),
      r(2, 'maintenance', 0),
      r(3, 'down', 0, 500),
      r(4, 'up', 200),
    ]);
    expect(day.checksTotal).toBe(4);
    expect(day.checksPassed).toBe(3);
    expect(day.uptimeFraction).toBe(0.75);
    expect(day.avgLatencyMs).toBe(150);
    expect(day.p95LatencyMs).toBe(200);
    expect(day.incidentCount).toBe(0); // maintenance breaks the up→down pair
    expect(day.status).toBe('outage'); // 75% < 95
  });
  it('empty day is no-data', () => {
    const day = aggregateDayReadings('2026-07-01', []);
    expect(day.status).toBe('no-data');
    expect(day.uptimeFraction).toBe(0);
    expect(day.avgLatencyMs).toBeNull();
  });
});

describe('groupReadingsByDate', () => {
  const day1 = Date.UTC(2026, 6, 1, 12);
  const day2 = Date.UTC(2026, 6, 2, 0, 5);
  it('groups by UTC date and filters by service case-insensitively', () => {
    const readings = [
      r(day1, 'up', 1),
      {...r(day1 + 1000, 'up', 1), svc: 'API'},
      {...r(day2, 'up', 1), svc: 'other'},
      r(day2, 'down', 0),
    ];
    const groups = groupReadingsByDate(readings, 'api');
    expect([...groups.keys()]).toEqual(['2026-07-01', '2026-07-02']);
    expect(groups.get('2026-07-01')!.length).toBe(2);
    expect(groups.get('2026-07-02')!.length).toBe(1);
  });
  it('includes all services when no filter given', () => {
    const groups = groupReadingsByDate([
      r(day1, 'up', 1),
      {...r(day1, 'up', 1), svc: 'other'},
    ]);
    expect(groups.get('2026-07-01')!.length).toBe(2);
  });
});
