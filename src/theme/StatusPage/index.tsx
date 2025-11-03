/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect } from 'react';
import Layout from '@theme/Layout';
import StatusBoard from '../StatusBoard';
import IncidentHistory from '@theme/IncidentHistory';
import PerformanceMetrics from '../PerformanceMetrics';
import type {StatusData, SystemStatusFile} from '../../types';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

export default function StatusPage({statusData}: Props): JSX.Element {
  const {
    items, 
    incidents, 
    lastUpdated, 
    showServices = true, 
    showIncidents = true,
    showPerformanceMetrics = true,
  } = statusData;
  const [systemFiles, setSystemFiles] = useState<SystemStatusFile[]>([]);
  const [activeSystemIndex, setActiveSystemIndex] = useState<number | null>(null);
  
  // Default values if not provided
  const title = 'System Status';
  const description = 'Current operational status of our systems';

  // Load system files with historical data for charts
  useEffect(() => {
    async function loadSystemFiles() {
      if (!showPerformanceMetrics) {
        return;
      }
      
      const files: SystemStatusFile[] = [];
      
      for (const item of items) {
        try {
          const fileName = item.name.toLowerCase().replace(/\s+/g, '-');
          const response = await fetch(`/status-data/systems/${fileName}.json`);
          
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
      
      setSystemFiles(files);
    }
    
    if (items.length > 0) {
      loadSystemFiles();
    }
  }, [items, showPerformanceMetrics]);

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

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        {showServices && (
          <StatusBoard 
            items={items} 
            title={title} 
            description={description}
            onSystemClick={showPerformanceMetrics && systemFiles.length > 0 ? handleSystemClick : undefined}
            hasSystemData={showPerformanceMetrics ? hasSystemData : undefined}
          />
        )}
        
        {showPerformanceMetrics && activeSystemIndex !== null && systemFiles[activeSystemIndex] && (
          <PerformanceMetrics
            systemFile={systemFiles[activeSystemIndex]}
            isVisible={true}
            onClose={() => setActiveSystemIndex(null)}
          />
        )}
        
        {showIncidents && incidents && incidents.length > 0 && (
          <IncidentHistory incidents={incidents} />
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
              Docusaurus Stentorosaur Plugin
            </a>
          </p>
        </div>
      </main>
    </Layout>
  );
}
