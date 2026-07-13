/**
 * Cloudflare Worker probe entry (ADR-005 §6; epic #63 ticket #76).
 *
 * Trust model (council-flagged): the Worker does NOT hold a
 * contents:write credential and never writes to git. It runs the checks
 * and sends a `repository_dispatch` event carrying the readings; the
 * receiving Action (templates/workflows/probe-dispatch-v1.yml) validates
 * the payload against the core schema and commits with its ephemeral
 * GITHUB_TOKEN via `stentorosaur ingest`.
 *
 * This module is Workers-portable: no node:* imports — only the fetch
 * check engine and the core schema. Import it via the
 * '@stentorosaur/probe/worker' subpath so bundlers never see the git/fs
 * halves of the package.
 */

import {runChecks} from './check';
import type {CheckTarget} from './check';
import {parseProbeDispatch} from '@stentorosaur/core';
import type {CompactReading, ProbeDispatchPayload} from '@stentorosaur/core';

export const DISPATCH_EVENT_TYPE = 'stentorosaur-probe';

export interface WorkerEnv {
  /** Fine-grained PAT able to send repository_dispatch to the repo */
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  /** JSON-encoded CheckTarget[] (see wrangler.toml template) */
  TARGETS: string;
  /** Override the dispatch event_type (default 'stentorosaur-probe') */
  DISPATCH_EVENT_TYPE?: string;
  /** Payload source label (default 'cf-worker') */
  SOURCE?: string;
}

type FetchLike = typeof fetch;

export interface WorkerDeps {
  /** Injected for tests; used for BOTH health checks and the GitHub API */
  fetchImpl?: FetchLike;
  now?: number;
}

/** Parse and minimally validate the TARGETS env JSON. */
export function parseTargets(json: string): CheckTarget[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('TARGETS is not valid JSON — expected a JSON array of {system, url, ...}');
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('TARGETS must be a non-empty JSON array of {system, url, ...}');
  }
  for (const [i, t] of raw.entries()) {
    const target = t as Partial<CheckTarget>;
    if (typeof target?.system !== 'string' || target.system.length === 0 || typeof target?.url !== 'string') {
      throw new Error(`TARGETS[${i}] must have string 'system' and 'url'`);
    }
  }
  return raw as CheckTarget[];
}

/** Self-validating: the Worker never sends what ingest would reject. */
export function buildDispatchPayload(
  readings: CompactReading[],
  source: string
): ProbeDispatchPayload {
  return parseProbeDispatch({schemaVersion: 1, source, readings});
}

export interface DispatchOptions {
  owner: string;
  repo: string;
  token: string;
  payload: ProbeDispatchPayload;
  eventType?: string;
  fetchImpl?: FetchLike;
}

export async function sendRepositoryDispatch(options: DispatchOptions): Promise<void> {
  const {owner, repo, token, payload, eventType = DISPATCH_EVENT_TYPE} = options;
  const fetchFn = options.fetchImpl ?? (fetch as FetchLike);
  const response = await fetchFn(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'stentorosaur-worker',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({event_type: eventType, client_payload: payload}),
  });
  if (response.status !== 204) {
    let detail = '';
    try {
      detail = ` — ${await response.text()}`;
    } catch {
      // response body unavailable; status alone is enough
    }
    throw new Error(`repository_dispatch failed: HTTP ${response.status}${detail}`);
  }
}

export interface WorkerProbeResult {
  readings: CompactReading[];
  dispatched: boolean;
}

export async function runWorkerProbe(env: WorkerEnv, deps: WorkerDeps = {}): Promise<WorkerProbeResult> {
  for (const key of ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'TARGETS'] as const) {
    if (!env[key]) throw new Error(`worker env ${key} is not set`);
  }
  const targets = parseTargets(env.TARGETS);
  const readings = await runChecks(targets, {fetchImpl: deps.fetchImpl, now: deps.now});
  if (readings.length === 0) return {readings, dispatched: false};

  const payload = buildDispatchPayload(readings, env.SOURCE ?? 'cf-worker');
  await sendRepositoryDispatch({
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    token: env.GITHUB_TOKEN,
    payload,
    eventType: env.DISPATCH_EVENT_TYPE,
    fetchImpl: deps.fetchImpl,
  });
  return {readings, dispatched: true};
}

/**
 * Default export in the Workers module shape: wrangler wires
 * `scheduled` to the cron trigger in wrangler.toml.
 */
const worker = {
  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    await runWorkerProbe(env);
  },
};

export default worker;
