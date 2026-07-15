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
import type {CompactReading, EntityRef, ProbeDispatchPayload} from '@stentorosaur/core';
import type {ObjectStore, PutOptions, StoredObject} from './object-store';
import {PreconditionFailedError} from './object-store';
import {V1, regenerateDerivedR2, writeReadingsBatch} from './r2-plane';

export const DISPATCH_EVENT_TYPE = 'stentorosaur-probe';

export interface WorkerEnv {
  /** Fine-grained PAT able to send repository_dispatch to the repo
   * (dispatch mode only — unused when STATUS_BUCKET is bound) */
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  /** JSON-encoded CheckTarget[] (see wrangler.toml template) */
  TARGETS: string;
  /** Override the dispatch event_type (default 'stentorosaur-probe') */
  DISPATCH_EVENT_TYPE?: string;
  /** Payload source label (default 'cf-worker') */
  SOURCE?: string;
  /** R2 bucket binding — presence selects Profile C direct-write mode
   * (ADR-006 §2; ticket #100) */
  STATUS_BUCKET?: R2BucketLike;
  /** Optional display metadata for regenerate (JSON EntityRef[]);
   * defaults to {name, type:'system'} derived from TARGETS */
  ENTITIES?: string;
  SITE_TITLE?: string;
  SITE_URL?: string;
}

/**
 * Minimal structural view of Cloudflare's R2Bucket — declared locally
 * so the package needs no @cloudflare/workers-types dependency.
 */
export interface R2ObjectLike {
  httpEtag: string;
  text(): Promise<string>;
}
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string,
    options?: {
      onlyIf?: {etagMatches?: string; etagDoesNotMatch?: string};
      httpMetadata?: {contentType?: string};
    }
  ): Promise<unknown | null>;
  list(options: {
    prefix: string;
    cursor?: string;
  }): Promise<{objects: Array<{key: string}>; truncated: boolean; cursor?: string}>;
  delete(key: string): Promise<void>;
}

/**
 * ObjectStore over the native R2 binding (no S3 API, no credentials —
 * the ADR-006 §2 trust model: the Worker holds only a bucket binding).
 * R2 conditional puts RETURN NULL on precondition failure instead of
 * throwing; mapped to PreconditionFailedError so the §3 retry in
 * regenerateDerivedR2 works identically on both planes.
 */
export class BindingObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2BucketLike) {}

  async get(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {body: await object.text(), etag: object.httpEtag};
  }

  async put(key: string, body: string, options: PutOptions = {}): Promise<{etag: string}> {
    const result = await this.bucket.put(key, body, {
      ...(options.ifMatch ? {onlyIf: {etagMatches: options.ifMatch}} : {}),
      ...(options.ifNoneMatch ? {onlyIf: {etagDoesNotMatch: options.ifNoneMatch}} : {}),
      httpMetadata: {contentType: options.contentType ?? 'application/json'},
    });
    if (result === null) throw new PreconditionFailedError(key);
    const written = await this.bucket.get(key);
    return {etag: written?.httpEtag ?? ''};
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({prefix, ...(cursor ? {cursor} : {})});
      keys.push(...page.objects.map(o => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
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
    let parsed: URL;
    try {
      parsed = new URL(target.url);
    } catch {
      throw new Error(`TARGETS[${i}].url is not a valid URL: ${target.url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`TARGETS[${i}].url must be http(s), got ${parsed.protocol}`);
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

function entitiesOf(env: WorkerEnv, targets: CheckTarget[]): EntityRef[] {
  if (env.ENTITIES) {
    const parsed = JSON.parse(env.ENTITIES) as EntityRef[];
    if (!Array.isArray(parsed) || parsed.some(e => !e?.name || !e?.type)) {
      throw new Error('ENTITIES must be a JSON array of {name, type, displayName?}');
    }
    return parsed;
  }
  return targets.map(t => ({name: t.system, type: 'system' as const}));
}

/**
 * Profile C probe cycle (ADR-006 §2): checks → immutable batch →
 * §3-ordered regenerate, all through the bucket binding. Zero GitHub
 * Actions, zero write credentials outside the binding.
 */
export async function runWorkerProbeR2(
  env: WorkerEnv,
  deps: WorkerDeps = {}
): Promise<{readings: CompactReading[]; attempts: number}> {
  if (!env.STATUS_BUCKET) throw new Error('runWorkerProbeR2 requires the STATUS_BUCKET binding');
  if (!env.TARGETS) throw new Error('worker env TARGETS is not set');
  const targets = parseTargets(env.TARGETS);
  const readings = await runChecks(targets, {fetchImpl: deps.fetchImpl, now: deps.now});
  const store = new BindingObjectStore(env.STATUS_BUCKET);
  const generatedAt = new Date(deps.now ?? Date.now()).toISOString();
  await writeReadingsBatch(store, readings, generatedAt, crypto.randomUUID().slice(0, 8));
  const result = await regenerateDerivedR2(store, {
    generatedAt,
    generatedBy: 'stentorosaur-worker',
    entities: entitiesOf(env, targets),
    siteTitle: env.SITE_TITLE ?? 'System Status',
    siteUrl: env.SITE_URL ?? `https://github.com/${env.GITHUB_OWNER ?? 'unknown'}/${env.GITHUB_REPO ?? 'unknown'}`,
  });
  return {readings, attempts: result.attempts};
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'if-none-match',
};

/**
 * Serving route (ADR-006 §2): GET/HEAD status/v1/* from the bucket with
 * Cache-Control + strong ETag + 304 + CORS. MUST be fronted by a
 * Cloudflare custom domain so the CDN absorbs client polls (council
 * condition 4) — the wrangler template documents this as REQUIRED.
 */
export async function serveStatusV1(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: CORS_HEADERS});
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', {status: 405, headers: CORS_HEADERS});
  }
  if (!env.STATUS_BUCKET) {
    return new Response('no bucket bound', {status: 404, headers: CORS_HEADERS});
  }
  const path = new URL(request.url).pathname.replace(/^\/+/, '');
  if (!path.startsWith(`${V1}/`)) {
    return new Response('not found', {status: 404, headers: CORS_HEADERS});
  }
  const object = await env.STATUS_BUCKET.get(path);
  if (!object) return new Response('not found', {status: 404, headers: CORS_HEADERS});
  const etag = object.httpEtag;
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'cache-control': 'public, max-age=60',
    etag,
    'content-type': path.endsWith('.atom')
      ? 'application/atom+xml'
      : path.endsWith('.jsonl')
        ? 'application/x-ndjson'
        : 'application/json',
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {status: 304, headers});
  }
  const body = request.method === 'HEAD' ? null : await object.text();
  return new Response(body, {status: 200, headers});
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
    // Binding present → Profile C direct write; absent → §6 dispatch.
    if (env.STATUS_BUCKET) {
      await runWorkerProbeR2(env);
    } else {
      await runWorkerProbe(env);
    }
  },
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return serveStatusV1(request, env);
  },
};

export default worker;
