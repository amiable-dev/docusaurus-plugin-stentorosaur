/**
 * v1.0 cutover dependency guard (ADR-005 §11; epic #63 ticket #77).
 *
 * The cutover's acceptance criterion is that none of the cut
 * dependencies reappear — in package.json OR as imports in source.
 * chart.js died at #73; the rest die here.
 */

import fs from 'fs';
import path from 'path';

const PKG_DIR = path.join(__dirname, '..');
const BANNED_DEPS = [
  'nodemailer',
  'axios',
  'chart.js',
  'react-chartjs-2',
  'chartjs-plugin-annotation',
  'date-fns',
  'marked',
  'dompurify',
  '@octokit/rest',
  'chrono-node',
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('ADR-005 §11 dependency cuts stay cut', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));

  it.each(BANNED_DEPS)('%s is not a dependency of the plugin package', dep => {
    expect(pkg.dependencies?.[dep]).toBeUndefined();
    expect(pkg.devDependencies?.[dep]).toBeUndefined();
    expect(pkg.peerDependencies?.[dep]).toBeUndefined();
  });

  it('no source file imports a banned dependency', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(PKG_DIR, 'src'))) {
      const content = fs.readFileSync(file, 'utf8');
      for (const dep of BANNED_DEPS) {
        const pattern = new RegExp(
          `(from ['"]|require\\(['"])${dep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(['"/])`
        );
        if (pattern.test(content)) {
          offenders.push(`${path.relative(PKG_DIR, file)} imports ${dep}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the plugin ships no bin scripts (the stentorosaur CLI lives in @stentorosaur/probe)', () => {
    expect(pkg.bin).toBeUndefined();
  });

  it('deleted legacy modules stay deleted', () => {
    for (const legacy of [
      'src/github-service.ts',
      'src/demo-data.ts',
      'src/historical-data.ts',
      'src/notifications',
      'src/data-source-resolver.ts',
      'src/utils/markdown.ts',
      'scripts',
    ]) {
      expect(fs.existsSync(path.join(PKG_DIR, legacy))).toBe(false);
    }
  });
});
