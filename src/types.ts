/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type StatusItemStatus = 'up' | 'down' | 'degraded' | 'maintenance';

/**
 * Entity type enumeration
 * Replaces the implicit "system" concept with explicit types
 */
export type EntityType =
  | 'system'      // Technical infrastructure
  | 'process'     // Business process
  | 'project'     // Time-bound initiative
  | 'event'       // Scheduled event/campaign
  | 'sla'         // Service level agreement
  | 'custom';     // User-defined

/**
 * ADR-001: Configurable Data Fetching Strategies
 *
 * DataSource is a discriminated union type that defines how the plugin fetches
 * status data at runtime. The 'strategy' field serves as the discriminator.
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

/**
 * GitHub strategy - fetch from raw.githubusercontent.com (public repos only)
 */
export interface GitHubDataSource {
  strategy: 'github';
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch containing status data (default: 'status-data') */
  branch?: string;
  /** Path to status file (default: 'current.json') */
  path?: string;
}

/**
 * HTTP strategy - universal adapter for any HTTP endpoint
 * Covers: GitHub Gists, GitHub Pages, Cloudflare Workers, S3, custom proxies
 */
export interface HttpDataSource {
  strategy: 'http';
  /** URL to fetch status data from */
  url: string;
  /** Optional headers (BUILD-TIME ONLY - never exposed to browser) */
  headers?: Record<string, string>;
  /** Append cache-busting timestamp parameter (default: false) */
  cacheBust?: boolean;
}

/**
 * Static strategy - read from local file (monorepo support)
 */
export interface StaticDataSource {
  strategy: 'static';
  /** Path to local file (relative or absolute) */
  path: string;
}

/**
 * Build-only strategy - no runtime fetch, use only build-time data
 */
export interface BuildOnlyDataSource {
  strategy: 'build-only';
}

/**
 * DataSource discriminated union type
 *
 * Usage in switch statements provides exhaustive type checking:
 * ```typescript
 * function handleDataSource(ds: DataSource) {
 *   switch (ds.strategy) {
 *     case 'github': return ds.owner + '/' + ds.repo;
 *     case 'http': return ds.url;
 *     case 'static': return ds.path;
 *     case 'build-only': return null;
 *     default: const _: never = ds; // Compile error if case missed
 *   }
 * }
 * ```
 */
export type DataSource =
  | GitHubDataSource
  | HttpDataSource
  | StaticDataSource
  | BuildOnlyDataSource;

export interface StatusCheckHistory {
  timestamp: string;
  status: StatusItemStatus;
  code: number;
  responseTime: number;
}

export interface SystemStatusFile {
  name: string;
  url: string;
  lastChecked: string;
  currentStatus: StatusItemStatus;
  history: StatusCheckHistory[];
  timeDay?: number;       // 24-hour average response time in ms
  timeWeek?: number;      // 7-day average response time in ms
  timeMonth?: number;     // 30-day average response time in ms
  uptimeDay?: string;     // 24-hour uptime percentage
  uptimeWeek?: string;    // 7-day uptime percentage
  uptimeMonth?: string;   // 30-day uptime percentage
  uptime?: string;        // All-time uptime percentage
  sloTarget?: number;     // SLO target percentage (e.g., 99.9)
}

export interface StatusItem {
  name: string;
  description?: string;
  status: StatusItemStatus;
  lastChecked?: string;
  uptime?: string;
  responseTime?: number;
  incidentCount?: number;
  history?: StatusCheckHistory[];
}

export interface StatusIncident {
  id: number;
  title: string;
  status: 'open' | 'closed';
  severity: 'critical' | 'major' | 'minor' | 'maintenance';
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  body?: string;
  labels: string[];
  affectedSystems: string[];
  commentCount?: number;
  resolutionTimeMinutes?: number;
}

export interface MaintenanceComment {
  author: string;
  timestamp: string;
  body: string;
}

export interface ScheduledMaintenance {
  id: number;
  title: string;
  start: string;
  end: string;
  status: 'upcoming' | 'in-progress' | 'completed';
  affectedSystems: string[];
  description: string;
  comments: MaintenanceComment[];
  url: string;
  createdAt: string;
}

/**
 * Entity link - documentation, dashboards, etc.
 */
export interface EntityLink {
  url: string;
  label: string;
  icon?: string;
}

/**
 * Monitoring configuration for entities that have uptime checks
 */
export interface MonitoringConfig {
  enabled: boolean;
  url?: string;
  method?: 'GET' | 'POST' | 'HEAD';
  timeout?: number;
  expectedCodes?: number[];
  maxResponseTime?: number;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Status determination logic
 */
export interface StatusLogic {
  /** Source of status information */
  source: 'monitoring' | 'issues' | 'composite';

  /** Rules for determining status from issues */
  rules?: StatusRule[];
}

/**
 * Status rule for issue-based status determination
 */
export interface StatusRule {
  /** Condition to match (e.g., "label:blocker", "severity:critical") */
  condition: string;

  /** Status to set when condition matches */
  status: StatusItemStatus;

  /** Priority (higher priority wins when multiple rules match) */
  priority: number;

  /** Optional message template */
  message?: string;
}

/**
 * Label parsing configuration
 */
export interface LabelScheme {
  /** Separator between type and name (default: ':') */
  separator: string;

  /** Default entity type for unlabeled items (default: 'system') */
  defaultType: EntityType;

  /** Allow labels without type prefix (default: true) */
  allowUntyped: boolean;
}

/**
 * Entity configuration - flexible abstraction for trackable items
 */
export interface Entity {
  /** Unique identifier (kebab-case: 'api', 'customer-onboarding') */
  name: string;

  /** Human-readable display name (defaults to name if not provided) */
  displayName?: string;

  /** Entity type determines status calculation logic */
  type: EntityType;

  /** Description shown on status page */
  description?: string;

  /** Icon (emoji or icon name) for display */
  icon?: string;

  /** Tags for categorization and filtering */
  tags?: string[];

  /** External links (documentation, dashboards, etc.) */
  links?: EntityLink[];

  /** Monitoring configuration (optional, only for monitored entities) */
  monitoring?: MonitoringConfig;

  /** Status determination logic */
  statusLogic?: StatusLogic;

  /** Entity-specific configuration data */
  config?: Record<string, unknown>;
}

/**
 * Chart annotation types for extensible event marking
 */
export type ChartAnnotationType = 'incident' | 'maintenance' | 'deployment' | 'custom';

/**
 * Generic chart annotation interface for marking events on charts
 * Designed to be extensible for future event types (deployments, releases, etc.)
 */
export interface ChartAnnotation {
  /** Unique identifier for the annotation */
  id: string;

  /** Type of annotation */
  type: ChartAnnotationType;

  /** ISO 8601 timestamp of the event */
  timestamp: string;

  /** Display title for the event */
  title: string;

  /** Severity level (used for incidents and some custom events) */
  severity?: 'critical' | 'major' | 'minor' | 'info';

  /** Systems affected by this event */
  affectedSystems: string[];

  /** URL to more details (issue, PR, deployment log, etc.) */
  url?: string;

  /** Icon to display (emoji or icon name) */
  icon?: string;

  /** Custom color for the annotation (CSS color string) */
  color?: string;

  /** Type-specific data for different annotation types */
  data?: {
    // For incidents
    status?: 'open' | 'closed';

    // For maintenance windows (has duration)
    start?: string;
    end?: string;
    maintenanceStatus?: 'upcoming' | 'in-progress' | 'completed';

    // For deployments
    version?: string;
    environment?: string;

    // For custom events
    [key: string]: any;
  };
}

/**
 * ADR-002: Daily summary entry for historical data aggregation
 *
 * Represents aggregated statistics for a single day.
 * Used in daily-summary.json for 90-day heatmap visualization.
 */
export interface DailySummaryEntry {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Uptime percentage as decimal (0.0 to 1.0) */
  uptimePct: number;
  /** Average latency in milliseconds (null if no successful checks) */
  avgLatencyMs: number | null;
  /** 95th percentile latency in milliseconds (null if no successful checks) */
  p95LatencyMs: number | null;
  /** Total number of checks performed */
  checksTotal: number;
  /** Number of successful checks (up or maintenance) */
  checksPassed: number;
  /** Number of incident transitions (up → down) */
  incidentCount: number;
}

/**
 * ADR-002: Daily summary file for historical data aggregation
 *
 * Schema v1 for daily-summary.json, containing aggregated daily statistics
 * for all monitored services over a configurable time window.
 *
 * @see docs/adrs/ADR-002-historical-data-aggregation.md
 */
export interface DailySummaryFile {
  /** Schema version (currently 1) */
  version: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Number of days covered */
  windowDays: number;
  /** Aggregated data per service (key = service name) */
  services: Record<string, DailySummaryEntry[]>;
}

export interface PluginOptions {
  /**
   * GitHub repository owner (defaults to the site's organizationName)
   */
  owner?: string;
  
  /**
   * GitHub repository name (defaults to the site's projectName)
   */
  repo?: string;
  
  /**
   * Label to filter status issues (defaults to 'status')
   */
  statusLabel?: string;

  /**
   * Entity definitions (REQUIRED as of v0.11.0)
   * Replaces deprecated systemLabels
   *
   * When entitiesSource is 'monitorrc' or 'hybrid', this serves as optional overrides
   */
  entities: Entity[];

  /**
   * Source for entity discovery (ADR-003)
   * - 'config': Use only entities from docusaurus.config.js (default, backward compatible)
   * - 'monitorrc': Auto-discover from .monitorrc.json (single source of truth)
   * - 'hybrid': Merge both, with config overriding monitorrc
   *
   * @default 'config'
   */
  entitiesSource?: 'config' | 'monitorrc' | 'hybrid';

  /**
   * Label parsing scheme for GitHub issue labels
   */
  labelScheme?: LabelScheme;

  /**
   * GitHub personal access token for API requests
   * Should be stored in environment variable
   */
  token?: string;
  
  /**
   * How often to update status (in minutes, defaults to 60)
   */
  updateInterval?: number;
  
  /**
   * Path where status data is stored (defaults to 'status-data')
   */
  dataPath?: string;

  /**
   * Title for the status page
   */
  title?: string;

  /**
   * Description for the status page
   */
  description?: string;

  /**
   * Whether to show response times
   */
  showResponseTimes?: boolean;

  /**
   * Whether to show uptime percentages
   */
  showUptime?: boolean;

  /**
   * Whether to use demo data (defaults to true when no token provided)
   */
  useDemoData?: boolean;

  /**
   * Whether to show the services/systems status board
   */
  showServices?: boolean;

  /**
   * Whether to show the incident history
   */
  showIncidents?: boolean;

  /**
   * Whether to show performance metrics (charts, graphs)
   */
  showPerformanceMetrics?: boolean;

  /**
   * SLO targets for each system (in percentage, e.g., 99.9)
   * Key is the system name, value is the target percentage
   */
  systemSLOs?: Record<string, number>;

  /**
   * Default SLO target for systems not specified in systemSLOs
   */
  defaultSLO?: number;

  /**
   * Scheduled maintenance configuration
   */
  scheduledMaintenance?: {
    enabled?: boolean;
    displayDuration?: number; // days to show in past maintenance
    label?: string; // Deprecated: use labels instead
    labels?: string[]; // GitHub labels to identify maintenance
    showComments?: boolean;
    showAffectedSystems?: boolean;
    timezone?: string; // 'UTC' or 'local' or specific timezone
  };

  /**
   * Status page view style: 'default' or 'upptime'
   * - 'default': Original status board layout
   * - 'upptime': Upptime-style structured view with configurable sections
   */
  statusView?: 'default' | 'upptime';

  /**
   * Configuration for Upptime-style status page (only used when statusView is 'upptime')
   */
  uptimeConfig?: UptimeStatusPageConfig;

  /**
   * Direct site/endpoint configuration
   * Alternative to using GitHub issues for monitoring configuration
   */
  sites?: SiteConfig[];

  /**
   * URL for runtime status data fetching
   * When set, theme components will fetch live data from this URL instead of relative paths.
   * Example: 'https://raw.githubusercontent.com/owner/repo/status-data'
   * This enables live status updates without requiring site rebuilds.
   *
   * @deprecated Use `dataSource` instead. Will be removed in v1.0.
   */
  fetchUrl?: string;

  /**
   * Data source configuration for runtime status data fetching.
   *
   * Can be:
   * - A URL string (shorthand for HTTP strategy)
   * - A DataSource object with strategy-specific options
   *
   * @example
   * // String shorthand (HTTP strategy)
   * dataSource: 'https://status-api.example.com/current.json'
   *
   * @example
   * // GitHub strategy (public repos)
   * dataSource: {
   *   strategy: 'github',
   *   owner: 'my-org',
   *   repo: 'my-repo',
   *   branch: 'status-data'
   * }
   *
   * @example
   * // HTTP strategy (gists, proxies, etc.)
   * dataSource: {
   *   strategy: 'http',
   *   url: 'https://gist.githubusercontent.com/.../current.json',
   *   cacheBust: true
   * }
   *
   * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
   */
  dataSource?: DataSource | string;
}

export interface StatusData {
  items: StatusItem[];
  incidents: StatusIncident[];
  maintenance: ScheduledMaintenance[];
  lastUpdated: string;
  showServices?: boolean;
  showIncidents?: boolean;
  showPerformanceMetrics?: boolean;
  useDemoData?: boolean;
  systems?: StatusItem[]; // Alias for items for compatibility
  overallStatus?: 'operational' | 'degraded' | 'outage' | 'maintenance';
  /**
   * URL for runtime status data fetching (passed from plugin options)
   * @deprecated Use `dataSource` instead
   */
  fetchUrl?: string;

  /**
   * Resolved data source configuration for runtime fetching
   * Theme components use this to determine how to fetch live data
   */
  dataSource?: DataSource;
}

export interface UptimeStatusSection {
  id: 'active-incidents' | 'live-status' | 'charts' | 'scheduled-maintenance' | 'past-maintenance' | 'past-incidents';
  enabled: boolean;
}

export interface UptimeStatusPageConfig {
  sections: UptimeStatusSection[];
  sectionTitles?: Record<string, string>;
}

/**
 * Site/Endpoint configuration options
 * Matches Upptime's endpoint configuration: https://upptime.js.org/docs/configuration#endpoints
 */
export interface SiteConfig {
  /**
   * Display name for the site
   */
  name: string;

  /**
   * URL to monitor (supports environment variable substitution with $SECRET_NAME)
   */
  url: string;

  /**
   * HTTP method to use for the check
   * @default 'GET'
   */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

  /**
   * Type of check to perform
   * @default 'http'
   */
  check?: 'http' | 'tcp-ping' | 'ws' | 'ssl';

  /**
   * Port number for TCP ping checks
   */
  port?: number;

  /**
   * Use IPv6 for checks
   * @default false
   */
  ipv6?: boolean;

  /**
   * HTTP headers to send with the request
   * Format: ['Header-Name: value']
   * Supports environment variable substitution with $SECRET_NAME
   */
  headers?: string[];

  /**
   * Request body for POST/PUT/PATCH requests
   * Supports environment variable substitution with $SECRET_NAME
   */
  body?: string;

  /**
   * Expected HTTP status codes that indicate the site is up
   * @default [200]
   */
  expectedStatusCodes?: number[];

  /**
   * Maximum response time in milliseconds before marking as degraded
   */
  maxResponseTime?: number;

  /**
   * Disable SSL certificate verification (use with caution)
   * @default false
   */
  __dangerous__insecure?: boolean;

  /**
   * Disable peer verification for SSL (use with caution)
   * @default false
   */
  __dangerous__disable_verify_peer?: boolean;

  /**
   * Disable host verification for SSL (use with caution)
   * @default false
   */
  __dangerous__disable_verify_host?: boolean;

  /**
   * Mark site as down if response body contains this text
   */
  __dangerous__body_down?: string;

  /**
   * Mark site as degraded if response body contains this text
   */
  __dangerous__body_degraded?: string;

  /**
   * Mark site as down if response body does NOT contain this text
   */
  __dangerous__body_down_if_text_missing?: string;

  /**
   * Mark site as degraded if response body does NOT contain this text
   */
  __dangerous__body_degraded_if_text_missing?: string;

  /**
   * Custom icon for the site (emoji or URL)
   */
  icon?: string;

  /**
   * Custom URL slug for the site's status page
   */
  slug?: string;

  /**
   * GitHub usernames to assign issues to
   */
  assignees?: string[];
}
