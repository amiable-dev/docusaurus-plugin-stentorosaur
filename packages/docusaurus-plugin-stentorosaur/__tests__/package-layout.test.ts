/**
 * Package layout smoke tests (ADR-005, tickets #64/#77).
 *
 * Guards:
 * 1. pluginVersion is injected from package.json at load time (the
 *    generated src/version.ts hack stays gone).
 * 2. The published package layout resolves from the workspace location.
 * 3. v1.0 cutover: no bin, no postinstall, no scripts/ directory —
 *    the CLI lives in @stentorosaur/probe (ADR-005 §11).
 */

import * as realFs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {LoadContext} from '@docusaurus/types';
import type {PluginOptions} from '../src/types';
import pluginStatusPage from '../src/index';

const pkgDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  realFs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
);

const SUMMARY = {
  schemaVersion: 1,
  generatedAt: '2026-07-13T12:00:00.000Z',
  generatedBy: 'test',
  entities: [
    {
      name: 'api',
      type: 'system',
      status: 'up',
      uptime: {d1: 100, d7: 100, d90: 100},
      responseTimeMs: {d1: 42},
      daysEnd: '2026-07-13',
      days: [[100, 42, 'u']],
    },
  ],
  incidents: {open: [], recent: []},
  maintenance: {upcoming: [], inProgress: []},
};

function makeSite(): {siteDir: string; context: LoadContext} {
  const siteDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'layout-'));
  const v1 = path.join(siteDir, 'status-data', 'status', 'v1');
  realFs.mkdirSync(v1, {recursive: true});
  realFs.writeFileSync(path.join(v1, 'summary.json'), JSON.stringify(SUMMARY));
  realFs.mkdirSync(path.join(siteDir, '.docusaurus'), {recursive: true});
  const context = {
    siteDir,
    generatedFilesDir: path.join(siteDir, '.docusaurus'),
    siteConfig: {baseUrl: '/', organizationName: 'o', projectName: 'r'} as any,
  } as LoadContext;
  return {siteDir, context};
}

describe('version injection (no generated version.ts)', () => {
  let siteDir: string;
  let context: LoadContext;
  beforeEach(() => {
    ({siteDir, context} = makeSite());
  });
  afterEach(() => {
    realFs.rmSync(siteDir, {recursive: true, force: true});
  });

  it('loadContent exposes pluginVersion matching package.json', async () => {
    const plugin = await pluginStatusPage(context, {} as PluginOptions);
    const content = await plugin.loadContent!();
    expect(content.pluginVersion).toBe(pkg.version);
  });

  it('resolves the PACKAGE version, not the monorepo root version', async () => {
    const rootPkg = JSON.parse(
      realFs.readFileSync(path.join(pkgDir, '..', '..', 'package.json'), 'utf8')
    );
    const plugin = await pluginStatusPage(context, {} as PluginOptions);
    const content = await plugin.loadContent!();
    expect(content.pluginVersion).not.toBe(rootPkg.version);
    expect(content.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('generated version artifacts are gone', () => {
    expect(realFs.existsSync(path.join(pkgDir, 'src', 'version.ts'))).toBe(false);
    expect(realFs.existsSync(path.join(pkgDir, 'scripts', 'generate-version.js'))).toBe(false);
  });
});

describe('package layout resolves from workspace location', () => {
  it('lives under packages/ in a workspace root', () => {
    expect(path.basename(path.dirname(pkgDir))).toBe('packages');
    const rootPkg = JSON.parse(
      realFs.readFileSync(path.join(pkgDir, '..', '..', 'package.json'), 'utf8')
    );
    expect(rootPkg.workspaces).toContain('packages/*');
    expect(rootPkg.private).toBe(true);
  });

  it('v1.0 ships no bin, no postinstall, no scripts/ (ADR-005 §11)', () => {
    expect(pkg.bin).toBeUndefined();
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(realFs.existsSync(path.join(pkgDir, 'scripts'))).toBe(false);
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
