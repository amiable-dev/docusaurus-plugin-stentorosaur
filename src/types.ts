/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type StatusItemStatus = 'up' | 'down' | 'degraded' | 'maintenance';

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
   * Labels that identify different systems/processes to track
   */
  systemLabels?: string[];
  
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
