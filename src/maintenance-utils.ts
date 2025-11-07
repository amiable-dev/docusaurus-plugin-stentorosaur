/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ScheduledMaintenance, MaintenanceComment } from './types';

interface MaintenanceFrontmatter {
  type?: string;
  start?: string;
  end?: string;
  systems?: string[];
}

/**
 * Extract YAML frontmatter from issue body
 */
export function extractFrontmatter(body: string): {
  frontmatter: MaintenanceFrontmatter;
  content: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = body.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: body,
    };
  }

  const [, frontmatterText, content] = match;
  const frontmatter: MaintenanceFrontmatter = {};

  // Simple YAML parsing for the fields we care about
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key === 'type') {
      frontmatter.type = value;
    } else if (key === 'start') {
      frontmatter.start = value;
    } else if (key === 'end') {
      frontmatter.end = value;
    } else if (key === 'systems') {
      // Handle array format (e.g., "systems:" followed by "  - system1")
      const systemsStart = lines.indexOf(line);
      const systems: string[] = [];
      for (let i = systemsStart + 1; i < lines.length; i++) {
        const systemLine = lines[i];
        if (systemLine.trim().startsWith('-')) {
          systems.push(systemLine.trim().substring(1).trim());
        } else if (!systemLine.trim().startsWith(' ')) {
          break;
        }
      }
      if (systems.length > 0) {
        frontmatter.systems = systems;
      }
    }
  }

  return { frontmatter, content };
}

/**
 * Determine maintenance status based on start/end times
 */
export function getMaintenanceStatus(
  start: string,
  end: string,
  issueState: 'open' | 'closed'
): ScheduledMaintenance['status'] {
  const now = new Date();
  const startDate = new Date(start);
  const endDate = new Date(end);

  // If issue is closed, maintenance is completed
  if (issueState === 'closed') {
    return 'completed';
  }

  // Check if we're currently in the maintenance window
  if (now >= startDate && now <= endDate) {
    return 'in-progress';
  }

  // If start time is in the future, it's upcoming
  if (now < startDate) {
    return 'upcoming';
  }

  // If end time has passed but issue is still open, mark as completed
  return 'completed';
}

/**
 * Parse GitHub issue comments into maintenance comments
 */
export function parseMaintenanceComments(
  comments: Array<{
    author: { login: string };
    created_at: string;
    body: string;
  }>
): MaintenanceComment[] {
  return comments.map((comment) => ({
    author: comment.author.login,
    timestamp: comment.created_at,
    body: comment.body,
  }));
}

/**
 * Check if an issue is a scheduled maintenance based on labels
 */
export function isScheduledMaintenance(
  labels: string[],
  maintenanceLabels: string[] = ['scheduled-maintenance']
): boolean {
  return labels.some((label) => maintenanceLabels.includes(label));
}

/**
 * Format a date string in a specific timezone
 * @param isoDate - ISO 8601 date string (e.g., "2025-01-12T02:00:00Z")
 * @param timezone - Timezone string (e.g., "UTC", "America/New_York", "local")
 * @returns Formatted date string
 */
export function formatDateInTimezone(
  isoDate: string,
  timezone?: string
): string {
  const date = new Date(isoDate);

  // If no timezone specified or timezone is "UTC", use UTC
  if (!timezone || timezone === 'UTC') {
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  }

  // If timezone is "local", use browser's local timezone
  if (timezone === 'local') {
    return date.toLocaleString();
  }

  // Use Intl.DateTimeFormat for specific timezone
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const formatted = new Intl.DateTimeFormat('en-US', options).format(date);
    return `${formatted} (${timezone})`;
  } catch (error) {
    // Fall back to UTC if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to UTC`);
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  }
}

/**
 * Get a short, human-friendly date format for display
 * @param isoDate - ISO 8601 date string
 * @param timezone - Optional timezone
 * @returns Short formatted date (e.g., "Jan 12, 2025 2:00 AM")
 */
export function formatShortDate(
  isoDate: string,
  timezone?: string
): string {
  const date = new Date(isoDate);

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  if (timezone && timezone !== 'local' && timezone !== 'UTC') {
    options.timeZone = timezone;
  }

  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (error) {
    // Fall back to default formatting without timezone
    const fallbackOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    return date.toLocaleString('en-US', fallbackOptions);
  }
}
