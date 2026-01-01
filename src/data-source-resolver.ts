/**
 * ADR-001: Data Source Resolver
 *
 * Resolves plugin configuration into executable DataSource strategies.
 * Handles:
 * - New dataSource configuration (preferred)
 * - Legacy fetchUrl conversion (deprecated)
 * - URL pattern detection for strategy inference
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import type {
  DataSource,
  GitHubDataSource,
  HttpDataSource,
  PluginOptions,
} from './types';
import { dataSourceSchema } from './options';

/**
 * Default values for GitHub strategy
 */
const GITHUB_DEFAULTS = {
  branch: 'status-data',
  path: 'current.json',
} as const;

/**
 * Regex to parse raw.githubusercontent.com URLs
 * Format: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
 */
const RAW_GITHUB_URL_REGEX = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/;

/**
 * Resolve plugin options to a DataSource configuration.
 *
 * Priority:
 * 1. dataSource (new, preferred)
 * 2. fetchUrl (deprecated, with warning)
 * 3. build-only (default)
 *
 * @param options - Plugin options
 * @returns Resolved DataSource configuration
 */
export function resolveDataSource(options: Partial<PluginOptions>): DataSource {
  // dataSource takes precedence
  if (options.dataSource !== undefined) {
    // Warn if fetchUrl is also present
    if (options.fetchUrl !== undefined) {
      console.warn(
        '[Stentorosaur] Both dataSource and fetchUrl provided. ' +
        'dataSource takes precedence, fetchUrl will be ignored.'
      );
    }

    // Handle string shorthand
    if (typeof options.dataSource === 'string') {
      return {
        strategy: 'http',
        url: options.dataSource,
        cacheBust: false,
      };
    }

    // Validate and apply defaults
    const result = dataSourceSchema.validate(options.dataSource);
    if (result.error) {
      throw result.error;
    }

    return result.value as DataSource;
  }

  // Legacy fetchUrl support (deprecated)
  if (options.fetchUrl !== undefined) {
    console.warn(
      '[Stentorosaur] fetchUrl is deprecated. Use dataSource instead. ' +
      'fetchUrl will be removed in v1.0.'
    );

    // Infer strategy from URL pattern
    return inferStrategyFromUrl(options.fetchUrl);
  }

  // Default: build-only
  return { strategy: 'build-only' };
}

/**
 * Build the fetch URL for a given DataSource configuration.
 *
 * @param dataSource - Resolved DataSource configuration
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

/**
 * Infer DataSource strategy from a URL pattern.
 *
 * Used for legacy fetchUrl conversion. Detects:
 * - raw.githubusercontent.com -> github strategy (with parsed owner/repo/branch)
 * - Everything else -> http strategy
 *
 * @param url - URL to analyze
 * @returns Inferred DataSource configuration
 */
export function inferStrategyFromUrl(url: string): DataSource {
  // Check for raw.githubusercontent.com pattern
  const rawGitHubMatch = url.match(RAW_GITHUB_URL_REGEX);

  if (rawGitHubMatch) {
    const [, owner, repo, branch, pathWithSlash] = rawGitHubMatch;

    // Handle empty or trailing slash paths
    let path = pathWithSlash?.replace(/^\/+/, '').replace(/\/+$/, '') || GITHUB_DEFAULTS.path;
    if (!path) {
      path = GITHUB_DEFAULTS.path;
    }

    const gitHubDataSource: GitHubDataSource = {
      strategy: 'github',
      owner,
      repo,
      branch,
      path,
    };

    return gitHubDataSource;
  }

  // Default: treat as HTTP URL
  const httpDataSource: HttpDataSource = {
    strategy: 'http',
    url,
    cacheBust: false,
  };

  return httpDataSource;
}
