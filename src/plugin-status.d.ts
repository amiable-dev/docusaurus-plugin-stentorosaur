/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

declare module 'docusaurus-plugin-stentorosaur' {
  export type StatusItemStatus = 'up' | 'down' | 'degraded' | 'maintenance';

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
  }
}

declare module '@theme/StatusBoard' {
  import type {StatusItem} from 'docusaurus-plugin-stentorosaur';
  
  export interface Props {
    items: StatusItem[];
    title?: string;
    description?: string;
  }
  
  export default function StatusBoard(props: Props): JSX.Element;
}

declare module '@theme/StatusItem' {
  import type {StatusItem} from 'docusaurus-plugin-stentorosaur';
  
  export interface Props {
    item: StatusItem;
    showResponseTime?: boolean;
    showUptime?: boolean;
  }
  
  export default function StatusItem(props: Props): JSX.Element;
}

declare module '@theme/IncidentHistory' {
  import type {StatusIncident} from 'docusaurus-plugin-stentorosaur';
  
  export interface Props {
    incidents: StatusIncident[];
    maxItems?: number;
  }
  
  export default function IncidentHistory(props: Props): JSX.Element;
}
