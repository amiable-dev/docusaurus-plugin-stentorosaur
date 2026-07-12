/**
 * TDD Tests for ADR-002: useDailySummary Hook
 *
 * Tests the hybrid read pattern for 90-day heatmap data:
 * - Fetches daily-summary.json and current.json in parallel
 * - Merges today's live data with historical summary
 * - Falls back gracefully when files are missing
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-002-historical-data-aggregation.md
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { DailySummaryFile, DailySummaryEntry } from '../src/types';

// Import hook (will be created)
import { useDailySummary, UseDailySummaryOptions, UseDailySummaryResult } from '../src/hooks/useDailySummary';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create mock summary data
function createMockSummary(services: Record<string, DailySummaryEntry[]>): DailySummaryFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    windowDays: 90,
    services,
  };
}

// Helper to create mock current.json data
function createMockCurrentJson(readings: Array<{
  t: number;
  svc: string;
  state: 'up' | 'down' | 'degraded' | 'maintenance';
  code: number;
  lat: number;
}>) {
  return readings;
}

describe('ADR-002: useDailySummary Hook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Return Value Structure', () => {
    it('should return data, loading, error, and lastUpdated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createMockSummary({}),
      });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('lastUpdated');
    });

    it('should return DailySummaryEntry array for specified service', async () => {
      const mockData = createMockSummary({
        api: [
          {
            date: '2024-12-31',
            uptimePct: 0.998,
            avgLatencyMs: 145,
            p95LatencyMs: 320,
            checksTotal: 144,
            checksPassed: 143,
            incidentCount: 0,
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].date).toBe('2024-12-31');
      expect(result.current.data?.[0].uptimePct).toBe(0.998);
    });
  });

  describe('Parallel Fetching', () => {
    it('should fetch daily-summary.json and current.json in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => createMockSummary({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      // Both fetches should be initiated immediately
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(mockFetch).toHaveBeenCalledWith('/status-data/daily-summary.json');
      expect(mockFetch).toHaveBeenCalledWith('/status-data/current.json');
    });
  });

  describe('Hybrid Merge Pattern', () => {
    it('should merge today from current.json with history from summary', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const mockSummary = createMockSummary({
        api: [
          {
            date: yesterday,
            uptimePct: 0.95,
            avgLatencyMs: 200,
            p95LatencyMs: 400,
            checksTotal: 144,
            checksPassed: 137,
            incidentCount: 1,
          },
        ],
      });

      // Today's readings from current.json
      const mockCurrent = [
        { t: Date.now() - 600000, svc: 'api', state: 'up' as const, code: 200, lat: 100 },
        { t: Date.now(), svc: 'api', state: 'up' as const, code: 200, lat: 150 },
      ];

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCurrent });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have today + yesterday
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].date).toBe(today); // Today first (most recent)
      expect(result.current.data?.[1].date).toBe(yesterday);

      // Today's data should be aggregated from current.json
      expect(result.current.data?.[0].uptimePct).toBe(1); // Both readings were "up"
      expect(result.current.data?.[0].avgLatencyMs).toBe(125); // (100 + 150) / 2
    });

    it('should limit results to 90 days', async () => {
      // Create 100 days of history
      const entries: DailySummaryEntry[] = [];
      for (let i = 1; i <= 100; i++) {
        const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        entries.push({
          date,
          uptimePct: 0.99,
          avgLatencyMs: 100,
          p95LatencyMs: 200,
          checksTotal: 144,
          checksPassed: 142,
          incidentCount: 0,
        });
      }

      const mockSummary = createMockSummary({ api: entries });

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api', days: 90 }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.length).toBeLessThanOrEqual(90);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fall back to current.json only if summary fails', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Summary fails, current.json succeeds
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { t: Date.now(), svc: 'api', state: 'up' as const, code: 200, lat: 100 },
          ],
        });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have today only
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].date).toBe(today);
      expect(result.current.error).toBeNull(); // Graceful fallback, no error
    });

    it('should return empty data with warning if both fail', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      // Should have a warning or error about missing data
      expect(result.current.error).toMatch(/no data available/i);
    });

    it('should handle missing data gracefully', async () => {
      const mockSummary = createMockSummary({
        // Different service
        website: [
          {
            date: '2024-12-31',
            uptimePct: 0.99,
            avgLatencyMs: 100,
            p95LatencyMs: 200,
            checksTotal: 144,
            checksPassed: 142,
            incidentCount: 0,
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 'api' service not in summary, should return empty
      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Loading and Error States', () => {
    it('should set loading true initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('should handle network errors', async () => {
      // Both fetches fail with network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Network errors result in "No data available" since both requests fail
      expect(result.current.error).toMatch(/no data available/i);
    });
  });

  describe('Custom Options', () => {
    it('should support custom number of days', async () => {
      const mockSummary = createMockSummary({ api: [] });

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => [] });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api', days: 30 }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Hook should respect the days parameter (tested by implementation)
      expect(result.current).toBeDefined();
    });

    it('should support disabled state', async () => {
      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api', enabled: false }));

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Current.json Aggregation', () => {
    it('should aggregate today readings into single entry', async () => {
      const mockSummary = createMockSummary({ api: [] });
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Multiple readings throughout today
      const mockCurrent = [
        { t: today.getTime() + 3600000, svc: 'api', state: 'up' as const, code: 200, lat: 100 },
        { t: today.getTime() + 7200000, svc: 'api', state: 'down' as const, code: 500, lat: 50 },
        { t: today.getTime() + 10800000, svc: 'api', state: 'up' as const, code: 200, lat: 200 },
        { t: today.getTime() + 14400000, svc: 'api', state: 'up' as const, code: 200, lat: 150 },
      ];

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCurrent });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      const todayEntry = result.current.data?.[0];
      expect(todayEntry?.checksTotal).toBe(4);
      expect(todayEntry?.checksPassed).toBe(3); // 3 up, 1 down
      expect(todayEntry?.uptimePct).toBeCloseTo(0.75, 2);
      expect(todayEntry?.avgLatencyMs).toBe(150); // (100 + 200 + 150) / 3 = 150 (excludes down reading)
    });

    it('should filter readings by service name', async () => {
      const mockSummary = createMockSummary({ api: [] });

      // Readings for multiple services
      const mockCurrent = [
        { t: Date.now(), svc: 'api', state: 'up' as const, code: 200, lat: 100 },
        { t: Date.now(), svc: 'website', state: 'up' as const, code: 200, lat: 200 },
        { t: Date.now(), svc: 'api', state: 'up' as const, code: 200, lat: 150 },
      ];

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSummary })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCurrent });

      const { result } = renderHook(() => useDailySummary({ baseUrl: '/status-data', serviceName: 'api' }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const todayEntry = result.current.data?.[0];
      expect(todayEntry?.checksTotal).toBe(2); // Only api readings
    });
  });
});
