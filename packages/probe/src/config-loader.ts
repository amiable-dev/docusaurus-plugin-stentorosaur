/**
 * stentorosaur.config loader (ADR-005 §8; ticket #74). The I/O half of
 * the config system — the schema lives in @stentorosaur/core.
 * Supports .ts/.mts/.cts (via jiti), .js/.cjs/.mjs and .json.
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseConfig} from '@stentorosaur/core';
import type {StentorosaurConfig} from '@stentorosaur/core';

const CANDIDATES = [
  'stentorosaur.config.ts',
  'stentorosaur.config.mts',
  'stentorosaur.config.cts',
  'stentorosaur.config.js',
  'stentorosaur.config.cjs',
  'stentorosaur.config.mjs',
  'stentorosaur.config.json',
];

export function findConfigFile(dir: string): string | null {
  for (const candidate of CANDIDATES) {
    const file = path.join(dir, candidate);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export async function loadConfig(fileOrDir: string): Promise<StentorosaurConfig> {
  const stat = fs.statSync(fileOrDir, {throwIfNoEntry: false});
  // Absolute from here on: jiti requires an absolute module path, and a
  // relative --config like '.' would otherwise reach it verbatim
  // (found by the release-runbook §2 validation).
  const found = stat?.isDirectory() ? findConfigFile(fileOrDir) : fileOrDir;
  const file = found ? path.resolve(found) : null;
  if (!file || !fs.existsSync(file)) {
    throw new Error(
      `no stentorosaur config found${stat?.isDirectory() ? ` in ${fileOrDir}` : `: ${fileOrDir}`} — run 'stentorosaur init' to create one`
    );
  }

  let raw: unknown;
  if (file.endsWith('.json')) {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    // jiti handles TS and every JS flavor with one code path (v1
    // default-exports a factory; v2 exports createJiti).
    const jitiModule = (await import('jiti')) as {
      createJiti?: (id: string) => {import: (id: string) => Promise<unknown>};
      default?: (id: string) => (id: string) => unknown;
    };
    if (jitiModule.createJiti) {
      const jiti = jitiModule.createJiti(file);
      const mod = (await jiti.import(file)) as {default?: unknown};
      raw = (mod as {default?: unknown}).default ?? mod;
    } else {
      const jiti = jitiModule.default!(file);
      const mod = jiti(file) as {default?: unknown};
      raw = mod.default ?? mod;
    }
  }
  return parseConfig(raw);
}
