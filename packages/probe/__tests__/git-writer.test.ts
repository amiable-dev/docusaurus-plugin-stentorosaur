/**
 * Regenerate-and-retry git writer tests (ADR-005 §5; ticket #69).
 *
 * The §5 rule: summary.json is a pure function of the merged inputs, so
 * a writer losing a push race re-fetches, re-writes ITS OWN inputs on
 * top, regenerates, and retries. Tested against REAL git repos: a bare
 * "origin" and two racing clones — no lost readings, converged summary.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pushWithRegenerateRetry} from '../src/git-writer';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {cwd, stdio: 'pipe'}).toString();

let tmp: string;
let origin: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-git-'));
  origin = path.join(tmp, 'origin.git');
  execFileSync('git', ['init', '--bare', '--initial-branch=status-data', origin]);
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

function makeClone(name: string): string {
  const dir = path.join(tmp, name);
  execFileSync('git', ['clone', origin, dir], {stdio: 'pipe'});
  git(dir, 'config', 'user.email', 'probe@test');
  git(dir, 'config', 'user.name', 'probe');
  return dir;
}

/** writeInputs writes one entity file; regenerate merges all inputs. */
function writerOps(entity: string, value: string) {
  return {
    writeInputs: async (workdir: string) => {
      const dir = path.join(workdir, 'status', 'v1', 'entities');
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(path.join(dir, `${entity}.json`), JSON.stringify({entity, value}));
    },
    regenerate: async (workdir: string) => {
      const dir = path.join(workdir, 'status', 'v1', 'entities');
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
      fs.writeFileSync(
        path.join(workdir, 'status', 'v1', 'summary.json'),
        JSON.stringify({from: files})
      );
    },
  };
}

const noJitter = {sleep: async () => {}, jitterMs: () => 0};

describe('pushWithRegenerateRetry', () => {
  it('first write initializes the branch', async () => {
    const clone = makeClone('a');
    await pushWithRegenerateRetry({
      workdir: clone,
      branch: 'status-data',
      commitMessage: 'probe: alpha',
      ...writerOps('alpha', 'v1'),
      ...noJitter,
    });
    const verify = makeClone('verify');
    expect(fs.existsSync(path.join(verify, 'status', 'v1', 'entities', 'alpha.json'))).toBe(true);
  });

  it('losing a race retries and converges with NO lost inputs (§5)', async () => {
    const a = makeClone('a');
    const b = makeClone('b');

    // Seed: writer A lands first.
    await pushWithRegenerateRetry({
      workdir: a,
      branch: 'status-data',
      commitMessage: 'probe: alpha',
      ...writerOps('alpha', 'v1'),
      ...noJitter,
    });

    // Writer B is STALE (cloned before A pushed? No — clone happened before
    // A's push, so B has no status-data commits). B's push must hit
    // non-fast-forward, refetch, and land on top.
    await pushWithRegenerateRetry({
      workdir: b,
      branch: 'status-data',
      commitMessage: 'probe: beta',
      ...writerOps('beta', 'v1'),
      ...noJitter,
    });

    const verify = makeClone('verify2');
    const entities = fs.readdirSync(path.join(verify, 'status', 'v1', 'entities')).sort();
    expect(entities).toEqual(['alpha.json', 'beta.json']);
    // Summary regenerated from the MERGED inputs, not just B's own.
    const summary = JSON.parse(
      fs.readFileSync(path.join(verify, 'status', 'v1', 'summary.json'), 'utf8')
    );
    expect(summary.from).toEqual(['alpha.json', 'beta.json']);
  });

  it('gives up loudly after maxRetries consecutive rejections', async () => {
    const a = makeClone('a');
    let pushes = 0;
    await expect(
      pushWithRegenerateRetry({
        workdir: a,
        branch: 'status-data',
        commitMessage: 'probe: alpha',
        ...writerOps('alpha', 'v1'),
        ...noJitter,
        maxRetries: 2,
        // Sabotage: another commit lands on origin before EVERY push.
        beforePush: async () => {
          pushes++;
          const saboteur = makeClone(`saboteur-${pushes}`);
          await pushWithRegenerateRetry({
            workdir: saboteur,
            branch: 'status-data',
            commitMessage: `saboteur ${pushes}`,
            ...writerOps(`ghost-${pushes}`, 'x'),
            ...noJitter,
          });
        },
      })
    ).rejects.toThrow(/retries|non-fast-forward|rejected/i);
    expect(pushes).toBeGreaterThanOrEqual(2);
  });
});
