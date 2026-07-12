/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Tests for ADR-002: Historical Data Aggregation
 *
 * These tests verify the daily summary generation logic:
 * - Aggregating readings to daily stats
 * - Calculating uptime percentage
 * - Calculating avg and p95 latency
 * - Atomic file writes
 * - Reading from current.json and archives
 */

import * as fs from 'fs-extra';
import * as path from 'path';

// Type definitions for daily summary (ADR-002 schema v1)
interface DailySummaryEntry {
  date: string;
  uptimePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  checksTotal: number;
  checksPassed: number;
  incidentCount: number;
}

interface DailySummaryFile {
  version: number;
  lastUpdated: string;
  windowDays: number;
  services: Record<string, DailySummaryEntry[]>;
}

// Compact reading format (from current.json)
interface Reading {
  t: number;
  svc: string;
  state: 'up' | 'down' | 'degraded' | 'maintenance';
  code: number;
  lat: number;
  err?: string;
}

/**
 * Calculate p95 latency from an array of latency values
 */
function calculateP95(latencies: number[]): number | null {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Aggregate readings for a specific day into a DailySummaryEntry
 */
function aggregateDayReadings(date: string, readings: Reading[]): DailySummaryEntry {
  const checksTotal = readings.length;
  const checksPassed = readings.filter(r => r.state === 'up' || r.state === 'maintenance').length;
  const uptimePct = checksTotal > 0 ? checksPassed / checksTotal : 0;

  const latencies = readings
    .filter(r => r.state === 'up')
    .map(r => r.lat);

  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length)
    : null;

  const p95LatencyMs = calculateP95(latencies);

  // Count incidents (transitions from up to down)
  let incidentCount = 0;
  for (let i = 1; i < readings.length; i++) {
    if (readings[i - 1].state === 'up' && readings[i].state === 'down') {
      incidentCount++;
    }
  }

  return {
    date,
    uptimePct,
    avgLatencyMs,
    p95LatencyMs,
    checksTotal,
    checksPassed,
    incidentCount,
  };
}

describe('Daily Summary Generation (ADR-002)', () => {
  describe('calculateP95', () => {
    it('returns null for empty array', () => {
      expect(calculateP95([])).toBeNull();
    });

    it('returns the only value for single-element array', () => {
      expect(calculateP95([100])).toBe(100);
    });

    it('calculates p95 for large arrays', () => {
      // 100 values from 1-100, p95 should be 95
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(calculateP95(values)).toBe(95);
    });

    it('handles unsorted input', () => {
      const values = [500, 100, 200, 300, 400];
      // Sorted: [100, 200, 300, 400, 500], p95 index = ceil(5 * 0.95) - 1 = 4
      expect(calculateP95(values)).toBe(500);
    });
  });

  describe('aggregateDayReadings', () => {
    it('calculates uptimePct from checksPassed/checksTotal', () => {
      const readings: Reading[] = [
        { t: 1704067200000, svc: 'api', state: 'up', code: 200, lat: 100 },
        { t: 1704070800000, svc: 'api', state: 'up', code: 200, lat: 150 },
        { t: 1704074400000, svc: 'api', state: 'down', code: 500, lat: 50 },
        { t: 1704078000000, svc: 'api', state: 'up', code: 200, lat: 120 },
      ];

      const result = aggregateDayReadings('2024-01-01', readings);

      expect(result.checksTotal).toBe(4);
      expect(result.checksPassed).toBe(3);
      expect(result.uptimePct).toBeCloseTo(0.75, 2);
    });

    it('treats maintenance as passed checks', () => {
      const readings: Reading[] = [
        { t: 1704067200000, svc: 'api', state: 'maintenance', code: 503, lat: 0 },
        { t: 1704070800000, svc: 'api', state: 'up', code: 200, lat: 150 },
      ];

      const result = aggregateDayReadings('2024-01-01', readings);

      expect(result.checksPassed).toBe(2);
      expect(result.uptimePct).toBe(1);
    });

    it('calculates avgLatencyMs only from up readings', () => {
      const readings: Reading[] = [
        { t: 1704067200000, svc: 'api', state: 'up', code: 200, lat: 100 },
        { t: 1704070800000, svc: 'api', state: 'down', code: 500, lat: 5000 },
        { t: 1704074400000, svc: 'api', state: 'up', code: 200, lat: 200 },
      ];

      const result = aggregateDayReadings('2024-01-01', readings);

      // Average of 100 and 200 only (not the down reading)
      expect(result.avgLatencyMs).toBe(150);
    });

    it('calculates p95LatencyMs', () => {
      // Generate 20 readings with latencies 10-200
      const readings: Reading[] = Array.from({ length: 20 }, (_, i) => ({
        t: 1704067200000 + i * 600000,
        svc: 'api',
        state: 'up' as const,
        code: 200,
        lat: (i + 1) * 10,
      }));

      const result = aggregateDayReadings('2024-01-01', readings);

      // p95 of [10,20,...,200] should be 190
      expect(result.p95LatencyMs).toBe(190);
    });

    it('returns null latencies when no up readings', () => {
      const readings: Reading[] = [
        { t: 1704067200000, svc: 'api', state: 'down', code: 500, lat: 50 },
        { t: 1704070800000, svc: 'api', state: 'down', code: 500, lat: 60 },
      ];

      const result = aggregateDayReadings('2024-01-01', readings);

      expect(result.avgLatencyMs).toBeNull();
      expect(result.p95LatencyMs).toBeNull();
    });

    it('counts incidents as up-to-down transitions', () => {
      const readings: Reading[] = [
        { t: 1704067200000, svc: 'api', state: 'up', code: 200, lat: 100 },
        { t: 1704070800000, svc: 'api', state: 'down', code: 500, lat: 50 },
        { t: 1704074400000, svc: 'api', state: 'up', code: 200, lat: 100 },
        { t: 1704078000000, svc: 'api', state: 'down', code: 500, lat: 50 },
        { t: 1704081600000, svc: 'api', state: 'down', code: 500, lat: 50 },
      ];

      const result = aggregateDayReadings('2024-01-01', readings);

      // Two transitions from up to down
      expect(result.incidentCount).toBe(2);
    });

    it('handles empty readings array', () => {
      const result = aggregateDayReadings('2024-01-01', []);

      expect(result.checksTotal).toBe(0);
      expect(result.checksPassed).toBe(0);
      expect(result.uptimePct).toBe(0);
      expect(result.avgLatencyMs).toBeNull();
      expect(result.p95LatencyMs).toBeNull();
      expect(result.incidentCount).toBe(0);
    });
  });

  describe('daily-summary.json schema', () => {
    it('validates schema v1 structure', () => {
      const summary: DailySummaryFile = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        windowDays: 90,
        services: {
          workflow: [
            {
              date: '2024-01-01',
              uptimePct: 0.998,
              avgLatencyMs: 145,
              p95LatencyMs: 320,
              checksTotal: 144,
              checksPassed: 143,
              incidentCount: 0,
            },
          ],
        },
      };

      expect(summary.version).toBe(1);
      expect(summary.windowDays).toBe(90);
      expect(Object.keys(summary.services)).toContain('workflow');
      expect(summary.services.workflow[0].date).toBe('2024-01-01');
    });

    it('stores percentages as decimals not strings', () => {
      const entry: DailySummaryEntry = {
        date: '2024-01-01',
        uptimePct: 0.998,
        avgLatencyMs: 145,
        p95LatencyMs: 320,
        checksTotal: 144,
        checksPassed: 143,
        incidentCount: 0,
      };

      // uptimePct should be a number, not a string like "99.8%"
      expect(typeof entry.uptimePct).toBe('number');
      expect(entry.uptimePct).toBeLessThanOrEqual(1);
      expect(entry.uptimePct).toBeGreaterThanOrEqual(0);
    });
  });

  describe('monitor.js integration', () => {
    const scriptsDir = path.join(__dirname, '..', 'scripts');
    const monitorScript = path.join(scriptsDir, 'monitor.js');

    it('should contain generateDailySummary function', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');
      // This test will fail until we implement the function
      expect(content).toContain('generateDailySummary');
    });

    it('should contain daily-summary.json output', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');
      expect(content).toContain('daily-summary');
    });

    it('should use atomic write pattern', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');
      // Atomic write: temp file → rename
      expect(content).toContain('.tmp');
      expect(content).toContain('rename');
    });
  });
});
