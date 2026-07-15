/**
 * dataPlane config block tests (ADR-006 §6; epic #97 ticket #98).
 *
 * Profile selection is ONE optional block; absence must mean Profile
 * A/B exactly as today — every existing config keeps parsing with
 * `dataPlane.kind === 'git'`.
 */

import {parseConfig} from '../src/config';

const BASE = {
  owner: 'o',
  repo: 'r',
  entities: [{name: 'api', type: 'system' as const}],
};

describe('dataPlane config block (ADR-006 §6)', () => {
  it('defaults to the git profile when absent (existing configs unaffected)', () => {
    const config = parseConfig(BASE);
    expect(config.dataPlane.kind).toBe('git');
  });

  it('accepts an explicit git profile with no further fields', () => {
    const config = parseConfig({...BASE, dataPlane: {kind: 'git'}});
    expect(config.dataPlane.kind).toBe('git');
  });

  it('accepts a complete r2 profile', () => {
    const config = parseConfig({
      ...BASE,
      dataPlane: {
        kind: 'r2',
        bucket: 'status',
        endpoint: 'https://abc123.r2.cloudflarestorage.com',
        publicBaseUrl: 'https://status.example.com',
      },
    });
    expect(config.dataPlane).toMatchObject({kind: 'r2', bucket: 'status'});
  });

  it.each([
    ['bucket', {endpoint: 'https://a.r2.cloudflarestorage.com', publicBaseUrl: 'https://s.example.com'}],
    ['endpoint', {bucket: 'status', publicBaseUrl: 'https://s.example.com'}],
    ['publicBaseUrl', {bucket: 'status', endpoint: 'https://a.r2.cloudflarestorage.com'}],
  ])('rejects an r2 profile missing %s with a field-path error', (missing, partial) => {
    expect(() => parseConfig({...BASE, dataPlane: {kind: 'r2', ...partial}})).toThrow(
      new RegExp(`dataPlane.*${missing}|${missing}.*dataPlane|${missing}`)
    );
  });

  it('rejects a non-https publicBaseUrl (the client polls it)', () => {
    expect(() =>
      parseConfig({
        ...BASE,
        dataPlane: {
          kind: 'r2',
          bucket: 'status',
          endpoint: 'https://a.r2.cloudflarestorage.com',
          publicBaseUrl: 'http://insecure.example.com',
        },
      })
    ).toThrow(/https/);
  });

  it('rejects an unknown kind', () => {
    expect(() => parseConfig({...BASE, dataPlane: {kind: 's3'}})).toThrow();
  });

  it('rejects r2 fields on the git profile (catches option typos loudly)', () => {
    expect(() =>
      parseConfig({...BASE, dataPlane: {kind: 'git', bucket: 'status'}})
    ).toThrow(/bucket/);
  });
});
