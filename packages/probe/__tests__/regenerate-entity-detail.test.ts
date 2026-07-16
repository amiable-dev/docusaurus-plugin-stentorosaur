/**
 * git-plane entity-detail window rebuild (#119).
 *
 * The probe's writeReadings overwrites each entity detail with only its
 * latest batch (1 point). regenerateDerived must rebuild the detail from
 * the recent archive window so drill-down charts have real history — and
 * must do so WITHOUT touching the archives, which are the append-only
 * source of truth (the "no monitoring data loss" constraint).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseEntityDetail} from '@stentorosaur/core';
import type {CompactReading} from '@stentorosaur/core';
import {appendArchive, writeEntityDetail} from '../src/files';
import {regenerateDerived} from '../src/regenerate';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'regen-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const reading = (svc: string, t: number, lat = 40): CompactReading => ({
  t,
  svc,
  state: 'up',
  code: 200,
  lat,
});

/** Seed `days` days of archive readings (one/day) for a service. */
function seedArchive(svc: string, days: number): CompactReading[] {
  const seeded: CompactReading[] = [];
  for (let d = days; d >= 1; d--) {
    const r = reading(svc, NOW - d * DAY, 30 + d);
    appendArchive(tmp, r);
    seeded.push(r);
  }
  return seeded;
}

function regen() {
  regenerateDerived(tmp, {
    generatedAt: new Date(NOW).toISOString(),
    generatedBy: 'test',
    entities: [{name: 'api', type: 'system'}],
    siteTitle: 'T',
    siteUrl: 'https://t.example.com',
  });
}

function readDetail(svc: string) {
  const file = path.join(tmp, 'status', 'v1', 'entities', `${svc}.json`);
  return parseEntityDetail(JSON.parse(fs.readFileSync(file, 'utf8')));
}

describe('regenerateDerived rebuilds the entity-detail window (#119)', () => {
  it('restores the 14-day window from archives even when the detail was collapsed to 1 point', () => {
    seedArchive('api', 20); // 20 days in the archives
    // Simulate the probe's collapse: detail holds only the latest batch.
    writeEntityDetail(tmp, 'api', [reading('api', NOW, 99)], new Date(NOW).toISOString());
    expect(readDetail('api').readings).toHaveLength(1);

    regen();

    const rebuilt = readDetail('api').readings;
    // Only the last 14 days are in the detail window (not all 20, not 1).
    expect(rebuilt.length).toBe(14);
    const oldest = Math.min(...rebuilt.map(r => r.t));
    expect(oldest).toBeGreaterThanOrEqual(NOW - 14 * DAY);
    // Sorted oldest→newest.
    expect(rebuilt.map(r => r.t)).toEqual([...rebuilt.map(r => r.t)].sort((a, b) => a - b));
  });

  it('does NOT lose monitoring data: the archives are byte-identical after regenerate', () => {
    seedArchive('api', 20);
    const archivesDir = path.join(tmp, 'status', 'v1', 'archives');
    const snapshot = (): Record<string, string> => {
      const out: Record<string, string> = {};
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else out[path.relative(archivesDir, full)] = fs.readFileSync(full, 'utf8');
        }
      };
      walk(archivesDir);
      return out;
    };
    const before = snapshot();
    regen();
    expect(snapshot()).toEqual(before); // archives untouched
  });

  it('leaves an entity with no readings in the window untouched (no blank detail)', () => {
    seedArchive('api', 5);
    // 'ghost' has no archive readings; a stale detail must not be blanked.
    writeEntityDetail(tmp, 'ghost', [reading('ghost', NOW - 40 * DAY)], new Date(NOW).toISOString());
    regen(); // entities only lists 'api'
    expect(readDetail('ghost').readings).toHaveLength(1); // preserved, not touched
  });
});
