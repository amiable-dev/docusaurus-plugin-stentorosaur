/**
 * mergeDaysIntoHistory (issue #114): the shared day-rollup → history
 * merge that lets long-range charts fill 90 days from the daily series
 * instead of the short readings window.
 */

import {mergeDaysIntoHistory} from '../src/theme/StatusPage/mergeDays';
import type {DayRollup} from '@stentorosaur/core';
import type {StatusCheckHistory} from '../src/types';

const reading = (iso: string, responseTime = 40): StatusCheckHistory => ({
  timestamp: iso,
  status: 'up',
  code: 200,
  responseTime,
});

const day = (date: string, over: Partial<DayRollup> = {}): DayRollup => ({
  date,
  uptime: 100,
  avgMs: 30,
  worst: 'up',
  ...over,
});

describe('mergeDaysIntoHistory', () => {
  it('fills older days from the rollups while keeping recent readings (the #114 fix)', () => {
    // Two days of sub-daily readings; rollups span 90 days.
    const history = [
      reading('2026-07-14T06:00:00.000Z'),
      reading('2026-07-14T18:00:00.000Z'),
      reading('2026-07-15T06:00:00.000Z'),
    ];
    const days: DayRollup[] = [];
    const start = Date.parse('2026-04-17T00:00:00Z');
    for (let i = 0; i < 90; i++) {
      days.push(day(new Date(start + i * 86_400_000).toISOString().split('T')[0]));
    }

    const merged = mergeDaysIntoHistory(history, days, 90);

    // Every one of the 90 days is represented (older via rollups, the
    // two recent days via their readings) — no empty columns.
    const dates = new Set(merged.map(h => h.timestamp.split('T')[0]));
    expect(dates.size).toBe(90);
    // Recent days keep their high-resolution readings (3 checks across
    // 2 recent days) rather than being replaced by a single rollup.
    expect(merged.filter(h => h.timestamp.startsWith('2026-07-14')).length).toBe(2);
  });

  it('does not duplicate a day already covered by readings (existing wins)', () => {
    const history = [reading('2026-07-15T06:00:00.000Z', 11)];
    const days = [day('2026-07-15', {avgMs: 999})]; // same day, different value
    const merged = mergeDaysIntoHistory(history, days, 90);
    const jul15 = merged.filter(h => h.timestamp.startsWith('2026-07-15'));
    expect(jul15).toHaveLength(1);
    expect(jul15[0].responseTime).toBe(11); // the reading, not the rollup
  });

  it('maps rollup fields: down day → 500, avgMs → responseTime, worst → status', () => {
    const merged = mergeDaysIntoHistory([], [day('2026-05-01', {uptime: 0, worst: 'down', avgMs: null})], 90);
    expect(merged[0]).toMatchObject({status: 'down', code: 500, responseTime: 0});
  });

  it('returns history unchanged when there are no rollups', () => {
    const history = [reading('2026-07-15T06:00:00.000Z')];
    expect(mergeDaysIntoHistory(history, [], 90)).toBe(history);
  });

  it('clamps to the most recent daysToShow rollups', () => {
    const days = Array.from({length: 90}, (_, i) =>
      day(new Date(Date.parse('2026-04-17T00:00:00Z') + i * 86_400_000).toISOString().split('T')[0])
    );
    const merged = mergeDaysIntoHistory([], days, 30);
    expect(merged).toHaveLength(30);
    // Newest-first, and only the last 30 calendar days are present.
    expect(merged[0].timestamp.split('T')[0]).toBe(days[89].date);
    expect(merged[29].timestamp.split('T')[0]).toBe(days[60].date);
  });

  it('sorts newest-first', () => {
    const merged = mergeDaysIntoHistory(
      [reading('2026-07-15T06:00:00.000Z')],
      [day('2026-05-01'), day('2026-06-01')],
      90
    );
    const times = merged.map(h => new Date(h.timestamp).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
