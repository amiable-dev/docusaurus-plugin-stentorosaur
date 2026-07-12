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
});
