/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as chrono from 'chrono-node';
import type { ScheduledMaintenance, MaintenanceComment } from './types';

interface MaintenanceFrontmatter {
  type?: string;
  start?: string;
  end?: string;
  systems?: string[];
}

/**
 * Parse human-friendly date strings to ISO 8601
 * Supports:
 * - ISO 8601: "2025-11-15T02:00:00Z"
 * - Friendly: "@tomorrow 2am UTC", "@today 14:30", "tomorrow at 2pm"
 * - Relative: "+2h", "+30m", "in 3 hours"
 *
 * @param dateStr - Date string to parse
 * @param referenceDate - Reference date for relative parsing (default: now)
 * @returns ISO 8601 string or null if unparseable
 */
export function parseHumanDate(dateStr: string, referenceDate?: Date): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();

  // Already ISO 8601? Return as-is
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(trimmed)) {
    return trimmed;
  }

  // Handle @shorthand notation (@tomorrow, @today)
  let processedStr = trimmed;
  if (processedStr.startsWith('@')) {
    processedStr = processedStr.substring(1); // Remove @ prefix
  }

  // Parse with chrono-node
  const refDate = referenceDate || new Date();
  const parsed = chrono.parseDate(processedStr, refDate);

  if (parsed) {
    return parsed.toISOString();
  }

  // Fallback: try as-is (might be valid date string)
  try {
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString();
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Extract YAML frontmatter from issue body
 * Skips GitHub issue form headings (###) that appear before frontmatter
 */
export function extractFrontmatter(body: string): {
  frontmatter: MaintenanceFrontmatter;
  content: string;
} {
  // Skip GitHub issue form headings (e.g., "### Maintenance Details")
  // GitHub adds these headings BEFORE user content, breaking frontmatter parsing
  // Only skip headings that appear before the frontmatter delimiter (---)
  const lines = body.split('\n');
  let contentStart = 0;

  // Find the first frontmatter delimiter
  const firstDelimiterIndex = lines.findIndex(line => line.trim() === '---');

  // Only skip headings if there's a frontmatter delimiter
  if (firstDelimiterIndex !== -1) {
    // Skip leading headings and blank lines that appear before the frontmatter delimiter
    while (contentStart < firstDelimiterIndex) {
      const line = lines[contentStart].trim();
      if (line.startsWith('#') || line === '') {
        contentStart++;
      } else {
        break;
      }
    }
  }

  // Reconstruct body without heading pollution
  const cleanedBody = lines.slice(contentStart).join('\n');

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = cleanedBody.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: cleanedBody,
    };
  }

  const [, frontmatterText, content] = match;
  const frontmatter: MaintenanceFrontmatter = {};

  // Simple YAML parsing for the fields we care about
  const frontmatterLines = frontmatterText.split('\n');
  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key === 'type') {
      frontmatter.type = value;
    } else if (key === 'start') {
      // Parse human-friendly dates to ISO 8601
      const parsed = parseHumanDate(value);
      frontmatter.start = parsed || value; // Fallback to raw value if unparseable
    } else if (key === 'end') {
      // Parse human-friendly dates to ISO 8601
      const parsed = parseHumanDate(value);
      frontmatter.end = parsed || value; // Fallback to raw value if unparseable
    } else if (key === 'systems') {
      // Handle array format (e.g., "systems:" followed by "  - system1")
      const systemsStart = frontmatterLines.indexOf(line);
      const systems: string[] = [];
      for (let i = systemsStart + 1; i < frontmatterLines.length; i++) {
        const systemLine = frontmatterLines[i];
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
