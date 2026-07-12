/**
 * TDD Tests for ADR-001: useStatusData Hook (Issue #41)
 *
 * These tests cover the React hook for runtime data fetching
 * based on the resolved DataSource configuration.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import type { DataSource } from '../src/types';

// Import hook (will fail until implemented)
import { useStatusData, UseStatusDataOptions, UseStatusDataResult } from '../src/hooks/useStatusData';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ADR-001: useStatusData Hook (Issue #41)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Return Value Structure', () => {
    it('should return data, loading, error, and refetch', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          services: [{ name: 'API', status: 'operational' }],
        }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refetch');
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('HTTP Strategy', () => {
    it('should fetch from URL for http strategy', async () => {
      const mockData = {
        services: [
          { name: 'API', status: 'operational' },
          { name: 'Web', status: 'degraded' },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockData),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://status.example.com/current.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://status.example.com/current.json',
        expect.any(Object)
      );
      expect(result.current.data?.services).toHaveLength(2);
      expect(result.current.error).toBeNull();
    });

    it('should append cache-busting parameter when cacheBust is true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://gist.githubusercontent.com/user/id/raw/status.json',
        cacheBust: true,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/gist\.githubusercontent\.com\/user\/id\/raw\/status\.json\?t=\d+$/),
        expect.any(Object)
      );
    });

    it('should handle URL with existing query params and cacheBust', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json?format=json',
        cacheBust: true,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/api\.example\.com\/status\.json\?format=json&t=\d+$/),
        expect.any(Object)
      );
    });
  });

  describe('GitHub Strategy', () => {
    it('should construct raw.githubusercontent.com URL for github strategy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        branch: 'status-data',
        path: 'current.json',
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json',
        expect.any(Object)
      );
    });

    it('should use default branch and path for github strategy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json',
        expect.any(Object)
      );
    });
  });

  describe('Static Strategy', () => {
    it('should fetch from relative path for static strategy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'static',
        path: '/status-data/current.json',
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/status-data/current.json',
        expect.any(Object)
      );
    });
  });

  describe('Build-Only Strategy', () => {
    it('should not fetch for build-only strategy', async () => {
      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      // Should immediately be not loading with no data
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return initial data for build-only strategy when provided', () => {
      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      const initialData = {
        services: [{ name: 'API', status: 'operational' as const }],
      };

      const { result } = renderHook(() =>
        useStatusData({ dataSource, initialData })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(initialData);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.data).toBeNull();
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toMatch(/404|Not Found/i);
      expect(result.current.data).toBeNull();
    });

    it('should handle invalid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => 'not valid json',
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toMatch(/invalid json/i);
      expect(result.current.data).toBeNull();
    });

    it('should handle schema validation errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ invalid: 'data' }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toMatch(/invalid status data/i);
      expect(result.current.data).toBeNull();
    });

    it('should handle payload size exceeding limit', async () => {
      // Create oversized payload
      const oversizedJson = JSON.stringify({
        services: Array.from({ length: 12000 }, (_, i) => ({
          name: `ServiceName${i.toString().padStart(5, '0')}${'X'.repeat(50)}`,
          status: 'operational',
          latency: 12345.67890,
        })),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => oversizedJson,
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toMatch(/exceeds maximum size/i);
      expect(result.current.data).toBeNull();
    });
  });

  describe('Refetch', () => {
    it('should refetch data when refetch is called', async () => {
      const mockData1 = { services: [{ name: 'API', status: 'operational' }] };
      const mockData2 = { services: [{ name: 'API', status: 'degraded' }] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData1),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData2),
        });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() => useStatusData({ dataSource }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.services[0].status).toBe('operational');

      // Trigger refetch
      act(() => {
        result.current.refetch();
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.services[0].status).toBe('degraded');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Disabled State', () => {
    it('should not fetch when enabled is false', async () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() =>
        useStatusData({ dataSource, enabled: false })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch when enabled changes from false to true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result, rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => useStatusData({ dataSource, enabled }),
        { initialProps: { enabled: false } }
      );

      expect(mockFetch).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Initial Data', () => {
    it('should use initialData while loading', async () => {
      // Delay the fetch response
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  text: async () =>
                    JSON.stringify({
                      services: [{ name: 'API', status: 'degraded' }],
                    }),
                }),
              1000
            )
          )
      );

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const initialData = {
        services: [{ name: 'API', status: 'operational' as const }],
      };

      const { result } = renderHook(() =>
        useStatusData({ dataSource, initialData })
      );

      // Should show initial data while loading
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toEqual(initialData);

      // Advance timers and wait for fetch to complete
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should now show fetched data
      expect(result.current.data?.services[0].status).toBe('degraded');
    });
  });

  describe('Polling', () => {
    it('should poll at specified interval when pollInterval is set', async () => {
      const mockData1 = { services: [{ name: 'API', status: 'operational' }] };
      const mockData2 = { services: [{ name: 'API', status: 'degraded' }] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData1),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData2),
        });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() =>
        useStatusData({ dataSource, pollInterval: 30000 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.services[0].status).toBe('operational');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timer by poll interval
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(result.current.data?.services[0].status).toBe('degraded');
      });
    });

    it('should not poll when pollInterval is 0 or undefined', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ services: [] }),
      });

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,
      };

      const { result } = renderHook(() =>
        useStatusData({ dataSource, pollInterval: 0 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timer significantly
      act(() => {
        jest.advanceTimersByTime(60000);
      });

      // Should still only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('DataSource Changes', () => {
    it('should refetch when dataSource changes', async () => {
      const mockData1 = { services: [{ name: 'API-1', status: 'operational' }] };
      const mockData2 = { services: [{ name: 'API-2', status: 'operational' }] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData1),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockData2),
        });

      const dataSource1: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status1.json',
        cacheBust: false,
      };

      const dataSource2: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status2.json',
        cacheBust: false,
      };

      const { result, rerender } = renderHook(
        ({ dataSource }: { dataSource: DataSource }) => useStatusData({ dataSource }),
        { initialProps: { dataSource: dataSource1 } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.services[0].name).toBe('API-1');

      rerender({ dataSource: dataSource2 });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.services[0].name).toBe('API-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
