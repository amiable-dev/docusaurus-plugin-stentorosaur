/**
 * TDD Tests for ADR-004: StatusDataProvider Context (#50)
 *
 * Context provider for centralized status data fetching.
 * Fetches daily-summary.json and current.json once, provides merged data to children.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { DailySummaryFile, DailySummaryEntry } from '../../src/types';

// Import context and hook (will fail until implemented)
import {
  StatusDataProvider,
  useStatusData,
  StatusDataContextValue,
  DayStatus,
} from '../../src/context/StatusDataProvider';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Test fixtures
const mockDailySummary: DailySummaryFile = {
  version: 1,
  lastUpdated: '2026-01-04T12:00:00Z',
  windowDays: 90,
  services: {
    api: [
      {
        date: '2026-01-03',
        uptimePct: 0.998,
        avgLatencyMs: 145,
        p95LatencyMs: 320,
        checksTotal: 144,
        checksPassed: 143,
        incidentCount: 1,
      },
      {
        date: '2026-01-02',
        uptimePct: 1.0,
        avgLatencyMs: 120,
        p95LatencyMs: 280,
        checksTotal: 144,
        checksPassed: 144,
        incidentCount: 0,
      },
    ],
    web: [
      {
        date: '2026-01-03',
        uptimePct: 0.95,
        avgLatencyMs: 200,
        p95LatencyMs: 500,
        checksTotal: 144,
        checksPassed: 137,
        incidentCount: 2,
      },
    ],
  },
};

// Function to create mock current.json data with correct timestamps
// Must be called after jest.setSystemTime to use mocked time
function createMockCurrentJson() {
  const now = Date.now();
  return {
    readings: [
      { t: now, svc: 'api', state: 'up', code: 200, lat: 130 },
      { t: now - 600000, svc: 'api', state: 'up', code: 200, lat: 140 },
      { t: now, svc: 'web', state: 'degraded', code: 200, lat: 250 },
    ],
  };
}

// Wrapper component for testing hooks
const createWrapper = (baseUrl: string = '/status-data') => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <StatusDataProvider baseUrl={baseUrl}>{children}</StatusDataProvider>
    );
  };
};

describe('ADR-004: StatusDataProvider Context (#50)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-04T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Context Value Structure', () => {
    it('should provide context value with correct shape', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDailySummary,
      });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      // Check all expected properties exist
      expect(result.current).toHaveProperty('dailySummary');
      expect(result.current).toHaveProperty('currentStatus');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('getMerged90Days');
      expect(result.current).toHaveProperty('refresh');
      expect(typeof result.current.getMerged90Days).toBe('function');
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useStatusData());
      }).toThrow(/must be used within a StatusDataProvider/i);

      consoleSpy.mockRestore();
    });
  });

  describe('Initialization and Loading', () => {
    it('should set loading true during initial fetch', () => {
      // Never resolve to keep loading state
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.dailySummary).toBeNull();
      expect(result.current.currentStatus).toBeNull();
    });

    it('should fetch daily-summary.json and current.json in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper('/status-data'),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify both files were fetched
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith('/status-data/daily-summary.json');
      expect(mockFetch).toHaveBeenCalledWith('/status-data/current.json');
    });

    it('should set loading false after fetch completes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDailySummary,
      });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Data Merging - getMerged90Days', () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });
    });

    it('should merge today from current.json with history from summary', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');

      // Should have today (from current.json) + historical days
      expect(apiData.length).toBeGreaterThan(0);

      // First entry should be today
      const today = new Date().toISOString().split('T')[0];
      expect(apiData[0].date).toBe(today);
    });

    it('should return entries sorted by date descending (most recent first)', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');

      // Verify descending order
      for (let i = 1; i < apiData.length; i++) {
        expect(apiData[i - 1].date >= apiData[i].date).toBe(true);
      }
    });

    it('should limit results to 90 days by default', async () => {
      // Create mock with > 90 days of data
      const manyDays: DailySummaryEntry[] = [];
      for (let i = 0; i < 100; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        manyDays.push({
          date: date.toISOString().split('T')[0],
          uptimePct: 1.0,
          avgLatencyMs: 100,
          p95LatencyMs: 200,
          checksTotal: 144,
          checksPassed: 144,
          incidentCount: 0,
        });
      }

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockDailySummary,
            services: { api: manyDays },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');
      expect(apiData.length).toBeLessThanOrEqual(90);
    });

    it('should handle service not in summary gracefully', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Request data for non-existent service
      const unknownData = result.current.getMerged90Days('unknown-service');

      expect(unknownData).toEqual([]);
    });

    it('should return DayStatus objects with correct shape', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');

      if (apiData.length > 0) {
        const day = apiData[0];
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('uptimePercent');
        expect(day).toHaveProperty('incidents');
        expect(day).toHaveProperty('checksTotal');
        expect(day).toHaveProperty('checksPassed');
        expect(day).toHaveProperty('status');
        expect(['operational', 'degraded', 'outage', 'no-data']).toContain(
          day.status
        );
      }
    });

    it('should normalize dates to UTC', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');

      // All dates should be valid ISO date strings
      for (const day of apiData) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('Error Handling', () => {
    it('should set error when both files fail to load', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message).toMatch(/no data available/i);
    });

    it('should fallback to current.json when summary fails', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Summary not found'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not have error - fallback succeeded
      expect(result.current.error).toBeNull();
      expect(result.current.currentStatus).not.toBeNull();
    });

    it('should fallback to summary when current.json fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockRejectedValueOnce(new Error('Current not found'));

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not have error - fallback succeeded
      expect(result.current.error).toBeNull();
      expect(result.current.dailySummary).not.toBeNull();
    });

    it('should show warning when data is stale (>24h)', async () => {
      const staleData = {
        ...mockDailySummary,
        lastUpdated: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => staleData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/stale|outdated/i)
      );

      consoleSpy.mockRestore();
    });

    it('should handle HTTP error responses gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
    });
  });

  describe('Refresh', () => {
    it('should refetch data when refresh is called', async () => {
      const updatedSummary = {
        ...mockDailySummary,
        lastUpdated: '2026-01-04T14:00:00Z',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updatedSummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dailySummary?.lastUpdated).toBe(
        '2026-01-04T12:00:00Z'
      );

      // Trigger refresh
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.dailySummary?.lastUpdated).toBe(
        '2026-01-04T14:00:00Z'
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should reset error state on refresh', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();

      // Trigger refresh
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.dailySummary).not.toBeNull();
    });
  });

  describe('Uptime Status Calculation', () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDailySummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });
    });

    it('should mark day as operational when uptime >= 99%', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const apiData = result.current.getMerged90Days('api');
      const day100 = apiData.find((d) => d.uptimePercent === 100);

      if (day100) {
        expect(day100.status).toBe('operational');
      }
    });

    it('should mark day as degraded when uptime is 95-99%', async () => {
      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const webData = result.current.getMerged90Days('web');
      const degradedDay = webData.find(
        (d) => d.uptimePercent >= 95 && d.uptimePercent < 99
      );

      if (degradedDay) {
        expect(degradedDay.status).toBe('degraded');
      }
    });

    it('should mark day as outage when uptime < 95%', async () => {
      // Create data with low uptime
      const lowUptimeSummary = {
        ...mockDailySummary,
        services: {
          ...mockDailySummary.services,
          failing: [
            {
              date: '2026-01-03',
              uptimePct: 0.8,
              avgLatencyMs: 500,
              p95LatencyMs: 1000,
              checksTotal: 144,
              checksPassed: 115,
              incidentCount: 5,
            },
          ],
        },
      };

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => lowUptimeSummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createMockCurrentJson(),
        });

      const { result } = renderHook(() => useStatusData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const failingData = result.current.getMerged90Days('failing');
      const outageDay = failingData.find((d) => d.uptimePercent < 95);

      if (outageDay) {
        expect(outageDay.status).toBe('outage');
      }
    });
  });
});
