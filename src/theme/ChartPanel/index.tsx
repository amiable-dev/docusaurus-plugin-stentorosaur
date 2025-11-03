/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect } from 'react';
import ResponseTimeChart from '../ResponseTimeChart';
import UptimeChart from '../UptimeChart';
import SLIChart from '../SLIChart';
import type { SystemStatusFile, StatusIncident } from '../../types';
import styles from './styles.module.css';

export interface ChartPanelProps {
  /** System name to load data for */
  systemName: string;
  /** Which charts to show */
  charts?: ('response' | 'uptime' | 'sli' | 'error-budget')[];
  /** Default time period */
  period?: '24h' | '7d' | '30d' | '90d';
  /** Layout: horizontal (side-by-side) or vertical (stacked) */
  layout?: 'horizontal' | 'vertical';
  /** Show period selector */
  showPeriodSelector?: boolean;
  /** Chart height */
  height?: number;
  /** Path to status data */
  dataPath?: string;
}

/**
 * Embeddable chart panel component that can be used in any Docusaurus page
 * to display performance metrics for a specific system.
 * 
 * @example
 * ```tsx
 * import ChartPanel from '@theme/ChartPanel';
 * 
 * <ChartPanel 
 *   systemName="Main Website"
 *   charts={['response', 'uptime']}
 *   layout="horizontal"
 * />
 * ```
 */
export default function ChartPanel({
  systemName,
  charts = ['response', 'uptime'],
  period = '7d',
  layout = 'vertical',
  showPeriodSelector = true,
  height = 300,
  dataPath = 'status-data',
}: ChartPanelProps): JSX.Element {
  const [systemData, setSystemData] = useState<SystemStatusFile | null>(null);
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  useEffect(() => {
    async function loadData() {
      try {
        const fileName = systemName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
        const systemResponse = await fetch(`/${dataPath}/systems/${fileName}.json`);
        
        if (!systemResponse.ok) {
          throw new Error(`Failed to load data for ${systemName}`);
        }
        
        const data: SystemStatusFile = await systemResponse.json();
        setSystemData(data);

        // Try to load incidents
        try {
          const incidentsResponse = await fetch(`/${dataPath}/status.json`);
          if (incidentsResponse.ok) {
            const statusData = await incidentsResponse.json();
            setIncidents(statusData.incidents || []);
          }
        } catch {
          // Incidents are optional, don't fail if not available
          setIncidents([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [systemName, dataPath]);

  if (loading) {
    return (
      <div className={styles.chartPanel}>
        <div className={styles.loading}>Loading chart data...</div>
      </div>
    );
  }

  if (error || !systemData) {
    return (
      <div className={styles.chartPanel}>
        <div className={styles.error}>
          {error || 'No data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chartPanel}>
      <div className={styles.header}>
        <h3>{systemData.name} - Performance Metrics</h3>
        {showPeriodSelector && (
          <div className={styles.periodSelector}>
            {(['24h', '7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                className={`${styles.periodButton} ${selectedPeriod === p ? styles.active : ''}`}
                onClick={() => setSelectedPeriod(p)}
              >
                {p === '24h' ? '24h' : p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`${styles.chartsContainer} ${styles[layout]}`}>
        {charts.includes('response') && (
          <div className={styles.chartWrapper}>
            <h4>Response Time</h4>
            <ResponseTimeChart
              name={systemData.name}
              history={systemData.history}
              period={selectedPeriod}
              height={height}
              showPeriodSelector={false}
            />
          </div>
        )}

        {charts.includes('uptime') && (
          <div className={styles.chartWrapper}>
            <h4>Uptime</h4>
            <UptimeChart
              name={systemData.name}
              history={systemData.history}
              incidents={incidents}
              chartType="bar"
              period={selectedPeriod}
              height={height}
            />
          </div>
        )}

        {charts.includes('sli') && (
          <div className={styles.chartWrapper}>
            <h4>SLI/SLO Compliance</h4>
            <SLIChart
              name={systemData.name}
              history={systemData.history}
              period={selectedPeriod}
              height={height}
              showPeriodSelector={false}
              sloTarget={systemData.sloTarget || 99.9}
            />
          </div>
        )}

        {charts.includes('error-budget') && (
          <div className={styles.chartWrapper}>
            <h4>Error Budget</h4>
            <SLIChart
              name={systemData.name}
              history={systemData.history}
              period={selectedPeriod}
              height={height}
              showPeriodSelector={false}
              showErrorBudget={true}
              sloTarget={systemData.sloTarget || 99.9}
            />
          </div>
        )}
      </div>
    </div>
  );
}
