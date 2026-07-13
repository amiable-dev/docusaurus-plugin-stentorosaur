/**
 * Data-branch compaction (ADR-005 §10; ticket #71).
 *
 * Five-minute probes produce ~100k commits/year; unbounded history slows
 * every fetch-depth-less clone. The data branch's FILES are authoritative
 * — JSONL archives carry the full time series — so its history is not:
 * a monthly orphan-commit reset keeps the branch at one commit while the
 * working tree stays byte-identical.
 *
 * This is the ONE sanctioned force-push in the system (documented ADR
 * policy, data branch only, --force-with-lease against the ref we just
 * read). Feature branches are never force-pushed.
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export interface CompactOptions {
  /** Clone of the data repo, checked out on the data branch */
  workdir: string;
  branch: string;
  commitMessage?: string;
  authorName?: string;
  authorEmail?: string;
  /** Test seam: runs after commit-tree but before the force-with-lease push */
  beforePush?: () => Promise<void>;
}

async function git(workdir: string, ...args: string[]): Promise<string> {
  const {stdout} = await execFileAsync('git', args, {cwd: workdir});
  return stdout.trim();
}

/**
 * Reset the data branch to a single orphan commit containing the CURRENT
 * tree. Returns the tree hash, which callers can assert unchanged.
 */
export async function compactDataBranch(options: CompactOptions): Promise<{
  treeBefore: string;
  treeAfter: string;
  historyBefore: number;
  historyAfter: number;
}> {
  const {
    workdir,
    branch,
    commitMessage = `compact: monthly data-branch reset (ADR-005 §10)`,
    authorName = 'stentorosaur-probe',
    authorEmail = 'probe@stentorosaur.invalid',
    beforePush,
  } = options;

  await git(workdir, 'fetch', 'origin', branch);
  await git(workdir, 'checkout', '-B', branch, `origin/${branch}`);
  const remoteHead = await git(workdir, 'rev-parse', `origin/${branch}`);

  const treeBefore = await git(workdir, 'rev-parse', 'HEAD^{tree}');
  const historyBefore = Number(await git(workdir, 'rev-list', '--count', 'HEAD'));

  // Orphan commit carrying the identical tree — no checkout dance needed:
  // commit-tree writes the commit object directly.
  const newCommit = (
    await execFileAsync(
      'git',
      ['commit-tree', treeBefore, '-m', commitMessage],
      {
        cwd: workdir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_COMMITTER_NAME: authorName,
          GIT_COMMITTER_EMAIL: authorEmail,
        },
      }
    )
  ).stdout.trim();

  await git(workdir, 'update-ref', `refs/heads/${branch}`, newCommit);
  // Lease against the exact remote head we compacted — a concurrent probe
  // push in the window fails this push; the next monthly run retries.
  if (beforePush) await beforePush();
  await git(
    workdir,
    'push',
    '--force-with-lease=' + `refs/heads/${branch}:${remoteHead}`,
    'origin',
    `${branch}:${branch}`
  );

  await git(workdir, 'checkout', '-B', branch, newCommit);
  const treeAfter = await git(workdir, 'rev-parse', 'HEAD^{tree}');
  const historyAfter = Number(await git(workdir, 'rev-list', '--count', 'HEAD'));

  if (treeAfter !== treeBefore) {
    throw new Error(
      `compaction changed the tree (${treeBefore} -> ${treeAfter}) — this must never happen`
    );
  }

  return {treeBefore, treeAfter, historyBefore, historyAfter};
}
