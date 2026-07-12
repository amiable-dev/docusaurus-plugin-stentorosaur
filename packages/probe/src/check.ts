/**
 * HTTP check engine (ADR-005 §1/§6; ticket #69). Native fetch with
 * AbortController timeouts; status semantics are monitor.js parity:
 *   code 0 / unexpected → down; slower than maxResponseTime → degraded;
 *   otherwise up.
 * Checks run in PARALLEL — per-entity output files (files.ts) make that
 * safe; the v0.4.10 sequential constraint existed only because of the
 * legacy shared hot file.
 */

import type {CompactReading} from '@stentorosaur/core';

export interface CheckTarget {
  system: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  timeout?: number;
  expectedCodes?: number[];
  maxResponseTime?: number;
}

export const CHECK_DEFAULTS = {
  method: 'GET' as const,
  timeout: 10_000,
  expectedCodes: [200],
  maxResponseTime: 30_000,
};

/** monitor.js parity. */
export function determineStatus(
  statusCode: number,
  responseTime: number,
  expectedCodes: number[],
  maxResponseTime: number
): 'up' | 'degraded' | 'down' {
  if (statusCode === 0 || !expectedCodes.includes(statusCode)) {
    return 'down';
  }
  if (responseTime > maxResponseTime) {
    return 'degraded';
  }
  return 'up';
}

/**
 * Perform one check. `t` is the reading timestamp (injected by the
 * caller so a run's readings share a coherent clock).
 */
export async function checkEndpoint(
  target: CheckTarget,
  t: number,
  fetchImpl: typeof fetch = fetch
): Promise<CompactReading> {
  const method = target.method ?? CHECK_DEFAULTS.method;
  const timeout = target.timeout ?? CHECK_DEFAULTS.timeout;
  const expectedCodes = target.expectedCodes ?? CHECK_DEFAULTS.expectedCodes;
  const maxResponseTime = target.maxResponseTime ?? CHECK_DEFAULTS.maxResponseTime;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = Date.now();

  let statusCode = 0;
  let error: string | undefined;
  try {
    const response = await fetchImpl(target.url, {
      method,
      signal: controller.signal,
      redirect: 'manual', // a 3xx is a real observation, not something to follow
      headers: {'user-agent': 'stentorosaur-probe/1.0'},
    });
    statusCode = response.status;
    // Drain the body so sockets are freed.
    await response.arrayBuffer().catch(() => undefined);
  } catch (err) {
    statusCode = 0;
    error = controller.signal.aborted
      ? 'Timeout'
      : err instanceof Error
        ? (err as NodeJS.ErrnoException).cause instanceof Error
          ? ((err as NodeJS.ErrnoException).cause as Error).message
          : err.message
        : String(err);
  } finally {
    clearTimeout(timer);
  }

  const responseTime = Date.now() - startedAt;
  const state = determineStatus(statusCode, responseTime, expectedCodes, maxResponseTime);

  const reading: CompactReading = {
    t,
    svc: target.system,
    state,
    code: statusCode,
    lat: responseTime,
  };
  if (error) {
    reading.err = error;
  } else if (state === 'down') {
    reading.err = `HTTP ${statusCode}`;
  }
  return reading;
}

export interface RunChecksOptions {
  /** Max simultaneous checks (default: all targets at once) */
  concurrency?: number;
  /** Shared reading timestamp; defaults to run start */
  now?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Check every target, in parallel up to `concurrency`. Results preserve
 * target order regardless of completion order.
 */
export async function runChecks(
  targets: CheckTarget[],
  options: RunChecksOptions = {}
): Promise<CompactReading[]> {
  const {concurrency, now = Date.now(), fetchImpl} = options;
  // Sanitize: NaN/0/negative concurrency must never yield zero workers
  // (Array.from with NaN length resolves instantly with no checks run).
  const requested = Number.isFinite(concurrency) && (concurrency as number) >= 1
    ? Math.floor(concurrency as number)
    : targets.length || 1;
  const workers = Math.max(1, Math.min(requested, targets.length || 1));

  const results = new Array<CompactReading>(targets.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= targets.length) return;
      results[index] = await checkEndpoint(targets[index], now, fetchImpl);
    }
  }

  await Promise.all(Array.from({length: workers}, worker));
  return results;
}
