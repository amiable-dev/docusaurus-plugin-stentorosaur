/**
 * Daily compaction safety contract (ADR-006 §5; ticket #101; council
 * conditions 2 & 3): fencing, delete-after-verify, idempotent
 * crash-resume, and the compaction-state doctor hook. All fault
 * injection goes through wrappers over the in-memory store.
 */

import {MemoryObjectStore, PreconditionFailedError} from '../src/object-store';
import type {ObjectStore, PutOptions, StoredObject} from '../src/object-store';
import {V1, writeReadingsBatch} from '../src/r2-plane';
import {
  COMPACTION_STATE_KEY,
  compactReadingsR2,
  dayIsEligible,
  readCompactionState,
} from '../src/r2-compaction';
import type {CompactReading} from '@stentorosaur/core';

const reading = (svc: string, iso: string, lat = 40): CompactReading => ({
  t: Date.parse(iso),
  svc,
  state: 'up',
  code: 200,
  lat,
});

const ARCHIVE_0713 = `${V1}/archives/2026/07/history-2026-07-13.jsonl`;
const ARCHIVE_0714 = `${V1}/archives/2026/07/history-2026-07-14.jsonl`;

async function seed(store: ObjectStore, iso: string, runId: string, readings: CompactReading[]) {
  return writeReadingsBatch(store, readings, iso, runId);
}

/** Delegating wrapper so individual tests can inject one fault. */
class FaultStore implements ObjectStore {
  constructor(private readonly inner: MemoryObjectStore) {}
  onGet: ((key: string, result: StoredObject | null) => StoredObject | null) | null = null;
  failPutOnce: string | null = null;
  failDeleteOnce: string | null = null;

  async get(key: string) {
    const result = await this.inner.get(key);
    return this.onGet ? this.onGet(key, result) : result;
  }
  async put(key: string, body: string, options?: PutOptions) {
    if (this.failPutOnce === key) {
      this.failPutOnce = null;
      throw new PreconditionFailedError(key);
    }
    return this.inner.put(key, body, options);
  }
  async list(prefix: string) {
    return this.inner.list(prefix);
  }
  async delete(key: string) {
    if (this.failDeleteOnce === key) {
      this.failDeleteOnce = null;
      throw new Error(`injected delete failure for ${key}`);
    }
    return this.inner.delete(key);
  }
}

describe('fencing (council condition 2: day boundary + 1h)', () => {
  it('dayIsEligible opens exactly at the boundary plus buffer', () => {
    expect(dayIsEligible('2026-07-14', Date.parse('2026-07-15T00:59:59Z'))).toBe(false);
    expect(dayIsEligible('2026-07-14', Date.parse('2026-07-15T01:00:00Z'))).toBe(true);
    expect(dayIsEligible('2026-07-15', Date.parse('2026-07-15T23:59:59Z'))).toBe(false);
  });

  it('a batch inside the buffer window is never touched', async () => {
    const store = new MemoryObjectStore();
    const key = await seed(store, '2026-07-14T23:55:00.000Z', 'run1', [
      reading('api', '2026-07-14T23:55:00.000Z'),
    ]);
    const result = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T00:30:00Z')});
    expect(result.archivedDays).toEqual([]);
    expect(await store.get(key)).not.toBeNull();
    expect(await store.get(ARCHIVE_0714)).toBeNull();

    // Same store one hour later: the day is now closed + buffered.
    const later = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T01:30:00Z')});
    expect(later.archivedDays).toEqual(['2026-07-14']);
    expect(await store.get(key)).toBeNull();
  });
});

describe('basic compaction + determinism', () => {
  it('folds a day of batches into sorted deduped JSONL, then deletes them', async () => {
    const store = new MemoryObjectStore();
    const k1 = await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [
      reading('web', '2026-07-13T10:00:00.000Z'),
      reading('api', '2026-07-13T10:00:00.000Z'),
    ]);
    const k2 = await seed(store, '2026-07-13T10:05:00.000Z', 'r2', [
      reading('api', '2026-07-13T10:00:00.000Z', 99), // dup (svc,t): first-in wins
      reading('api', '2026-07-13T10:05:00.000Z'),
    ]);

    const result = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    expect(result).toMatchObject({archivedDays: ['2026-07-13'], deletedBatches: 2, failedDays: []});
    expect(await store.get(k1)).toBeNull();
    expect(await store.get(k2)).toBeNull();

    const lines = (await store.get(ARCHIVE_0713))!.body.trim().split('\n').map(l => JSON.parse(l));
    expect(lines.map(l => [l.svc, l.t])).toEqual([
      ['api', Date.parse('2026-07-13T10:00:00Z')],
      ['web', Date.parse('2026-07-13T10:00:00Z')],
      ['api', Date.parse('2026-07-13T10:05:00Z')],
    ]);
    expect(lines[0].lat).toBe(40); // dedupe kept the earlier-listed batch
  });

  it('merges with an existing archive (migration case) preserving unparseable lines', async () => {
    const store = new MemoryObjectStore();
    const archived = reading('api', '2026-07-13T09:00:00.000Z', 7);
    await store.put(
      ARCHIVE_0713,
      `${JSON.stringify(archived)}\nnot-json-but-precious\n`
    );
    await seed(store, '2026-07-13T09:00:00.000Z', 'r1', [
      reading('api', '2026-07-13T09:00:00.000Z', 99), // collides: archive wins
      reading('api', '2026-07-13T09:05:00.000Z'),
    ]);

    await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    const body = (await store.get(ARCHIVE_0713))!.body;
    expect(body).toContain('not-json-but-precious');
    const parsed = body.trim().split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
    expect(parsed.find(r => r.t === archived.t)!.lat).toBe(7); // archive won the collision
    expect(parsed).toHaveLength(2);
  });

  it('is idempotent: a second run changes nothing and rewrites no archive', async () => {
    const store = new MemoryObjectStore();
    await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [reading('api', '2026-07-13T10:00:00.000Z')]);
    await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    const bytes = (await store.get(ARCHIVE_0713))!.body;

    const opsBefore = store.ops.length;
    const second = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:10:00Z')});
    expect(second).toMatchObject({archivedDays: [], deletedBatches: 0, failedDays: []});
    expect((await store.get(ARCHIVE_0713))!.body).toBe(bytes);
    const archivePuts = store.ops
      .slice(opsBefore)
      .filter(op => op.op === 'put' && op.key.includes('/archives/'));
    expect(archivePuts).toEqual([]); // nothing to fold → archive untouched
  });
});

describe('delete-after-verify + crash-resume (council condition 2)', () => {
  it('a failed verify read-back leaves every batch in place', async () => {
    const inner = new MemoryObjectStore();
    const store = new FaultStore(inner);
    const key = await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [
      reading('api', '2026-07-13T10:00:00.000Z'),
    ]);
    let putSeen = false;
    store.onGet = (k, result) => {
      if (k === ARCHIVE_0713 && putSeen && result) {
        return {...result, body: result.body + 'CORRUPTED'};
      }
      return result;
    };
    const origPut = inner.put.bind(inner);
    inner.put = async (k, body, options) => {
      if (k === ARCHIVE_0713) putSeen = true;
      return origPut(k, body, options);
    };

    await expect(
      compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')})
    ).rejects.toThrow(/compaction failed for 2026-07-13/);
    expect(await inner.get(key)).not.toBeNull(); // nothing deleted
    const state = await readCompactionState(inner);
    expect(state?.lastSuccess).toBeNull(); // no prior success to preserve
    expect(state?.lastRun).toBe(new Date(Date.parse('2026-07-15T12:00:00Z')).toISOString());
  });

  it('crash between archive write and deletes: re-run converges losslessly', async () => {
    const inner = new MemoryObjectStore();
    const store = new FaultStore(inner);
    const k1 = await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [
      reading('api', '2026-07-13T10:00:00.000Z'),
    ]);
    const k2 = await seed(store, '2026-07-13T10:05:00.000Z', 'r2', [
      reading('api', '2026-07-13T10:05:00.000Z'),
    ]);
    store.failDeleteOnce = k2; // "crash" partway through the deletes

    await expect(
      compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')})
    ).rejects.toThrow(/re-run converges/);
    const bytesAfterCrash = (await inner.get(ARCHIVE_0713))!.body;
    expect(await inner.get(k1)).toBeNull(); // first delete landed
    expect(await inner.get(k2)).not.toBeNull(); // survivor

    // Golden comparison: the re-run regenerates IDENTICAL bytes from the
    // merged input set and resumes the remaining delete.
    const rerun = await compactReadingsR2(inner, {nowMs: Date.parse('2026-07-15T13:00:00Z')});
    expect(rerun).toMatchObject({archivedDays: ['2026-07-13'], deletedBatches: 1, failedDays: []});
    expect((await inner.get(ARCHIVE_0713))!.body).toBe(bytesAfterCrash);
    expect(await inner.get(k2)).toBeNull();
    expect((await readCompactionState(inner))?.lastSuccess).toBe(
      new Date(Date.parse('2026-07-15T13:00:00Z')).toISOString()
    );
  });

  it('an archive write race defers the day and preserves lastSuccess', async () => {
    const inner = new MemoryObjectStore();
    await inner.put(
      COMPACTION_STATE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        lastRun: '2026-07-14T01:00:00.000Z',
        lastSuccess: '2026-07-14T01:00:00.000Z',
        archivedDays: [],
        deletedBatches: 0,
      })
    );
    const store = new FaultStore(inner);
    const key = await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [
      reading('api', '2026-07-13T10:00:00.000Z'),
    ]);
    store.failPutOnce = ARCHIVE_0713;

    const warnings: string[] = [];
    await expect(
      compactReadingsR2(store, {
        nowMs: Date.parse('2026-07-15T12:00:00Z'),
        onWarn: m => warnings.push(m),
      })
    ).rejects.toThrow(/compaction failed/);
    expect(warnings.join(' ')).toMatch(/lost a race/);
    expect(await inner.get(key)).not.toBeNull();
    expect((await readCompactionState(inner))?.lastSuccess).toBe('2026-07-14T01:00:00.000Z');
  });
});

describe('malformed inputs are quarantined, never destroyed', () => {
  it('a malformed batch key is never fetched and never deleted', async () => {
    const store = new MemoryObjectStore();
    await store.put(`${V1}/readings/garbage.json`, 'whatever');
    await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [reading('api', '2026-07-13T10:00:00.000Z')]);

    const warnings: string[] = [];
    const result = await compactReadingsR2(store, {
      nowMs: Date.parse('2026-07-15T12:00:00Z'),
      onWarn: m => warnings.push(m),
    });
    expect(result.batchesLeft).toBe(1);
    expect(warnings.join(' ')).toMatch(/unrecognized batch key/);
    expect(await store.get(`${V1}/readings/garbage.json`)).not.toBeNull();
    expect(
      store.ops.filter(op => op.op === 'get' && op.key === `${V1}/readings/garbage.json`)
    ).toHaveLength(1); // only OUR verification get above, none from the compactor
  });

  it('an unparseable batch is left in place while good siblings compact', async () => {
    const store = new MemoryObjectStore();
    const good = await seed(store, '2026-07-13T10:00:00.000Z', 'r1', [
      reading('api', '2026-07-13T10:00:00.000Z'),
    ]);
    const badKey = `${V1}/readings/2026-07-13T11-00-00-000Z-bad1.json`;
    await store.put(badKey, '{corrupt');

    const result = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    expect(result).toMatchObject({archivedDays: ['2026-07-13'], deletedBatches: 1, batchesLeft: 1});
    expect(await store.get(good)).toBeNull();
    expect(await store.get(badKey)).not.toBeNull();
    expect((await store.get(ARCHIVE_0713))!.body.trim().split('\n')).toHaveLength(1);
    // Quarantine count is PERSISTED so doctor can see it without
    // tailing Worker logs (Copilot PR #108).
    expect((await readCompactionState(store))?.batchesLeft).toBe(1);
  });
});

describe('compaction-state (council condition 3 observability)', () => {
  it('an empty run still advances lastSuccess (a healthy no-op is healthy)', async () => {
    const store = new MemoryObjectStore();
    const result = await compactReadingsR2(store, {nowMs: Date.parse('2026-07-15T12:00:00Z')});
    expect(result).toMatchObject({archivedDays: [], deletedBatches: 0, failedDays: []});
    expect((await readCompactionState(store))?.lastSuccess).toBe('2026-07-15T12:00:00.000Z');
  });

  it('readCompactionState returns null for missing or malformed state', async () => {
    const store = new MemoryObjectStore();
    expect(await readCompactionState(store)).toBeNull();
    await store.put(COMPACTION_STATE_KEY, 'nope');
    expect(await readCompactionState(store)).toBeNull();
  });
});
