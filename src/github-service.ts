/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Octokit} from '@octokit/rest';
import type {StatusIncident, StatusItem, StatusItemStatus} from './types';

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at?: string;
  html_url: string;
  body?: string | null;
  labels: Array<{name: string}>;
}

export class GitHubStatusService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private statusLabel: string;
  private systemLabels: string[];

  constructor(
    token: string | undefined,
    owner: string,
    repo: string,
    statusLabel: string,
    systemLabels: string[]
  ) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
    this.owner = owner;
    this.repo = repo;
    this.statusLabel = statusLabel;
    this.systemLabels = systemLabels;
  }

  /**
   * Fetch all status-related issues from GitHub
   */
  async fetchStatusIssues(): Promise<GitHubIssue[]> {
    try {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: this.statusLabel,
        state: 'all',
        per_page: 100,
      });

      return response.data as GitHubIssue[];
    } catch (error) {
      console.error('Error fetching status issues:', error);
      return [];
    }
  }

  /**
   * Convert GitHub issues to status incidents
   */
  convertIssueToIncident(issue: GitHubIssue): StatusIncident {
    const labels = issue.labels.map((l) => l.name);
    
    // Determine severity from labels
    let severity: StatusIncident['severity'] = 'minor';
    if (labels.includes('critical')) {
      severity = 'critical';
    } else if (labels.includes('major')) {
      severity = 'major';
    } else if (labels.includes('maintenance')) {
      severity = 'maintenance';
    }

    // Extract affected systems from labels
    const affectedSystems = labels.filter((label) =>
      this.systemLabels.includes(label)
    );

    return {
      id: issue.number,
      title: issue.title,
      status: issue.state as 'open' | 'closed',
      severity,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at || undefined,
      url: issue.html_url,
      body: issue.body || undefined,
      labels,
      affectedSystems,
    };
  }

  /**
   * Generate status items from incidents
   */
  generateStatusItems(incidents: StatusIncident[]): StatusItem[] {
    const systemsMap = new Map<string, StatusItem>();

    // Initialize all systems as 'up'
    for (const system of this.systemLabels) {
      systemsMap.set(system, {
        name: system,
        status: 'up',
        incidentCount: 0,
      });
    }

    // Process incidents to update status
    for (const incident of incidents) {
      if (incident.status === 'open') {
        for (const system of incident.affectedSystems) {
          const currentItem = systemsMap.get(system);
          if (currentItem) {
            // Determine worst status
            let newStatus: StatusItemStatus = 'degraded';
            if (incident.severity === 'critical') {
              newStatus = 'down';
            } else if (incident.severity === 'maintenance') {
              newStatus = 'maintenance';
            }

            // Only update if new status is worse
            if (
              newStatus === 'down' ||
              (newStatus === 'degraded' && currentItem.status !== 'down') ||
              (newStatus === 'maintenance' && currentItem.status === 'up')
            ) {
              currentItem.status = newStatus;
            }

            currentItem.incidentCount = (currentItem.incidentCount || 0) + 1;
          }
        }
      }
    }

    return Array.from(systemsMap.values());
  }

  /**
   * Fetch and process all status data
   */
  async fetchStatusData(): Promise<{
    items: StatusItem[];
    incidents: StatusIncident[];
  }> {
    const issues = await this.fetchStatusIssues();
    const incidents = issues.map((issue) => this.convertIssueToIncident(issue));
    const items = this.generateStatusItems(incidents);

    return {items, incidents};
  }
}
