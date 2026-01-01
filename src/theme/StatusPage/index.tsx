/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Layout from '@theme/Layout';
import StatusBoard from '../StatusBoard';
import IncidentHistory from '../IncidentHistory';
import MaintenanceList from '../Maintenance/MaintenanceList';
import PerformanceMetrics from '../PerformanceMetrics';
import type {StatusData, SystemStatusFile, DataSource} from '../../types';
import {PLUGIN_VERSION} from '../../version';
import { buildFetchUrl } from '../../data-source-resolver.client';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

export default function StatusPage({statusData}: Props): JSX.Element {
  const {
    items = [],
    incidents = [],
    maintenance = [],
    lastUpdated,
    showServices = true,
    showIncidents = true,
    showPerformanceMetrics = true,
    useDemoData = false,
    fetchUrl,
    dataSource,
  } = statusData || {};
  const [systemFiles, setSystemFiles] = useState<SystemStatusFile[]>([]);
  const [activeSystemIndex, setActiveSystemIndex] = useState<number | null>(null);

  // Default values if not provided
  const title = useDemoData ? 'Demo Data: System Status' : 'System Status';
  const description = 'Current operational status of our systems';

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

  // Helper: Create SystemStatusFile from build-time item data
  const createSystemFilesFromItems = (): SystemStatusFile[] => {
    const files: SystemStatusFile[] = [];
    for (const item of items) {
      if (item.history && item.history.length > 0) {
        files.push({
          name: item.name,
          url: '',
          lastChecked: item.lastChecked || new Date().toISOString(),
          currentStatus: item.status,
          history: item.history,
        });
      }
    }
    return files;
  };

  // Load system files with historical data for charts
  useEffect(() => {
    async function loadSystemFiles() {
      if (!showPerformanceMetrics) {
        return;
      }

      // For build-only strategy, use build-time data from items
      if (dataSource?.strategy === 'build-only') {
        const buildTimeFiles = createSystemFilesFromItems();
        if (buildTimeFiles.length > 0) {
          setSystemFiles(buildTimeFiles);
        }
        return;
      }

      const files: SystemStatusFile[] = [];
      try {
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
          }> = data.readings || data;

          // Group readings by service
          const serviceMap = new Map<string, typeof readings>();
          for (const reading of readings) {
            const key = reading.svc.toLowerCase();
            if (!serviceMap.has(key)) {
              serviceMap.set(key, []);
            }
            serviceMap.get(key)!.push(reading);
          }

          // Convert to SystemStatusFile format
          for (const item of items) {
            const serviceReadings = serviceMap.get(item.name.toLowerCase());
            if (serviceReadings && serviceReadings.length > 0) {
              files.push({
                name: item.name,
                url: '', // URL not available in current.json format
                lastChecked: new Date(Math.max(...serviceReadings.map(r => r.t))).toISOString(),
                currentStatus: serviceReadings[serviceReadings.length - 1].state,
                history: serviceReadings.map(r => ({
                  timestamp: new Date(r.t).toISOString(),
                  status: r.state,
                  code: r.code,
                  responseTime: r.lat,
                })),
              });
            }
          }

          setSystemFiles(files);
          return; // Success, don't try legacy format
        }
      } catch (error) {
        // Fall through to legacy format or build-time fallback
      }

      // Fallback to legacy format (systems/*.json)
      for (const item of items) {
        try {
          // Use same slug generation as plugin to ensure filename matches
          const fileName = item.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-'); // Replace multiple hyphens with single
          const response = await fetch(`${dataBaseUrl}/systems/${fileName}.json`);

          if (response.ok) {
            const data: SystemStatusFile = await response.json();
            if (data.history && data.history.length > 0) {
              files.push(data);
            }
          }
        } catch (error) {
          // Silently ignore - file might not exist
        }
      }

      // If no runtime data fetched, fall back to build-time data
      if (files.length === 0) {
        const buildTimeFiles = createSystemFilesFromItems();
        setSystemFiles(buildTimeFiles);
      } else {
        setSystemFiles(files);
      }
    }

    if (items.length > 0) {
      loadSystemFiles();
    }
  }, [items, showPerformanceMetrics, dataBaseUrl, dataSource]);

  // Handle system card click to toggle performance metrics
  const handleSystemClick = (systemName: string) => {
    if (!showPerformanceMetrics || systemFiles.length === 0) {
      return;
    }

    const index = systemFiles.findIndex(
      (file) => file.name === systemName
    );

    if (index === -1) {
      // System doesn't have data, don't toggle
      return;
    }

    // Toggle: if clicking the same system, hide metrics; otherwise show new system
    setActiveSystemIndex(activeSystemIndex === index ? null : index);
  };

  // Check if a system has data (for determining if it should be clickable)
  const hasSystemData = (systemName: string): boolean => {
    return systemFiles.some((file) => file.name === systemName);
  };

  // Split maintenance into upcoming/in-progress and past
  const upcomingMaintenance = maintenance.filter(
    m => m.status === 'upcoming' || m.status === 'in-progress'
  );
  const pastMaintenance = maintenance.filter(m => m.status === 'completed');

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        {showServices && (
          <StatusBoard
            items={items}
            incidents={incidents}
            maintenance={maintenance}
            title={title}
            description={description}
            onSystemClick={showPerformanceMetrics && systemFiles.length > 0 ? handleSystemClick : undefined}
            hasSystemData={showPerformanceMetrics ? hasSystemData : undefined}
          />
        )}
        
        {showPerformanceMetrics && activeSystemIndex !== null && systemFiles[activeSystemIndex] && (
          <PerformanceMetrics
            systemFile={systemFiles[activeSystemIndex]}
            incidents={incidents}
            maintenance={maintenance}
            isVisible={true}
            onClose={() => setActiveSystemIndex(null)}
            useDemoData={useDemoData}
          />
        )}

        {upcomingMaintenance.length > 0 && (
          <section className={styles.maintenanceSection}>
            <h2 className={styles.sectionTitle}>Scheduled Maintenance</h2>
            <MaintenanceList
              maintenance={upcomingMaintenance}
              filterStatus="all"
              showComments={true}
              showAffectedSystems={true}
              emptyMessage="No upcoming maintenance scheduled"
            />
          </section>
        )}

        {showIncidents && incidents && incidents.length > 0 && (
          <IncidentHistory incidents={incidents} useDemoData={useDemoData} />
        )}

        {pastMaintenance.length > 0 && (
          <section className={styles.maintenanceSection}>
            <h2 className={styles.sectionTitle}>Past Maintenance</h2>
            <MaintenanceList
              maintenance={pastMaintenance}
              filterStatus="completed"
              showComments={false}
              showAffectedSystems={true}
              emptyMessage="No past maintenance to display"
            />
          </section>
        )}

        <div className={styles.footer}>
          <p className={styles.lastUpdated}>
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
          <p className={styles.poweredBy}>
            Powered by{' '}
            <a
              href="https://github.com/amiable-dev/docusaurus-plugin-stentorosaur"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docusaurus Stentorosaur Plugin v{PLUGIN_VERSION}
            </a>
          </p>
        </div>
      </main>
    </Layout>
  );
}
