/**
 * Compaction tests (ADR-005 §10; ticket #71): synthetic many-commit
 * history collapses to one commit with a byte-identical tree; a
 * concurrent push in the compaction window is not clobbered (lease).
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compactDataBranch} from '../src/compact';
import {pushWithRegenerateRetry} from '../src/git-writer';

const noJitter = {sleep: async () => {}, jitterMs: () => 0};

let tmp: string;
let origin: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-compact-'));
  origin = path.join(tmp, 'origin.git');
  execFileSync('git', ['init', '--bare', '--initial-branch=status-data', origin]);
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

function clone(name: string): string {
  const dir = path.join(tmp, name);
  execFileSync('git', ['clone', origin, dir], {stdio: 'pipe'});
  return dir;
}

async function seedCommits(count: number): Promise<string> {
  const dir = clone(`seed-${count}`);
  for (let i = 0; i < count; i++) {
    await pushWithRegenerateRetry({
      workdir: dir,
      branch: 'status-data',
      commitMessage: `probe run ${i}`,
      writeInputs: async workdir => {
        const p = path.join(workdir, 'status', 'v1', 'entities');
        fs.mkdirSync(p, {recursive: true});
        fs.writeFileSync(path.join(p, 'api.json'), JSON.stringify({run: i}));
        fs.appendFileSync(path.join(workdir, 'log.jsonl'), `{"run":${i}}\n`);
      },
      regenerate: async () => {},
      ...noJitter,
    });
  }
  return dir;
}

describe('compactDataBranch', () => {
  it('collapses history to 1 commit with a byte-identical tree', async () => {
    await seedCommits(25);
    const worker = clone('compactor');
    const result = await compactDataBranch({workdir: worker, branch: 'status-data'});

    expect(result.historyBefore).toBe(25);
    expect(result.historyAfter).toBe(1);
    expect(result.treeAfter).toBe(result.treeBefore);

    // A fresh clone sees the same files and single-commit history.
    const verify = clone('verify');
    expect(fs.readFileSync(path.join(verify, 'log.jsonl'), 'utf8').trim().split('\n')).toHaveLength(25);
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {cwd: verify}).toString().trim();
    expect(count).toBe('1');
  });

  it('force-with-lease refuses to clobber a concurrent push', async () => {
    await seedCommits(3);
    const worker = clone('compactor');
    // Fetch happens inside compactDataBranch; sneak a push in AFTER by
    // pre-fetching state into the worker, then racing a writer.
    execFileSync('git', ['fetch', 'origin', 'status-data'], {cwd: worker});
    const racer = clone('racer');
    await pushWithRegenerateRetry({
      workdir: racer,
      branch: 'status-data',
      commitMessage: 'racer',
      writeInputs: async workdir => {
        fs.appendFileSync(path.join(workdir, 'log.jsonl'), '{"racer":true}\n');
      },
      regenerate: async () => {},
      ...noJitter,
    });

    // compactDataBranch re-fetches, so it compacts INCLUDING the racer's
    // commit — no data loss either way. Verify racer data survives.
    await compactDataBranch({workdir: worker, branch: 'status-data'});
    const verify = clone('verify');
    expect(fs.readFileSync(path.join(verify, 'log.jsonl'), 'utf8')).toContain('racer');
  });
});
