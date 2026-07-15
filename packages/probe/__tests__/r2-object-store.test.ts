/**
 * R2ObjectStore network-layer tests (Council PR #106 r=1: the concrete
 * S3-API client had zero direct coverage). fetch is injected; every
 * assertion runs against the REAL signing/pagination/error paths.
 */

import {PreconditionFailedError, R2ObjectStore} from '../src/object-store';

function makeResponse(status: number, body = '', headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    headers: {get: (name: string) => headers[name.toLowerCase()] ?? null},
  } as unknown as Response;
}

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeStore(responder: (req: Recorded) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    // aws4fetch signs into a Request object.
    const request = input as Request;
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const recorded: Recorded = {
      url: request.url,
      method: request.method,
      headers,
      body: request.body ? await request.text() : undefined,
    };
    calls.push(recorded);
    return responder(recorded);
  }) as unknown as typeof fetch;

  const store = new R2ObjectStore({
    endpoint: 'https://acc.r2.cloudflarestorage.com/', // trailing slash on purpose
    bucket: 'status',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    fetchImpl,
  });
  return {store, calls};
}

describe('R2ObjectStore (real client, injected fetch)', () => {
  it('signs requests (SigV4 Authorization header) against normalized URLs', async () => {
    const {store, calls} = makeStore(() => makeResponse(200, 'body', {etag: '"e1"'}));
    const result = await store.get('status/v1/summary.json');
    expect(result).toEqual({body: 'body', etag: '"e1"'});
    expect(calls[0].url).toBe(
      'https://acc.r2.cloudflarestorage.com/status/status/v1/summary.json'
    );
    expect(calls[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(calls[0].headers.authorization).toContain('AKID');
  });

  it('get returns null on 404 and throws on other errors', async () => {
    const {store: notFound} = makeStore(() => makeResponse(404));
    expect(await notFound.get('missing.json')).toBeNull();

    const {store: broken} = makeStore(() => makeResponse(500));
    await expect(broken.get('x.json')).rejects.toThrow(/HTTP 500/);
  });

  it('put sends conditional headers and maps 412 to PreconditionFailedError', async () => {
    const {store, calls} = makeStore(() => makeResponse(200, '', {etag: '"e2"'}));
    await store.put('k.json', '{}', {ifMatch: '"e1"'});
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].headers['if-match']).toBe('"e1"');
    expect(calls[0].headers['content-type']).toBe('application/json');

    const {store: contended} = makeStore(() => makeResponse(412));
    await expect(contended.put('k.json', '{}', {ifMatch: '"e1"'})).rejects.toThrow(
      PreconditionFailedError
    );
  });

  it('put sends if-none-match for immutable creates', async () => {
    const {store, calls} = makeStore(() => makeResponse(200, '', {etag: '"e3"'}));
    await store.put('batch.json', '[]', {ifNoneMatch: '*'});
    expect(calls[0].headers['if-none-match']).toBe('*');
  });

  it('list paginates via continuation tokens and decodes XML entities', async () => {
    let page = 0;
    const {store, calls} = makeStore(() => {
      page++;
      if (page === 1) {
        return makeResponse(
          200,
          '<ListBucketResult><Key>a.json</Key><Key>b&amp;c.json</Key>' +
            '<NextContinuationToken>tok1</NextContinuationToken></ListBucketResult>'
        );
      }
      return makeResponse(200, '<ListBucketResult><Key>d.json</Key></ListBucketResult>');
    });
    const keys = await store.list('status/v1/readings/');
    expect(keys).toEqual(['a.json', 'b&c.json', 'd.json']);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('list-type=2');
    expect(calls[0].url).toContain('prefix=status%2Fv1%2Freadings%2F');
    expect(calls[1].url).toContain('continuation-token=tok1');
  });

  it('delete tolerates 404 and throws on real errors', async () => {
    const {store} = makeStore(() => makeResponse(404));
    await expect(store.delete('gone.json')).resolves.toBeUndefined();

    const {store: broken} = makeStore(() => makeResponse(500));
    await expect(broken.delete('x.json')).rejects.toThrow(/HTTP 500/);
  });
});
