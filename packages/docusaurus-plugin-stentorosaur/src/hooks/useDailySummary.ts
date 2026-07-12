/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-002: useDailySummary Hook
 *
 * Implements the hybrid read pattern for 90-day heatmap data:
 * - Fetches daily-summary.json and current.json in parallel
 * - Merges today's live data with historical summary
 * - Falls back gracefully when files are missing
 *
 * @see docs/adrs/ADR-002-historical-data-aggregation.md
 */

import { useState, useEffect, useMemo } from 'react';
import {
  aggregateDayReadings as coreAggregateDayReadings,
  groupReadingsByDate,
} from '@stentorosaur/core';
import type { CompactReading } from '@stentorosaur/core';
import type { DailySummaryFile, DailySummaryEntry } from '../types';

/**
 * Compact reading format from current.json (shared core type, ADR-005)
 */
type CurrentReading = CompactReading;

/**
 * Options for useDailySummary hook
 */
export interface UseDailySummaryOptions {
  /** Base URL for fetching data (e.g., '/status-data') */
  baseUrl: string;
  /** Service name to get data for */
  serviceName: string;
  /** Number of days to return (default: 90) */
  days?: number;
  /** Whether to enable fetching (default: true) */
  enabled?: boolean;
}

/**
 * Result type for useDailySummary hook
 */
export interface UseDailySummaryResult {
  /** Array of daily summary entries (null while loading) */
  data: DailySummaryEntry[] | null;
  /** Whether data is currently being fetched */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** ISO timestamp of last data update */
  lastUpdated: string | null;
}

/**
 * Aggregate readings for a specific day into a DailySummaryEntry
 * (math lives in @stentorosaur/core, ADR-005)
 */
function aggregateDayReadings(date: string, readings: CurrentReading[]): DailySummaryEntry {
  const day = coreAggregateDayReadings(date, readings);
  return {
    date: day.date,
    uptimePct: day.uptimeFraction,
    avgLatencyMs: day.avgLatencyMs,
    p95LatencyMs: day.p95LatencyMs,
    checksTotal: day.checksTotal,
    checksPassed: day.checksPassed,
    incidentCount: day.incidentCount,
  };
}

/**
 * Hook for fetching and merging daily summary data with live data
 */
export function useDailySummary(options: UseDailySummaryOptions): UseDailySummaryResult {
  const { baseUrl, serviceName, days = 90, enabled = true } = options;

  const [summaryData, setSummaryData] = useState<DailySummaryFile | null>(null);
  const [currentData, setCurrentData] = useState<CurrentReading[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [currentFailed, setCurrentFailed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      setSummaryFailed(false);
      setCurrentFailed(false);

      try {
        // Fetch both files in parallel
        const [summaryResponse, currentResponse] = await Promise.all([
          fetch(`${baseUrl}/daily-summary.json`).catch(() => null),
          fetch(`${baseUrl}/current.json`).catch(() => null),
        ]);

        if (cancelled) return;

        // Handle summary response
        if (summaryResponse?.ok) {
          try {
            const data = await summaryResponse.json();
            setSummaryData(data);
          } catch {
            setSummaryFailed(true);
          }
        } else {
          setSummaryFailed(true);
        }

        // Handle current response
        if (currentResponse?.ok) {
          try {
            const data = await currentResponse.json();
            // Handle both array and object with readings property
            const readings = Array.isArray(data) ? data : (data.readings || []);
            setCurrentData(readings);
          } catch {
            setCurrentFailed(true);
          }
        } else {
          setCurrentFailed(true);
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
        setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, enabled]);

  // Merge summary data with today's live data
  const mergedData = useMemo((): DailySummaryEntry[] | null => {
    if (loading || !enabled) return null;

    const entries: DailySummaryEntry[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Get historical data from summary
    const historicalEntries = summaryData?.services?.[serviceName.toLowerCase()] || [];

    // Get today's readings from current.json
    const todayReadings = currentData
      ? groupReadingsByDate(currentData, serviceName).get(today) || []
      : [];

    // Add today's aggregated data if we have readings
    if (todayReadings.length > 0) {
      // Sort by timestamp for accurate incident counting
      todayReadings.sort((a, b) => a.t - b.t);
      entries.push(aggregateDayReadings(today, todayReadings));
    }

    // Add historical entries (filter out today if it exists in summary)
    for (const entry of historicalEntries) {
      if (entry.date !== today) {
        entries.push(entry);
      }
    }

    // Sort by date descending (most recent first)
    entries.sort((a, b) => b.date.localeCompare(a.date));

    // Limit to requested number of days
    return entries.slice(0, days);
  }, [summaryData, currentData, serviceName, days, loading]);

  // Determine error state
  const finalError = useMemo(() => {
    if (error) return error;
    if (summaryFailed && currentFailed) return 'No data available';
    return null;
  }, [error, summaryFailed, currentFailed]);

  return {
    data: mergedData,
    loading,
    error: finalError,
    lastUpdated: summaryData?.lastUpdated || null,
  };
}
