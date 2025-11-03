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
}

export interface StatusData {
  items: StatusItem[];
  incidents: StatusIncident[];
  lastUpdated: string;
  showServices?: boolean;
  showIncidents?: boolean;
  showPerformanceMetrics?: boolean;
}
