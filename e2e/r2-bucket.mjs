/**
 * In-process R2 bucket double for the Profile C e2e leg (ticket #103).
 * Implements the same R2BucketLike surface the Worker sees (null on
 * conditional-put failure, cursor pagination) and persists/loads its
 * objects as JSON so `run-pipeline.mjs` (which builds the state) and
 * `serve-r2.mjs` (which serves it under Playwright) share one bucket.
 */
import fs from 'node:fs';

export class FileBackedR2Bucket {
  constructor() {
    this.objects = new Map();
    this.etagCounter = 0;
  }

  async get(key) {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {httpEtag: entry.etag, text: async () => entry.body};
  }

  async put(key, value, options) {
    const existing = this.objects.get(key);
    if (options?.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) {
      return null; // the real binding signals precondition failure with null
    }
    if (options?.onlyIf?.etagDoesNotMatch === '*' && existing) {
      return null;
    }
    const etag = `"e2e-${++this.etagCounter}"`;
    this.objects.set(key, {body: value, etag});
    return {httpEtag: etag, text: async () => value};
  }

  async list({prefix, cursor}) {
    const all = [...this.objects.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + 100);
    const nextStart = start + 100;
    return {
      objects: page.map(key => ({key})),
      truncated: nextStart < all.length,
      cursor: String(nextStart),
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }

  saveTo(file) {
    fs.writeFileSync(
      file,
      JSON.stringify({etagCounter: this.etagCounter, objects: [...this.objects.entries()]})
    );
  }

  static loadFrom(file) {
    const bucket = new FileBackedR2Bucket();
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    bucket.etagCounter = state.etagCounter;
    bucket.objects = new Map(state.objects);
    return bucket;
  }
}
