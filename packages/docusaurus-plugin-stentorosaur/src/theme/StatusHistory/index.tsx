/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Layout from '@theme/Layout';
import ResponseTimeChart from '../ResponseTimeChart';
import UptimeChart from '../UptimeChart';
import SLIChart from '../SLIChart';
import type { SystemStatusFile } from '../../types';
import { decodeDayRollups, parseEntityDetail, parseSummary } from '@stentorosaur/core';
import { detailToSystemFile, deriveV1BaseUrl, entitySlug } from '../StatusPage';
import { mergeDaysIntoHistory } from '../StatusPage/mergeDays';
import styles from './styles.module.css';

export interface Props {
  readonly dataPath?: string;
  /** Route-injected {dataUrl} — the runtime summary URL the plugin
   * resolved at build time (ticket #103: on Profile C there is no
   * local snapshot in the build, so the entity detail must be fetched
   * from the dataUrl's directory, exactly like the drill-down). */
  readonly config?: {readonly dataUrl?: string};
}

export default function StatusHistory({
  dataPath = 'status-data',
  config,
}: Props = {}): JSX.Element {
  const [systemData, setSystemData] = useState<SystemStatusFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'heatmap'>('bar');

  useEffect(() => {
    async function loadSystemData() {
      try {
        // Extract system name from URL path
        const pathParts = window.location.pathname.split('/');
        const systemName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
        
        if (!systemName) {
          throw new Error('System name not found in URL');
        }

        // v1 (ADR-005): per-entity detail from the dataUrl's directory
        // (works on snapshot deployments AND Profile C serving routes);
        // falls back to the published-snapshot path.
        const v1Base = deriveV1BaseUrl(config?.dataUrl) ?? `/${dataPath}/status/v1`;
        const response = await fetch(`${v1Base}/entities/${systemName}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.statusText}`);
        }
        const detail = parseEntityDetail(await response.json());
        const system = detailToSystemFile(detail);

        // Also pull the 90-day daily series from the summary so the
        // long-range uptime/SLI charts fill their window (issue #114) —
        // the entity-detail readings are only a short rolling window.
        // Optional: if the summary is unavailable the page still renders
        // from readings (short ranges), unchanged.
        try {
          const summaryResponse = await fetch(`${v1Base}/summary.json`);
          if (summaryResponse.ok) {
            const summary = parseSummary(await summaryResponse.json());
            const entity = summary.entities.find(e => entitySlug(e.name) === systemName);
            if (entity) {
              system.days = decodeDayRollups(entity);
            }
          }
        } catch {
          // Summary is an enhancement, not a requirement — keep the
          // readings-only view rather than failing the page.
        }
        setSystemData(system);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load system data');
      } finally {
        setLoading(false);
      }
    }

    loadSystemData();
  }, [dataPath, config]);

  // Merge the 90-day daily series into the history the long-range
  // uptime/SLI charts read (issue #114). No daily series (summary
  // missing) → the raw readings pass through unchanged.
  const chartHistory = useMemo(
    () => (systemData ? mergeDaysIntoHistory(systemData.history, systemData.days ?? [], 90) : []),
    [systemData]
  );

  if (loading) {
    return (
      <Layout title="System History">
        <main className={styles.historyPage}>
          <div className={styles.loading}>Loading historical data...</div>
        </main>
      </Layout>
    );
  }

  if (error || !systemData) {
    return (
      <Layout title="System History">
        <main className={styles.historyPage}>
          <div className={styles.error}>
            <h2>Error Loading Data</h2>
            <p>{error || 'System data not found'}</p>
          </div>
        </main>
      </Layout>
    );
  }

  const statusColors = {
    up: 'var(--ifm-color-success)',
    down: 'var(--ifm-color-danger)',
    degraded: 'var(--ifm-color-warning)',
    maintenance: 'var(--ifm-color-info)',
  };

  return (
    <Layout title={`${systemData.name} - History`}>
      <main className={styles.historyPage}>
        <div className={styles.backButton}>
          <a href="/status" className={styles.backLink}>
            ← Back to Status Page
          </a>
        </div>
        
        <div className={styles.header}>
          <h1>{systemData.name}</h1>
          <div className={styles.headerInfo}>
            <div className={styles.statusBadge} style={{ 
              backgroundColor: statusColors[systemData.currentStatus] 
            }}>
              {systemData.currentStatus.toUpperCase()}
            </div>
            <div className={styles.url}>
              <a href={systemData.url} target="_blank" rel="noopener noreferrer">
                {systemData.url}
              </a>
            </div>
          </div>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>All-Time Uptime</div>
            <div className={styles.metricValue}>{systemData.uptime || 'N/A'}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>24h Uptime</div>
            <div className={styles.metricValue}>{systemData.uptimeDay || 'N/A'}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>7d Uptime</div>
            <div className={styles.metricValue}>{systemData.uptimeWeek || 'N/A'}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>30d Uptime</div>
            <div className={styles.metricValue}>{systemData.uptimeMonth || 'N/A'}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Avg Response (24h)</div>
            <div className={styles.metricValue}>
              {systemData.timeDay ? `${systemData.timeDay} ms` : 'N/A'}
            </div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Avg Response (7d)</div>
            <div className={styles.metricValue}>
              {systemData.timeWeek ? `${systemData.timeWeek} ms` : 'N/A'}
            </div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Avg Response (30d)</div>
            <div className={styles.metricValue}>
              {systemData.timeMonth ? `${systemData.timeMonth} ms` : 'N/A'}
            </div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Last Checked</div>
            <div className={styles.metricValue}>
              {new Date(systemData.lastChecked).toLocaleString()}
            </div>
          </div>
        </div>

        <section className={styles.chartSection}>
          <h2>Response Time Trends</h2>
          <ResponseTimeChart
            name={systemData.name}
            history={systemData.history}
            showPeriodSelector={true}
          />
        </section>

        <section className={styles.chartSection}>
          <div className={styles.chartHeader}>
            <h2>Uptime Overview</h2>
            <div className={styles.chartTypeSelector}>
              <button
                className={chartType === 'bar' ? styles.active : ''}
                onClick={() => setChartType('bar')}
              >
                Bar Chart
              </button>
              <button
                className={chartType === 'heatmap' ? styles.active : ''}
                onClick={() => setChartType('heatmap')}
              >
                Heatmap
              </button>
            </div>
          </div>
          <UptimeChart
            name={systemData.name}
            history={chartHistory}
            chartType={chartType}
            showPeriodSelector={true}
          />
        </section>

        <section className={styles.chartSection}>
          <h2>SLI/SLO Compliance</h2>
          <SLIChart
            name={systemData.name}
            history={chartHistory}
            showPeriodSelector={true}
            sloTarget={systemData.sloTarget || 99.9}
          />
        </section>

        <section className={styles.chartSection}>
          <h2>Error Budget Tracking</h2>
          <SLIChart
            name={systemData.name}
            history={chartHistory}
            showPeriodSelector={true}
            showErrorBudget={true}
            sloTarget={systemData.sloTarget || 99.9}
          />
        </section>

        <section className={styles.dataSection}>
          <h2>Historical Data</h2>
          <p className={styles.dataInfo}>
            Showing {systemData.history.length} recent checks
            {systemData.days?.length
              ? `; uptime and SLI history spans up to ${Math.min(systemData.days.length, 90)} days from the daily summary`
              : ''}
            . Data is updated every 5 minutes.
          </p>
        </section>
      </main>
    </Layout>
  );
}
