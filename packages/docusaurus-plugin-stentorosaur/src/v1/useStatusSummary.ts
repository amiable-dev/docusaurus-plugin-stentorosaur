/**
 * THE client data hook (ADR-005 §4; epic #63 ticket #72).
 *
 * Implements the mandated fetch protocol:
 *  1. Render immediately from the SSG snapshot (stale-while-revalidate) —
 *     the page is never blank and never shows a loading skeleton.
 *  2. Background fetch with If-None-Match; 200 → validate + swap,
 *     304/invalid → keep current state.
 *  3. Failures: exponential backoff with full jitter (base 30s, cap
 *     15min); 429/403 pauses for the Retry-After window. The status page
 *     never hard-fails because the data plane is unreachable.
 *  4. Refetch on tab focus and on a timer no faster than the serving
 *     cache TTL (default 5 min).
 *  5. Responses parsed as JSON regardless of Content-Type (the
 *     raw.githubusercontent fallback serves text/plain).
 *
 * No dataUrl (e.g. private repos, ADR-005 §9) → pure snapshot mode.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {parseSummary} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 15 * 60_000;
const DEFAULT_REFRESH_MS = 5 * 60_000; // never poll faster than the CDN TTL

export interface UseStatusSummaryOptions {
  /** Build-time snapshot embedded by loadContent — always present */
  snapshot: StatusSummary;
  /** Public summary.json endpoint; absent → snapshot-only mode */
  dataUrl?: string;
  /** Refresh cadence (min-clamped to the default TTL) */
  refreshMs?: number;
  /** Injected for deterministic tests */
  jitter?: () => number;
  /** Test seams — production always uses the §4 constants */
  backoffBaseMs?: number;
  backoffCapMs?: number;
}

export interface UseStatusSummaryResult {
  summary: StatusSummary;
  source: 'snapshot' | 'live';
  /** Non-fatal diagnostics for debugging panels; never blocks rendering */
  lastError: string | null;
}

export function useStatusSummary(
  options: UseStatusSummaryOptions
): UseStatusSummaryResult {
  const {snapshot, dataUrl, jitter} = options;
  const refreshMs = Math.max(options.refreshMs ?? DEFAULT_REFRESH_MS, 1);
  const backoffBaseMs = options.backoffBaseMs ?? BACKOFF_BASE_MS;
  const backoffCapMs = options.backoffCapMs ?? BACKOFF_CAP_MS;

  const [state, setState] = useState<UseStatusSummaryResult>({
    summary: snapshot,
    source: 'snapshot',
    lastError: null,
  });

  const etagRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  const jitterMs = useCallback(
    () => (jitter ? jitter() : Math.random() * 1000),
    [jitter]
  );

  // Latest-ref pattern: callers (timers, focus handler, effect) always
  // invoke the CURRENT refetch without appearing in effect deps — an
  // inline jitter/option prop must never cause an effect re-run that
  // fires an extra fetch (that would defeat the backoff).
  const refetchRef = useRef<() => Promise<void>>(async () => {});

  const scheduleNext = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void refetchRef.current(), delay);
  }, []);

  const refetch = useCallback(async (): Promise<void> => {
    if (!dataUrl || !activeRef.current) return;
    if (Date.now() < pausedUntilRef.current) {
      scheduleNext(pausedUntilRef.current - Date.now() + jitterMs());
      return;
    }

    try {
      const headers: Record<string, string> = {accept: 'application/json'};
      if (etagRef.current) headers['if-none-match'] = etagRef.current;
      const response = await fetch(dataUrl, {headers});

      if (response.status === 304) {
        failuresRef.current = 0;
        scheduleNext(refreshMs + jitterMs());
        return;
      }
      if (response.status === 429 || response.status === 403) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const pauseMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffCapMs;
        pausedUntilRef.current = Date.now() + pauseMs;
        setState(s => ({...s, lastError: `rate limited (HTTP ${response.status})`}));
        scheduleNext(pauseMs + jitterMs());
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Content-type tolerant: parse the text as JSON regardless.
      const text = await response.text();
      const parsed = parseSummary(JSON.parse(text));
      etagRef.current = response.headers.get('etag');
      failuresRef.current = 0;
      if (activeRef.current) {
        setState({summary: parsed, source: 'live', lastError: null});
      }
      scheduleNext(refreshMs + jitterMs());
    } catch (error) {
      // Validation failures and network errors are equivalent here: keep
      // the current (snapshot or last-good) state and back off.
      failuresRef.current += 1;
      const backoff = Math.min(
        backoffBaseMs * 2 ** (failuresRef.current - 1),
        backoffCapMs
      );
      if (activeRef.current) {
        setState(s => ({
          ...s,
          lastError: error instanceof Error ? error.message : String(error),
        }));
      }
      scheduleNext(backoff + jitterMs());
    }
  }, [dataUrl, refreshMs, jitterMs, scheduleNext, backoffBaseMs, backoffCapMs]);

  refetchRef.current = refetch;

  useEffect(() => {
    if (!dataUrl) return undefined;
    activeRef.current = true;
    void refetchRef.current();

    const onFocus = () => {
      if (Date.now() >= pausedUntilRef.current) void refetchRef.current();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      activeRef.current = false;
      window.removeEventListener('focus', onFocus);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dataUrl]);

  return state;
}
