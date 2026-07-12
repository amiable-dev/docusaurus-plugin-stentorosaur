/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-004: StatusDataProvider Context
 *
 * Centralized context provider for status data fetching.
 * Fetches daily-summary.json and current.json once, provides merged data to children.
 *
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  aggregateDayReadings,
  calculateStatusFromUptime,
  groupReadingsByDate,
} from '@stentorosaur/core';
import type { CompactReading } from '@stentorosaur/core';
import type { DailySummaryFile, DailySummaryEntry } from '../types';

/**
 * Compact reading format from current.json (shared core type, ADR-005)
 */
type CurrentReading = CompactReading;

/**
 * Current status file structure
 */
interface CurrentStatus {
  readings: CurrentReading[];
}

/**
 * Day status for UptimeBar visualization
 */
export interface DayStatus {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Uptime percentage (0-100) */
  uptimePercent: number;
  /** Number of incidents */
  incidents: number;
  /** Total checks performed */
  checksTotal: number;
  /** Successful checks */
  checksPassed: number;
  /** Computed status based on uptime thresholds */
  status: 'operational' | 'degraded' | 'outage' | 'no-data';
  /** Average latency in ms (optional) */
  avgLatencyMs?: number | null;
  /** P95 latency in ms (optional) */
  p95LatencyMs?: number | null;
}

/**
 * Context value shape for StatusDataProvider
 */
export interface StatusDataContextValue {
  /** Daily summary data (days 1-89) */
  dailySummary: DailySummaryFile | null;
  /** Current status data (today's readings) */
  currentStatus: CurrentStatus | null;
  /** Whether data is being fetched */
  loading: boolean;
  /** Error if data fetch failed */
  error: Error | null;
  /**
   * Get merged 90-day data for a service.
   * Combines today from current.json with history from daily-summary.json.
   */
  getMerged90Days: (serviceName: string) => DayStatus[];
  /** Refetch data */
  refresh: () => Promise<void>;
}

/**
 * Props for StatusDataProvider
 */
export interface StatusDataProviderProps {
  /** Base URL for status data files (e.g., '/status-data') */
  baseUrl: string;
  /** Children to render */
  children: ReactNode;
}

// Create context with undefined default (will throw if used outside provider)
const StatusDataContext = createContext<StatusDataContextValue | undefined>(
  undefined
);

/**
 * Stale data threshold (24 hours in milliseconds)
 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Aggregate readings for a specific day into a DayStatus
 * (math lives in @stentorosaur/core, ADR-005)
 */
function dayReadingsToDayStatus(
  date: string,
  readings: CurrentReading[]
): DayStatus {
  const day = aggregateDayReadings(date, readings);
  return {
    date: day.date,
    uptimePercent: day.uptimeFraction * 100,
    incidents: day.incidentCount,
    checksTotal: day.checksTotal,
    checksPassed: day.checksPassed,
    status: day.status,
    avgLatencyMs: day.avgLatencyMs,
    p95LatencyMs: day.p95LatencyMs,
  };
}

/**
 * Convert DailySummaryEntry to DayStatus
 */
function summaryEntryToDayStatus(entry: DailySummaryEntry): DayStatus {
  const uptimePercent = entry.uptimePct * 100;
  return {
    date: entry.date,
    uptimePercent,
    incidents: entry.incidentCount,
    checksTotal: entry.checksTotal,
    checksPassed: entry.checksPassed,
    status: calculateStatusFromUptime(uptimePercent, entry.checksTotal),
    avgLatencyMs: entry.avgLatencyMs,
    p95LatencyMs: entry.p95LatencyMs,
  };
}

/**
 * StatusDataProvider component
 *
 * Provides centralized status data fetching and caching for child components.
 * Implements the hybrid read pattern from ADR-002:
 * - Fetches daily-summary.json for historical data (days 1-89)
 * - Fetches current.json for today's live data
 * - Merges them for complete 90-day view
 */
export function StatusDataProvider({
  baseUrl,
  children,
}: StatusDataProviderProps): React.ReactElement {
  const [dailySummary, setDailySummary] = useState<DailySummaryFile | null>(
    null
  );
  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [currentFailed, setCurrentFailed] = useState(false);

  /**
   * Fetch both data files in parallel
   */
  const fetchData = useCallback(async () => {
    console.log('[StatusDataProvider] Starting fetch from baseUrl:', baseUrl);
    setLoading(true);
    setError(null);
    setSummaryFailed(false);
    setCurrentFailed(false);

    let summaryOk = false;
    let currentOk = false;

    try {
      // Fetch both files in parallel
      const summaryUrl = `${baseUrl}/daily-summary.json`;
      const currentUrl = `${baseUrl}/current.json`;
      console.log('[StatusDataProvider] Fetching:', summaryUrl, currentUrl);

      const [summaryResponse, currentResponse] = await Promise.all([
        fetch(summaryUrl).catch((e) => { console.error('[StatusDataProvider] Summary fetch error:', e); return null; }),
        fetch(currentUrl).catch((e) => { console.error('[StatusDataProvider] Current fetch error:', e); return null; }),
      ]);

      // Handle summary response
      console.log('[StatusDataProvider] Summary response:', summaryResponse?.ok, summaryResponse?.status);
      if (summaryResponse?.ok) {
        try {
          const data = await summaryResponse.json();
          console.log('[StatusDataProvider] Parsed daily-summary:', {
            version: data.version,
            lastUpdated: data.lastUpdated,
            serviceKeys: data.services ? Object.keys(data.services) : 'no services',
          });
          setDailySummary(data);
          summaryOk = true;

          // Check for stale data
          if (data.lastUpdated) {
            const lastUpdatedTime = new Date(data.lastUpdated).getTime();
            const now = Date.now();
            if (now - lastUpdatedTime > STALE_THRESHOLD_MS) {
              console.warn(
                `[StatusDataProvider] Data is stale (last updated: ${data.lastUpdated})`
              );
            }
          }
        } catch (e) {
          console.error('[StatusDataProvider] JSON parse error for summary:', e);
          setSummaryFailed(true);
        }
      } else {
        console.warn('[StatusDataProvider] Summary fetch not ok:', summaryResponse?.status);
        setSummaryFailed(true);
      }

      // Handle current response
      if (currentResponse?.ok) {
        try {
          const data = await currentResponse.json();
          // Handle both array and object with readings property
          const readings = Array.isArray(data) ? data : data.readings || [];
          setCurrentStatus({ readings });
          currentOk = true;
        } catch {
          setCurrentFailed(true);
        }
      } else {
        setCurrentFailed(true);
      }

      // Only set error if both files failed
      if (!summaryOk && !currentOk) {
        console.error('[StatusDataProvider] Both fetches failed');
        setError(new Error('No data available'));
      }

      console.log('[StatusDataProvider] Fetch complete:', { summaryOk, currentOk });
      setLoading(false);
    } catch (err) {
      console.error('[StatusDataProvider] Unexpected error:', err);
      setError(
        err instanceof Error ? err : new Error('Network error')
      );
      setLoading(false);
    }
  }, [baseUrl]);

  // Fetch data on mount
  useEffect(() => {
    console.log('[StatusDataProvider] useEffect triggered, calling fetchData');
    fetchData();
  }, [fetchData]);

  /**
   * Get merged 90-day data for a service
   */
  const getMerged90Days = useCallback(
    (serviceName: string): DayStatus[] => {
      // Return empty array if no data or unknown service
      const lowerServiceName = serviceName.toLowerCase();

      console.log('[getMerged90Days] Called for:', serviceName, {
        hasDailySummary: !!dailySummary,
        hasServices: !!dailySummary?.services,
        availableServices: dailySummary?.services ? Object.keys(dailySummary.services) : [],
      });

      const entries: DayStatus[] = [];
      const today = new Date().toISOString().split('T')[0];

      // Get historical data from summary
      const historicalEntries =
        dailySummary?.services?.[lowerServiceName] ||
        dailySummary?.services?.[serviceName] ||
        [];

      console.log('[getMerged90Days] Historical entries:', historicalEntries.length);

      // Get today's readings from current.json
      const todayReadings = currentStatus?.readings
        ? groupReadingsByDate(currentStatus.readings, serviceName).get(today) ||
          []
        : [];

      // Add today's aggregated data if we have readings
      if (todayReadings.length > 0) {
        // Sort by timestamp for accurate incident counting
        todayReadings.sort((a, b) => a.t - b.t);
        entries.push(dayReadingsToDayStatus(today, todayReadings));
      }

      // Add historical entries (filter out today if it exists in summary)
      for (const entry of historicalEntries) {
        if (entry.date !== today) {
          entries.push(summaryEntryToDayStatus(entry));
        }
      }

      // Sort by date descending (most recent first)
      entries.sort((a, b) => b.date.localeCompare(a.date));

      // Limit to 90 days
      return entries.slice(0, 90);
    },
    [dailySummary, currentStatus]
  );

  /**
   * Refresh data (re-fetch)
   */
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Memoize context value
  const value = useMemo<StatusDataContextValue>(
    () => ({
      dailySummary,
      currentStatus,
      loading,
      error,
      getMerged90Days,
      refresh,
    }),
    [dailySummary, currentStatus, loading, error, getMerged90Days, refresh]
  );

  return (
    <StatusDataContext.Provider value={value}>
      {children}
    </StatusDataContext.Provider>
  );
}

/**
 * Hook to access status data context
 *
 * @throws Error if used outside StatusDataProvider
 */
export function useStatusData(): StatusDataContextValue {
  const context = useContext(StatusDataContext);
  if (context === undefined) {
    throw new Error('useStatusData must be used within a StatusDataProvider');
  }
  return context;
}

// Export types for consumers
export type { CurrentReading, CurrentStatus };
