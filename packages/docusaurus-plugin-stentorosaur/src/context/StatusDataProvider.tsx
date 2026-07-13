/**
 * StatusDataProvider — v1.0 (ADR-005 §4, ticket #77).
 *
 * The uptime-bar day data now arrives INSIDE the summary the page
 * already holds (compact day tuples per entity), so this provider is a
 * pure derivation over props — no runtime fetching, no loading states.
 * The context shape is kept from ADR-004 so UptimeBar and friends
 * consume it unchanged.
 */

import React, {createContext, useContext, useMemo, type ReactNode} from 'react';
import {decodeDayRollups} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';

/** Day status for UptimeBar visualization. */
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

export interface StatusDataContextValue {
  /** Truthy once day data is available (always, in v1 — data is in props) */
  dailySummary: {source: 'status/v1'} | null;
  /** Kept for interface compatibility; v1 has no runtime fetch here */
  currentStatus: null;
  loading: boolean;
  error: Error | null;
  /** Last-N-days statuses for a service, NEWEST first */
  getMerged90Days: (serviceName: string) => DayStatus[];
}

const StatusDataContext = createContext<StatusDataContextValue | null>(null);

function statusFromDay(uptime: number, worst: string): DayStatus['status'] {
  if (worst === 'down' || uptime < 90) return 'outage';
  if (worst === 'degraded' || uptime < 99) return 'degraded';
  return 'operational';
}

export interface StatusDataProviderProps {
  summary: StatusSummary;
  children: ReactNode;
}

export function StatusDataProvider({summary, children}: StatusDataProviderProps): JSX.Element {
  const value = useMemo<StatusDataContextValue>(() => {
    const byService = new Map<string, DayStatus[]>();
    for (const entity of summary.entities) {
      const rollups = decodeDayRollups(entity);
      // Newest first — consumers slice(0, N) for "the last N days".
      const days: DayStatus[] = rollups
        .map(day => ({
          date: day.date,
          uptimePercent: day.uptime,
          incidents: 0,
          checksTotal: 1,
          checksPassed: day.uptime >= 100 ? 1 : 0,
          status: statusFromDay(day.uptime, day.worst),
          avgLatencyMs: day.avgMs,
        }))
        .reverse();
      byService.set(entity.name.toLowerCase(), days);
    }
    return {
      dailySummary: {source: 'status/v1'},
      currentStatus: null,
      loading: false,
      error: null,
      getMerged90Days: (serviceName: string) =>
        byService.get(serviceName.toLowerCase()) ?? [],
    };
  }, [summary]);

  return <StatusDataContext.Provider value={value}>{children}</StatusDataContext.Provider>;
}

export function useStatusData(): StatusDataContextValue {
  const context = useContext(StatusDataContext);
  if (!context) {
    throw new Error('useStatusData must be used within a StatusDataProvider');
  }
  return context;
}
