/**
 * Regenerate-and-retry data-branch writer (ADR-005 §5).
 *
 * summary.json is a DERIVED file — a pure function of the per-entity
 * inputs and issue set — so concurrent writers need no locks: on a
 * non-fast-forward rejection, re-fetch, re-apply OUR OWN inputs on top
 * of the merged tree, regenerate, and push again. Regeneration after
 * rebase is always correct because buildSummary is deterministic over
 * the now-merged inputs.
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export interface PushWithRetryOptions {
  /** A git worktree with 'origin' pointing at the data repo */
  workdir: string;
  /** Data branch name (e.g. 'status-data') */
  branch: string;
  commitMessage: string;
  /** Write THIS writer's inputs (per-entity readings, archives, raw/) */
  writeInputs: (workdir: string) => Promise<void>;
  /** Rebuild every derived file (summary.json, atom) from ALL inputs */
  regenerate: (workdir: string) => Promise<void>;
  /** Push attempts before giving up (default 3) */
  maxRetries?: number;
  /** Commit identity — CI runners have no global git config (default: probe bot) */
  authorName?: string;
  authorEmail?: string;
  /** Injected for deterministic tests */
  sleep?: (ms: number) => Promise<void>;
  jitterMs?: (attempt: number) => number;
  /** Test seam: runs between commit and push */
  beforePush?: () => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const defaultJitter = (attempt: number) => Math.floor(Math.random() * 500 * attempt);

function isNonFastForward(stderr: string): boolean {
  return /non-fast-forward|fetch first|\[rejected\]|failed to push/i.test(stderr);
}

async function git(workdir: string, ...args: string[]): Promise<string> {
  const {stdout} = await execFileAsync('git', args, {cwd: workdir});
  return stdout.trim();
}

async function tryGit(workdir: string, ...args: string[]): Promise<string | null> {
  try {
    return await git(workdir, ...args);
  } catch {
    return null;
  }
}

export async function pushWithRegenerateRetry(
  options: PushWithRetryOptions
): Promise<{attempts: number}> {
  const {
    workdir,
    branch,
    commitMessage,
    writeInputs,
    regenerate,
    maxRetries = 3,
    authorName = 'stentorosaur-probe',
    authorEmail = 'probe@stentorosaur.invalid',
    sleep = defaultSleep,
    jitterMs = defaultJitter,
    beforePush,
  } = options;

  let lastError = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Sync to the latest remote state (branch may not exist yet).
    await tryGit(workdir, 'fetch', 'origin', branch);
    const remoteRef = await tryGit(workdir, 'rev-parse', '--verify', `origin/${branch}`);
    if (remoteRef) {
      await git(workdir, 'checkout', '-B', branch, `origin/${branch}`);
    } else {
      // First-ever write: point (possibly unborn) HEAD at the branch name.
      await git(workdir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
    }

    await writeInputs(workdir);
    await regenerate(workdir);

    await git(workdir, 'add', '-A');
    const dirty = await git(workdir, 'status', '--porcelain');
    if (dirty !== '') {
      // Inline identity: stateless CI runners have no global git config.
      await git(
        workdir,
        '-c', `user.name=${authorName}`,
        '-c', `user.email=${authorEmail}`,
        'commit', '-m', commitMessage
      );
    }

    if (beforePush) {
      await beforePush();
    }

    try {
      await git(workdir, 'push', 'origin', `${branch}:${branch}`);
      return {attempts: attempt};
    } catch (err) {
      const stderr =
        err && typeof err === 'object' && 'stderr' in err
          ? String((err as {stderr: unknown}).stderr)
          : String(err);
      if (!isNonFastForward(stderr)) {
        throw err;
      }
      lastError = stderr;
      await sleep(jitterMs(attempt));
    }
  }

  throw new Error(
    `data-branch push rejected (non-fast-forward) after ${maxRetries} retries: ${lastError.slice(0, 200)}`
  );
}
