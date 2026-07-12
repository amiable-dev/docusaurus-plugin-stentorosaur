/**
 * ADR-001: Client-Safe Data Source Resolver
 *
 * This module provides URL building utilities that can be safely imported
 * in browser/client contexts. It does NOT import any Node.js-only modules
 * like @docusaurus/utils-validation.
 *
 * For server-side validation and resolution, use data-source-resolver.ts.
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import type { DataSource } from './types';

/**
 * Default values for GitHub strategy
 */
const GITHUB_DEFAULTS = {
  branch: 'status-data',
  path: 'current.json',
} as const;

/**
 * Build the fetch URL for a given DataSource configuration.
 *
 * This is the client-safe version that can be used in browser contexts.
 * It assumes the DataSource has already been validated.
 *
 * @param dataSource - Validated DataSource configuration
 * @returns URL string for fetching, or null for build-only strategy
 */
export function buildFetchUrl(dataSource: DataSource): string | null {
  switch (dataSource.strategy) {
    case 'github': {
      const { owner, repo, branch = GITHUB_DEFAULTS.branch, path = GITHUB_DEFAULTS.path } = dataSource;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }

    case 'http': {
      let url = dataSource.url;

      // Append cache-busting parameter if enabled
      if (dataSource.cacheBust) {
        const timestamp = Date.now();
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}t=${timestamp}`;
      }

      return url;
    }

    case 'static': {
      // Use file:// protocol for local files
      const path = dataSource.path;
      if (path.startsWith('/')) {
        return `file://${path}`;
      }
      return `file://${path}`;
    }

    case 'build-only':
      return null;

    default: {
      // Exhaustive check
      const _exhaustive: never = dataSource;
      throw new Error(`Unknown strategy: ${(_exhaustive as DataSource).strategy}`);
    }
  }
}
