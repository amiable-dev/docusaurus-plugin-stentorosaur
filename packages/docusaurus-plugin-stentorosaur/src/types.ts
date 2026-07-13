/**
 * Plugin types — v1.0 (ADR-005). The data contract lives in
 * @stentorosaur/core (status/v1 schemas); these are the plugin-side
 * option and render shapes.
 */

import type {DayRollup, StatusSummary} from '@stentorosaur/core';

export type StatusItemStatus = 'up' | 'down' | 'degraded' | 'maintenance';

export interface StatusCheckHistory {
  timestamp: string;
  status: StatusItemStatus;
  code: number;
  responseTime: number;
}

/** Per-system chart data (fed from status/v1/entities/<slug>.json). */
export interface SystemStatusFile {
  name: string;
  url: string;
  lastChecked: string;
  currentStatus: StatusItemStatus;
  history: StatusCheckHistory[];
  timeDay?: number;
  timeWeek?: number;
  timeMonth?: number;
  uptimeDay?: string;
  uptimeWeek?: string;
  uptimeMonth?: string;
  uptime?: string;
  sloTarget?: number;
}

export interface StatusItem {
  name: string;
  displayName?: string;
  description?: string;
  status: StatusItemStatus;
  lastChecked?: string;
  uptime?: string;
  responseTime?: number;
  incidentCount?: number;
  history?: StatusCheckHistory[];
  /** Decoded 90-day rollups from the v1 summary (oldest→newest) */
  days?: DayRollup[];
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
  /** Sanitized HTML, rendered at WRITE time by @stentorosaur/core (§7) */
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
  /** Sanitized HTML, rendered at WRITE time by @stentorosaur/core (§7) */
  description: string;
  comments: MaintenanceComment[];
  url: string;
  createdAt: string;
}

export type ChartAnnotationType = 'incident' | 'maintenance' | 'deployment' | 'custom';

/** Generic chart annotation for marking events on charts. */
export interface ChartAnnotation {
  id: string;
  type: ChartAnnotationType;
  timestamp: string;
  title: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
  affectedSystems: string[];
  url?: string;
  icon?: string;
  color?: string;
  data?: {
    status?: 'open' | 'closed';
    start?: string;
    end?: string;
    maintenanceStatus?: 'upcoming' | 'in-progress' | 'completed';
    version?: string;
    environment?: string;
    [key: string]: any;
  };
}

/** Display-only entity metadata layered onto the summary's entities. */
export interface EntityDisplay {
  /** Must match the entity name in the data plane */
  name: string;
  displayName?: string;
  description?: string;
}

export interface PluginOptions {
  /** GitHub owner (defaults to the site's organizationName) — issue links */
  owner?: string;
  /** GitHub repo (defaults to the site's projectName) — issue links */
  repo?: string;

  /**
   * status/v1 summary.json endpoint (ADR-005 §3/§4). Fetched at build
   * time for the SSG snapshot and by the client for live refresh.
   * PUBLIC endpoints only — private repos use the build-time snapshot
   * from a checked-out data branch under dataPath (§9).
   */
  dataUrl?: string;

  /** Local directory holding status/v1 at build time (default 'status-data') */
  dataPath?: string;

  /** Status page title */
  title?: string;

  /** Status page description */
  description?: string;

  /** Display metadata (descriptions/display names) merged onto entities */
  entities?: EntityDisplay[];

  showServices?: boolean;
  showIncidents?: boolean;
  showPerformanceMetrics?: boolean;

  /** SLO targets per system (percentage, e.g. 99.9) */
  systemSLOs?: Record<string, number>;
  /** Default SLO target for systems not in systemSLOs */
  defaultSLO?: number;

  /** 'default' status board or 'upptime' structured layout */
  statusView?: 'default' | 'upptime';

  /** 'minimal' cards with uptime bars (default) or 'detailed' cards */
  statusCardLayout?: 'minimal' | 'detailed';

  /** Section layout for the 'upptime' view */
  uptimeConfig?: UptimeStatusPageConfig;
}

export interface StatusData {
  items: StatusItem[];
  incidents: StatusIncident[];
  maintenance: ScheduledMaintenance[];
  lastUpdated: string;
  title?: string;
  description?: string;
  showServices?: boolean;
  showIncidents?: boolean;
  showPerformanceMetrics?: boolean;
  statusCardLayout?: 'minimal' | 'detailed';
  /** Injected from package.json at load time (ADR-005 §11) */
  pluginVersion?: string;
  /** The raw v1 summary snapshot embedded at build time (§4) */
  v1Summary?: StatusSummary;
  /** Endpoint the client refreshes the summary from */
  dataUrl?: string;
  /** Base for issue links */
  repoUrl?: string;
}

export interface UptimeStatusSection {
  id:
    | 'active-incidents'
    | 'live-status'
    | 'charts'
    | 'scheduled-maintenance'
    | 'past-maintenance'
    | 'past-incidents';
  enabled: boolean;
}

export interface UptimeStatusPageConfig {
  sections: UptimeStatusSection[];
  sectionTitles?: Record<string, string>;
}
