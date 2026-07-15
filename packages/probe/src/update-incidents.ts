/**
 * Issue-event handler (ticket #70): fetch status-labeled issues, run
 * core transforms, write inputs + raw provenance, regenerate, push with
 * the §5 retry rule. Replaces scripts/update-status.cjs at the cutover.
 */

import {LabelParser, isMaintenanceIssue, issueToIncidentV1} from '@stentorosaur/core';
import {issueToMaintenanceV1, renderMarkdownToSafeHtml} from '@stentorosaur/core/server';
import type {
  EntityRef,
  LabelScheme,
  MaintenanceWindowV1,
  RawIncidentBody,
  StatusIncidentV1,
} from '@stentorosaur/core';
import type {IssuePayload} from '@stentorosaur/core';
import {writeIncidentInputs, writeRawIssueBody} from './inputs';

export interface FetchIssuesOptions {
  owner: string;
  repo: string;
  statusLabel: string;
  maintenanceLabels: string[];
  token?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch all issues carrying the status OR maintenance labels (paged).
 * The only GitHub API surface probe needs — no Octokit dependency.
 */
export async function fetchStatusIssues(
  options: FetchIssuesOptions
): Promise<IssuePayload[]> {
  const {
    owner,
    repo,
    statusLabel,
    maintenanceLabels,
    token,
    apiBase = 'https://api.github.com',
    fetchImpl = fetch,
  } = options;

  const byNumber = new Map<number, IssuePayload>();
  const labelSets = [statusLabel, ...maintenanceLabels];
  for (const label of labelSets) {
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const url = `${apiBase}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`;
      const res = await fetchImpl(url, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'stentorosaur-probe/1.0',
          ...(token ? {authorization: `Bearer ${token}`} : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`GitHub issues fetch failed: HTTP ${res.status} for label '${label}'`);
      }
      const batch = (await res.json()) as Array<IssuePayload & {pull_request?: unknown}>;
      for (const issue of batch) {
        if (issue.pull_request) continue; // PRs surface in the issues API
        // Normalize at the I/O boundary: transforms assume labels exist.
        byNumber.set(issue.number, {...issue, labels: issue.labels ?? []});
      }
      hasMorePages = batch.length === 100;
      page++;
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

export interface UpdateIncidentInputsOptions {
  entities: EntityRef[];
  maintenanceLabels: string[];
  labelScheme?: Partial<LabelScheme>;
  /** Injected clock (maintenance status + human-date reference) */
  now: Date;
}

/**
 * Transform fetched issues into on-branch inputs. Pure orchestration of
 * core transforms plus file writes — callable from tests with fixture
 * issue payloads (no network).
 */
/** Pure transform half — shared by the git and r2 writers (#99). */
export function transformIssueInputs(
  issues: IssuePayload[],
  options: UpdateIncidentInputsOptions
): {
  incidents: StatusIncidentV1[];
  maintenance: MaintenanceWindowV1[];
  raws: RawIncidentBody[];
  skipped: number;
} {
  const {entities, maintenanceLabels, labelScheme, now} = options;
  const labelParser = new LabelParser(labelScheme);
  const ctx = {entities, labelParser, renderHtml: renderMarkdownToSafeHtml};

  const incidents: StatusIncidentV1[] = [];
  const maintenance: MaintenanceWindowV1[] = [];
  const raws: RawIncidentBody[] = [];
  let skipped = 0;

  for (const issue of issues) {
    raws.push({
      schemaVersion: 1,
      issueNumber: issue.number,
      updatedAt: issue.updated_at,
      bodyMarkdown: issue.body ?? '',
    });

    const labels = issue.labels.map(l => l.name);
    if (isMaintenanceIssue(labels, maintenanceLabels)) {
      const window = issueToMaintenanceV1(issue, {...ctx, now});
      if (window) {
        maintenance.push(window);
      } else {
        skipped++; // malformed frontmatter — reported, never fatal
      }
    } else {
      incidents.push(issueToIncidentV1(issue, ctx));
    }
  }
  return {incidents, maintenance, raws, skipped};
}

export function writeIssueInputs(
  rootDir: string,
  issues: IssuePayload[],
  options: UpdateIncidentInputsOptions
): {incidents: number; maintenance: number; skipped: number} {
  const {incidents, maintenance, raws, skipped} = transformIssueInputs(issues, options);
  for (const raw of raws) {
    writeRawIssueBody(rootDir, raw);
  }
  writeIncidentInputs(rootDir, incidents, maintenance);
  return {incidents: incidents.length, maintenance: maintenance.length, skipped};
}
