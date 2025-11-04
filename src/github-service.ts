/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Octokit} from '@octokit/rest';
import type { StatusIncident, StatusItem, StatusItemStatus, ScheduledMaintenance, MaintenanceComment } from './types';
import { calculateResolutionTime } from './time-utils';
import { 
  extractFrontmatter, 
  getMaintenanceStatus, 
  parseMaintenanceComments, 
  isScheduledMaintenance 
} from './maintenance-utils';

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
  comments: number;
}

export interface GitHubComment {
  user: {
    login: string;
  };
  created_at: string;
  body: string;
}

export class GitHubStatusService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private statusLabel: string;
  private systemLabels: string[];
  private maintenanceLabels: string[];

  constructor(
    token: string | undefined,
    owner: string,
    repo: string,
    statusLabel: string,
    systemLabels: string[],
    maintenanceLabels: string[] = ['scheduled-maintenance']
  ) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
    this.owner = owner;
    this.repo = repo;
    this.statusLabel = statusLabel;
    this.systemLabels = systemLabels;
    this.maintenanceLabels = maintenanceLabels;
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
        headers: {
          // Bypass GitHub API cache to get fresh issue data
          'If-None-Match': '',
        },
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

    // Calculate resolution time for closed incidents
    const resolutionTimeMinutes = calculateResolutionTime(
      issue.created_at,
      issue.closed_at || undefined
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
      commentCount: issue.comments,
      resolutionTimeMinutes,
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

  /**
   * Fetch maintenance issues from GitHub
   */
  async fetchMaintenanceIssues(): Promise<GitHubIssue[]> {
    try {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: this.maintenanceLabels.join(','),
        state: 'all',
        per_page: 100,
        sort: 'created',
        direction: 'desc',
        headers: {
          'If-None-Match': '',
        },
      });

      return response.data as GitHubIssue[];
    } catch (error) {
      console.error('Error fetching maintenance issues:', error);
      return [];
    }
  }

  /**
   * Fetch comments for an issue
   */
  async fetchIssueComments(issueNumber: number): Promise<GitHubComment[]> {
    try {
      const response = await this.octokit.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        per_page: 100,
      });

      return response.data as GitHubComment[];
    } catch (error) {
      console.error(`Error fetching comments for issue ${issueNumber}:`, error);
      return [];
    }
  }

  /**
   * Convert GitHub issue to ScheduledMaintenance
   */
  async convertIssueToMaintenance(issue: GitHubIssue): Promise<ScheduledMaintenance | null> {
    const labels = issue.labels.map((l) => l.name);
    
    // Check if this is actually a maintenance issue
    if (!isScheduledMaintenance(labels, this.maintenanceLabels)) {
      return null;
    }

    // Extract frontmatter
    const { frontmatter, content } = extractFrontmatter(issue.body || '');
    
    // Required fields
    if (!frontmatter.start || !frontmatter.end) {
      console.warn(`Maintenance issue #${issue.number} missing start/end times`);
      return null;
    }

    // Fetch comments
    const githubComments = await this.fetchIssueComments(issue.number);
    const comments = parseMaintenanceComments(
      githubComments.map(c => ({
        author: { login: c.user.login },
        created_at: c.created_at,
        body: c.body,
      }))
    );

    // Determine status
    const status = getMaintenanceStatus(frontmatter.start, frontmatter.end, issue.state);

    // Extract affected systems
    const affectedSystems = frontmatter.systems || 
      labels.filter((label) => this.systemLabels.includes(label));

    // Extract description (everything after frontmatter)
    const description = content.trim();

    return {
      id: issue.number,
      title: issue.title,
      start: frontmatter.start,
      end: frontmatter.end,
      status,
      affectedSystems,
      description,
      comments,
      url: issue.html_url,
      createdAt: issue.created_at,
    };
  }

  /**
   * Fetch all scheduled maintenance
   */
  async fetchScheduledMaintenance(): Promise<ScheduledMaintenance[]> {
    const issues = await this.fetchMaintenanceIssues();
    const maintenance: ScheduledMaintenance[] = [];

    for (const issue of issues) {
      const maintenanceItem = await this.convertIssueToMaintenance(issue);
      if (maintenanceItem) {
        maintenance.push(maintenanceItem);
      }
    }

    // Sort by start time
    maintenance.sort((a, b) => {
      const aDate = new Date(a.start).getTime();
      const bDate = new Date(b.start).getTime();
      return bDate - aDate; // Most recent first
    });

    return maintenance;
  }
}
