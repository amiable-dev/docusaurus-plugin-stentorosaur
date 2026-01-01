/**
 * ADR-001: useStatusData Hook
 *
 * React hook for runtime data fetching based on DataSource configuration.
 * Handles:
 * - Strategy-based URL resolution
 * - Data fetching with loading/error states
 * - Schema validation via Zod
 * - Polling for real-time updates
 * - Cache busting for gist/CDN sources
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DataSource } from '../types';
import { buildFetchUrl } from '../data-source-resolver.client';
import { validateAndParseResponse, ValidatedStatusData } from '../data-source-validator';

/**
 * Options for the useStatusData hook
 */
export interface UseStatusDataOptions {
  /** Data source configuration */
  dataSource: DataSource;
  /** Initial data to show while loading */
  initialData?: ValidatedStatusData;
  /** Whether to enable fetching (default: true) */
  enabled?: boolean;
  /** Polling interval in milliseconds (0 = no polling) */
  pollInterval?: number;
}

/**
 * Return value from the useStatusData hook
 */
export interface UseStatusDataResult {
  /** Fetched and validated status data */
  data: ValidatedStatusData | null;
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Function to manually trigger a refetch */
  refetch: () => void;
}

/**
 * Custom hook for fetching status data based on DataSource configuration.
 *
 * @param options - Hook options
 * @returns Status data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useStatusData({
 *   dataSource: { strategy: 'github', owner: 'my-org', repo: 'my-repo' },
 *   pollInterval: 30000,
 * });
 * ```
 */
export function useStatusData(options: UseStatusDataOptions): UseStatusDataResult {
  const {
    dataSource,
    initialData = null,
    enabled = true,
    pollInterval = 0,
  } = options;

  const [data, setData] = useState<ValidatedStatusData | null>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Track previous dataSource to detect changes
  const prevDataSourceRef = useRef<string | null>(null);

  /**
   * Fetch status data from the resolved URL
   */
  const fetchData = useCallback(async () => {
    // Build fetch URL based on strategy
    let url = buildFetchUrl(dataSource);

    // Build-only strategy doesn't fetch
    if (url === null) {
      setLoading(false);
      return;
    }

    // In browser context, strip file:// prefix for static strategy
    // The path will be served from the web root
    if (url.startsWith('file://')) {
      url = url.replace('file://', '');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Validate and parse the response
      const validatedData = validateAndParseResponse(text);

      if (isMountedRef.current) {
        setData(validatedData);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        // Don't clear data on error - keep showing stale data
        if (!data && !initialData) {
          setData(null);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [dataSource, data, initialData]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Serialize dataSource for comparison
  const dataSourceKey = JSON.stringify(dataSource);

  // Initial fetch and refetch on dataSource change
  useEffect(() => {
    isMountedRef.current = true;

    // Don't fetch if disabled or build-only strategy
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (dataSource.strategy === 'build-only') {
      setLoading(false);
      if (initialData) {
        setData(initialData);
      }
      return;
    }

    // Check if dataSource changed
    if (prevDataSourceRef.current !== dataSourceKey) {
      prevDataSourceRef.current = dataSourceKey;
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, dataSourceKey, fetchData, initialData, dataSource.strategy]);

  // Polling effect
  useEffect(() => {
    if (!enabled || pollInterval <= 0 || dataSource.strategy === 'build-only') {
      return;
    }

    const intervalId = setInterval(() => {
      fetchData();
    }, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, fetchData, dataSource.strategy]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export default useStatusData;
