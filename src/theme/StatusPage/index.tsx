/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect } from 'react';
import Layout from '@theme/Layout';
import StatusBoard from '@theme/StatusBoard';
import IncidentHistory from '@theme/IncidentHistory';
import ResponseTimeChart from '../ResponseTimeChart';
import UptimeChart from '../UptimeChart';
import type {StatusData, SystemStatusFile} from '../../types';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

export default function StatusPage({statusData}: Props): JSX.Element {
  const {items, incidents, lastUpdated, showServices = true, showIncidents = true} = statusData;
  const [systemFiles, setSystemFiles] = useState<SystemStatusFile[]>([]);
  const [showCharts, setShowCharts] = useState(false);
  
  // Default values if not provided
  const title = 'System Status';
  const description = 'Current operational status of our systems';

  // Load system files with historical data for charts
  useEffect(() => {
    async function loadSystemFiles() {
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
      setShowCharts(files.length > 0);
    }
    
    if (items.length > 0) {
      loadSystemFiles();
    }
  }, [items]);

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        {showServices && (
          <StatusBoard 
            items={items} 
            title={title} 
            description={description} 
          />
        )}
        
        {showCharts && systemFiles.length > 0 && (
          <section className={styles.chartsSection}>
            <h2 className={styles.sectionTitle}>Performance Metrics</h2>
            <p className={styles.sectionDescription}>
              Historical response time and uptime data for our systems
            </p>
            
            <div className={styles.chartsGrid}>
              {systemFiles.map((systemFile) => (
                <div key={systemFile.name} className={styles.chartCard}>
                  <h3 className={styles.chartCardTitle}>{systemFile.name}</h3>
                  
                  <ResponseTimeChart
                    name={systemFile.name}
                    history={systemFile.history}
                    period="7d"
                    height={250}
                    showPeriodSelector={false}
                  />
                  
                  <UptimeChart
                    name={systemFile.name}
                    history={systemFile.history}
                    chartType="bar"
                    period="7d"
                    height={200}
                  />
                  
                  <div className={styles.viewDetails}>
                    <a 
                      href={`/status/history/${systemFile.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')}`}
                      className={styles.viewDetailsLink}
                    >
                      View detailed history →
                    </a>
                  </div>
                </div>
              ))}
            </div>
            
            {systemFiles.length > 0 && (
              <p className={styles.moreSystemsNote}>
                Showing {systemFiles.length} system{systemFiles.length !== 1 ? 's' : ''} with historical data
              </p>
            )}
          </section>
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
