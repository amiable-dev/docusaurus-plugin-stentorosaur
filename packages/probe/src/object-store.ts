/**
 * Object-store abstraction for the R2 data plane (ADR-006 §1/§3;
 * epic #97 ticket #99).
 *
 * The R2 implementation speaks the S3-compatible API via aws4fetch
 * (SigV4 over fetch — the same client works in Node ≥20 and Cloudflare
 * Workers). Tests use MemoryObjectStore; the write pipeline in
 * r2-plane.ts is written against the interface, never a concrete store.
 */

import {AwsClient} from 'aws4fetch';

export interface PutOptions {
  /** Conditional put: only if the current ETag matches (ADR-006 §3) */
  ifMatch?: string;
  /** Conditional create: only if the object does NOT exist */
  ifNoneMatch?: '*';
  contentType?: string;
}

export interface StoredObject {
  body: string;
  etag: string;
}

/** Thrown when a conditional put loses the race (HTTP 412). */
export class PreconditionFailedError extends Error {
  constructor(key: string) {
    super(`precondition failed for ${key}`);
    this.name = 'PreconditionFailedError';
  }
}

export interface ObjectStore {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, body: string, options?: PutOptions): Promise<{etag: string}>;
  /** All keys under a prefix (paginated internally) */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Minimal XML entity decoding for S3 ListObjects keys — our keys are
 * generated ASCII, but a foreign object in the bucket must not corrupt
 * the listing (Council PR #106 r=1). */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strip trailing slashes — endpoint/publicBaseUrl are not normalized
 * at the schema (Council PR #105 note); every join happens here. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface R2StoreOptions {
  /** S3-compatible API endpoint, e.g. https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injected for tests */
  fetchImpl?: typeof fetch;
}

export class R2ObjectStore implements ObjectStore {
  private readonly client: AwsClient;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: R2StoreOptions) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    this.base = `${normalizeBaseUrl(options.endpoint)}/${options.bucket}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(key: string): string {
    return `${this.base}/${key.replace(/^\/+/, '')}`;
  }

  private async signedFetch(url: string, init: RequestInit): Promise<Response> {
    const signed = await this.client.sign(url, init);
    return this.fetchImpl(signed);
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.signedFetch(this.url(key), {method: 'GET'});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET ${key}: HTTP ${response.status}`);
    return {
      body: await response.text(),
      etag: response.headers.get('etag') ?? '',
    };
  }

  async put(key: string, body: string, options: PutOptions = {}): Promise<{etag: string}> {
    const headers: Record<string, string> = {
      'content-type': options.contentType ?? 'application/json',
    };
    if (options.ifMatch) headers['if-match'] = options.ifMatch;
    if (options.ifNoneMatch) headers['if-none-match'] = options.ifNoneMatch;
    const response = await this.signedFetch(this.url(key), {method: 'PUT', headers, body});
    if (response.status === 412) throw new PreconditionFailedError(key);
    if (!response.ok) throw new Error(`PUT ${key}: HTTP ${response.status}`);
    return {etag: response.headers.get('etag') ?? ''};
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const params = new URLSearchParams({'list-type': '2', prefix});
      if (token) params.set('continuation-token', token);
      const response = await this.signedFetch(`${this.base}?${params}`, {method: 'GET'});
      if (!response.ok) throw new Error(`LIST ${prefix}: HTTP ${response.status}`);
      const xml = await response.text();
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        keys.push(decodeXmlEntities(match[1]));
      }
      const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
      token = next?.[1];
    } while (token);
    return keys;
  }

  async delete(key: string): Promise<void> {
    const response = await this.signedFetch(this.url(key), {method: 'DELETE'});
    if (!response.ok && response.status !== 404) {
      throw new Error(`DELETE ${key}: HTTP ${response.status}`);
    }
  }
}

/**
 * In-memory store for tests: same semantics incl. ETags and
 * conditional puts, plus an operation log so tests can assert WRITE
 * ORDER (the ADR-006 §3 consistency model is an ordering contract).
 */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  readonly ops: Array<{op: 'get' | 'put' | 'list' | 'delete'; key: string}> = [];
  private etagCounter = 0;

  async get(key: string): Promise<StoredObject | null> {
    this.ops.push({op: 'get', key});
    return this.objects.get(key) ?? null;
  }

  async put(key: string, body: string, options: PutOptions = {}): Promise<{etag: string}> {
    this.ops.push({op: 'put', key});
    const existing = this.objects.get(key);
    if (options.ifMatch && (!existing || existing.etag !== options.ifMatch)) {
      throw new PreconditionFailedError(key);
    }
    if (options.ifNoneMatch === '*' && existing) {
      throw new PreconditionFailedError(key);
    }
    const etag = `"m${++this.etagCounter}"`;
    this.objects.set(key, {body, etag});
    return {etag};
  }

  async list(prefix: string): Promise<string[]> {
    this.ops.push({op: 'list', key: prefix});
    return [...this.objects.keys()].filter(k => k.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    this.ops.push({op: 'delete', key});
    this.objects.delete(key);
  }

  /** Test helper: keys currently stored. */
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
