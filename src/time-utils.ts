/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Calculate resolution time in minutes between created and closed dates
 */
export function calculateResolutionTime(
  createdAt: string,
  closedAt: string | undefined
): number | undefined {
  if (!closedAt) {
    return undefined;
  }

  const created = new Date(createdAt);
  const closed = new Date(closedAt);
  
  if (isNaN(created.getTime()) || isNaN(closed.getTime())) {
    return undefined;
  }

  const diffMs = closed.getTime() - created.getTime();
  return Math.round(diffMs / 1000 / 60); // Convert to minutes
}

/**
 * Format duration in a human-readable way
 * @param minutes - Duration in minutes
 * @returns Formatted string like "5 minutes", "2 hours", "3 days"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) {
    return 'less than a minute';
  }
  
  if (minutes < 60) {
    const rounded = Math.round(minutes);
    return `${rounded} minute${rounded !== 1 ? 's' : ''}`;
  }
  
  if (minutes < 1440) { // Less than 24 hours
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }
  
  // 24 hours or more
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  
  if (hours === 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  
  return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Format resolution info for display
 * @param resolutionMinutes - Time to resolve in minutes
 * @param commentCount - Number of comments/posts
 * @returns Formatted string like "Resolved in 47 minutes with 5 posts"
 */
export function formatResolutionInfo(
  resolutionMinutes: number | undefined,
  commentCount: number | undefined
): string | undefined {
  if (resolutionMinutes === undefined && commentCount === undefined) {
    return undefined;
  }

  const parts: string[] = [];

  if (resolutionMinutes !== undefined) {
    parts.push(`Resolved in ${formatDuration(resolutionMinutes)}`);
  }

  if (commentCount !== undefined && commentCount > 0) {
    parts.push(`with ${commentCount} post${commentCount !== 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}
