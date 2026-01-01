/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, {useState, useEffect, useMemo} from 'react';
import Layout from '@theme/Layout';
import IncidentHistory from '../IncidentHistory';
import MaintenanceList from '../Maintenance/MaintenanceList';
import StatusBoard from '../StatusBoard';
import PerformanceMetrics from '../PerformanceMetrics';
import type {StatusData, UptimeStatusPageConfig, SystemStatusFile, StatusItem, DataSource} from '../../types';
import { buildFetchUrl } from '../../data-source-resolver.client';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

// Default configuration with all sections enabled
const DEFAULT_CONFIG: UptimeStatusPageConfig = {
  sections: [
    { id: 'active-incidents', enabled: true },
    { id: 'live-status', enabled: true },
    { id: 'charts', enabled: true },
    { id: 'scheduled-maintenance', enabled: true },
    { id: 'past-maintenance', enabled: true },
    { id: 'past-incidents', enabled: true },
  ],
};

export default function UptimeStatusPage({statusData}: Props): JSX.Element {
  const {
    items = [],
    systems = [],
    incidents = [],
    maintenance = [],
    overallStatus = 'operational',
    useDemoData = false,
    fetchUrl,
    dataSource,
  } = statusData || {};

  // State for system files with historical data
  const [systemFiles, setSystemFiles] = useState<SystemStatusFile[]>([]);

  // Get config from statusData or use default
  const config = DEFAULT_CONFIG;

  // Use systems or items (backward compatibility)
  const statusItems = systems || items || [];

  // Resolve data fetch base URL from dataSource (preferred) or legacy fetchUrl
  const dataBaseUrl = useMemo(() => {
    if (dataSource) {
      // Build URL from dataSource, stripping the file part to get base URL
      const url = buildFetchUrl(dataSource);
      if (url) {
        // Remove file:// prefix for browser context
        const cleanUrl = url.startsWith('file://') ? url.replace('file://', '') : url;
        // Get directory path (remove filename)
        const lastSlash = cleanUrl.lastIndexOf('/');
        return lastSlash > 0 ? cleanUrl.substring(0, lastSlash) : cleanUrl;
      }
    }
    // Fall back to legacy fetchUrl or default
    return fetchUrl || '/status-data';
  }, [dataSource, fetchUrl]);

  console.log('[UptimeStatusPage] Render - statusItems:', statusItems.length, 'systems:', systems?.length, 'items:', items?.length);

  // Load system files for performance metrics
  useEffect(() => {
    console.log('[UptimeStatusPage] useEffect triggered - statusItems:', statusItems.length);
    // If we already have SystemStatusFile objects, use them
    if (systems && systems.length > 0 && 'currentStatus' in systems[0] && 'url' in systems[0]) {
      console.log('[UptimeStatusPage] Using provided SystemStatusFile objects:', systems.length);
      setSystemFiles(systems as unknown as SystemStatusFile[]);
      return;
    }

    // Skip fetching for build-only strategy
    if (dataSource?.strategy === 'build-only') {
      return;
    }
    async function loadSystemFiles() {
      const files: SystemStatusFile[] = [];

      try {
        console.log('[UptimeStatusPage] Fetching', `${dataBaseUrl}/current.json`);
        const response = await fetch(`${dataBaseUrl}/current.json`);
        if (response.ok) {
          const data = await response.json();
          const readings: Array<{
            t: number;
            svc: string;
            state: 'up' | 'down' | 'degraded' | 'maintenance';
            code: number;
            lat: number;
            err?: string;
          }> = data.readings || data; // Support both {readings: [...]} and direct array
          
          console.log('[UptimeStatusPage] Loaded readings:', readings.length);
          
          const serviceMap = new Map<string, typeof readings>();
          for (const reading of readings) {
            const key = reading.svc.toLowerCase();
            if (!serviceMap.has(key)) {
              serviceMap.set(key, []);
            }
            serviceMap.get(key)!.push(reading);
          }
          
          for (const item of statusItems) {
            const serviceReadings = serviceMap.get(item.name.toLowerCase());
            if (serviceReadings && serviceReadings.length > 0) {
              files.push({
                name: item.name,
                url: '',
                lastChecked: new Date(Math.max(...serviceReadings.map(r => r.t))).toISOString(),
                currentStatus: serviceReadings[serviceReadings.length - 1].state,
                history: serviceReadings.map(r => ({
                  timestamp: new Date(r.t).toISOString(),
                  status: r.state,
                  code: r.code,
                  responseTime: r.lat,
                  latency: r.lat,
                  error: r.err,
                })),
              });
            }
          }
          console.log('[UptimeStatusPage] Created system files:', files.length);
        } else {
          console.warn('[UptimeStatusPage] Failed to fetch current.json:', response.status);
        }
      } catch (err) {
        console.warn('[UptimeStatusPage] Could not load status data:', err);
      }
      
      setSystemFiles(files);
    }

    if (statusItems.length > 0) {
      loadSystemFiles();
    }
  }, [statusItems, systems, dataBaseUrl, dataSource]);

  // Default section titles
  const defaultTitles = {
    'active-incidents': '🚨 Active Incidents',
    'live-status': '📊 Live System Status',
    'charts': '📈 Performance Charts',
    'scheduled-maintenance': '🔧 Scheduled Maintenance',
    'past-maintenance': '✅ Past Maintenance',
    'past-incidents': '📜 Past Incidents',
  };

  const sectionTitles = { ...defaultTitles, ...config.sectionTitles };

  // Filter data by status
  const activeIncidents = incidents.filter(i => i.status === 'open');
  const pastIncidents = incidents.filter(i => i.status === 'closed');
  const upcomingMaintenance = maintenance.filter(m => m.status === 'upcoming' || m.status === 'in-progress');
  const pastMaintenance = maintenance.filter(m => m.status === 'completed');

  // Get section configuration
  const getSectionConfig = (id: string) => 
    config.sections.find(s => s.id === id);

  const isEnabled = (id: string) => 
    getSectionConfig(id)?.enabled ?? true;

  // Overall status styling
  const statusClass = {
    operational: styles.statusOperational,
    degraded: styles.statusDegraded,
    outage: styles.statusOutage,
    maintenance: styles.statusMaintenance,
  }[overallStatus] || styles.statusOperational;

  const statusText = {
    operational: 'All Systems Operational',
    degraded: 'Partial System Outage',
    outage: 'Major Service Outage',
    maintenance: 'Scheduled Maintenance in Progress',
  }[overallStatus] || 'All Systems Operational';

  const title = useDemoData ? 'Demo Data: System Status' : 'System Status';
  const description = 'Current operational status of our systems';

  // State for selected system (for performance metrics)
  const [selectedSystemIndex, setSelectedSystemIndex] = useState<number | null>(null);

  const handleSystemClick = (systemName: string) => {
    console.log('[UptimeStatusPage] System clicked:', systemName, 'systemFiles:', systemFiles.length);
    // Don't toggle if systemFiles haven't loaded yet
    if (systemFiles.length === 0) {
      console.warn('[UptimeStatusPage] No system files loaded yet, cannot show metrics');
      return;
    }
    const index = systemFiles.findIndex(s => s.name === systemName);
    console.log('[UptimeStatusPage] Found system at index:', index);
    if (index !== -1) {
      const newIndex = selectedSystemIndex === index ? null : index;
      console.log('[UptimeStatusPage] Setting selectedSystemIndex to:', newIndex);
      setSelectedSystemIndex(newIndex);
    }
  };

  const hasSystemData = (systemName: string) => {
    // Optimistically return true if systemFiles haven't loaded yet
    if (systemFiles.length === 0) {
      return true;
    }
    const system = systemFiles.find(s => s.name === systemName);
    return Boolean(system?.history && system.history.length > 0);
  };

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        <div className="container">
          <header className={styles.header}>
            <h1>{title}</h1>
            <p className={styles.description}>{description}</p>
          </header>

          {/* Active Incidents Section */}
          {isEnabled('active-incidents') && activeIncidents.length > 0 && (
            <IncidentHistory 
              incidents={activeIncidents} 
              title={sectionTitles['active-incidents']}
            />
          )}

          {/* Live Status Section */}
          {isEnabled('live-status') && (
            <>
              <StatusBoard
                items={statusItems}
                incidents={incidents}
                maintenance={maintenance}
                title={sectionTitles['live-status']}
                onSystemClick={handleSystemClick}
                hasSystemData={hasSystemData}
              />
              {selectedSystemIndex !== null && systemFiles[selectedSystemIndex] && (
                <PerformanceMetrics
                  systemFile={systemFiles[selectedSystemIndex]}
                  incidents={incidents}
                  maintenance={maintenance}
                  isVisible={true}
                  onClose={() => setSelectedSystemIndex(null)}
                  useDemoData={useDemoData}
                />
              )}
            </>
          )}

          {/* Scheduled Maintenance Section */}
          {isEnabled('scheduled-maintenance') && upcomingMaintenance.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{sectionTitles['scheduled-maintenance']}</h2>
              <MaintenanceList
                maintenance={upcomingMaintenance}
                filterStatus="all"
                showComments={true}
                showAffectedSystems={true}
                emptyMessage="No upcoming maintenance scheduled"
              />
            </section>
          )}

          {/* Past Maintenance Section */}
          {isEnabled('past-maintenance') && pastMaintenance.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{sectionTitles['past-maintenance']}</h2>
              <MaintenanceList
                maintenance={pastMaintenance}
                filterStatus="completed"
                showComments={false}
                showAffectedSystems={true}
                emptyMessage="No past maintenance to display"
              />
            </section>
          )}

          {/* Past Incidents Section */}
          {isEnabled('past-incidents') && pastIncidents.length > 0 && (
            <IncidentHistory 
              incidents={pastIncidents}
              title={sectionTitles['past-incidents']}
            />
          )}
        </div>
      </main>
    </Layout>
  );
}
