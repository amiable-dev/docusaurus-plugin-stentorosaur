/**
 * Monorepo scaffold smoke tests (ADR-005, epic #63 ticket #64).
 *
 * Guards two acceptance criteria:
 * 1. The plugin's version is injected from package.json at load time —
 *    the generated src/version.ts / scripts/generate-version.js hack is
 *    gone (ADR-005 §11 scope-cut table).
 * 2. The published package layout resolves from the new workspace
 *    location (main/bin/files entries point at real files).
 */

import * as realFs from 'fs';
import * as path from 'path';
import type {LoadContext} from '@docusaurus/types';
import type {PluginOptions} from '../src/types';
import pluginStatusPage from '../src/index';

jest.mock('../src/github-service');
jest.mock('fs-extra');

const pkgDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  realFs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
);

describe('version injection (no generated version.ts)', () => {
  const mockContext = {
    siteDir: '/test/site',
    generatedFilesDir: '/test/site/.docusaurus',
    baseUrl: '/',
    siteConfig: {baseUrl: '/'} as any,
  } as LoadContext;

  it('loadContent exposes pluginVersion matching package.json', async () => {
    const options: PluginOptions = {
      owner: 'test-owner',
      repo: 'test-repo',
      useDemoData: true,
    };
    const plugin = await pluginStatusPage(mockContext, options);
    const content = await plugin.loadContent!();
    expect(content.pluginVersion).toBe(pkg.version);
  });

  it('resolves the PACKAGE version, not the monorepo root version', async () => {
    // Guards the resolution of require('../package.json') from src/ and
    // lib/: both must land on the plugin package manifest, never the
    // private workspace root (version 0.0.0).
    const rootPkg = JSON.parse(
      realFs.readFileSync(
        path.join(pkgDir, '..', '..', 'package.json'),
        'utf8'
      )
    );
    const plugin = await pluginStatusPage(mockContext, {useDemoData: true, owner: 'o', repo: 'r'});
    const content = await plugin.loadContent!();
    expect(content.pluginVersion).not.toBe(rootPkg.version);
    expect(content.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('generated version artifacts are gone', () => {
    expect(realFs.existsSync(path.join(pkgDir, 'src', 'version.ts'))).toBe(false);
    expect(
      realFs.existsSync(path.join(pkgDir, 'scripts', 'generate-version.js'))
    ).toBe(false);
  });
});

describe('package layout resolves from workspace location', () => {
  it('lives under packages/ in a workspace root', () => {
    expect(path.basename(path.dirname(pkgDir))).toBe('packages');
    const rootPkg = JSON.parse(
      realFs.readFileSync(
        path.join(pkgDir, '..', '..', 'package.json'),
        'utf8'
      )
    );
    expect(rootPkg.workspaces).toContain('packages/*');
    expect(rootPkg.private).toBe(true);
  });

  it('every bin entry points at an existing executable script', () => {
    for (const [name, rel] of Object.entries<string>(pkg.bin)) {
      const binPath = path.join(pkgDir, rel);
      expect(realFs.existsSync(binPath)).toBe(true);
    }
  });

  it('files whitelist entries exist in the package (lib may be unbuilt)', () => {
    for (const entry of pkg.files as string[]) {
      if (entry === 'lib') continue; // build output, absent before `npm run build`
      expect(realFs.existsSync(path.join(pkgDir, entry))).toBe(true);
    }
  });

  it('README and LICENSE ship with the package', () => {
    expect(realFs.existsSync(path.join(pkgDir, 'README.md'))).toBe(true);
    expect(realFs.existsSync(path.join(pkgDir, 'LICENSE'))).toBe(true);
  });

  it('postinstall script exists, is self-contained, and its Makefile template ships', () => {
    // Council finding (PR #78 r=1): postinstall must not depend on the
    // removed generate-version script, and everything it references at
    // consumer-install time must be inside the published tarball.
    const postinstallRel = (pkg.scripts.postinstall as string).replace(/^node\s+/, '');
    const postinstallPath = path.join(pkgDir, postinstallRel);
    expect(realFs.existsSync(postinstallPath)).toBe(true);
    const src = realFs.readFileSync(postinstallPath, 'utf8');
    expect(src).not.toMatch(/generate-version/);
    expect(src).not.toMatch(/src\/version/);
    // The only package-internal asset it references:
    expect(realFs.existsSync(path.join(pkgDir, 'templates', 'Makefile.status'))).toBe(true);
    // And templates/ is in the publish whitelist:
    expect(pkg.files).toContain('templates');
    expect(pkg.files).toContain('scripts');
  });
});
