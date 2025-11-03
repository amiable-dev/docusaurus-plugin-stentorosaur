/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useCallback } from 'react';
import ResponseTimeChart from '../ResponseTimeChart';
import UptimeChart from '../UptimeChart';
import SLIChart from '../SLIChart';
import type { SystemStatusFile, StatusIncident } from '../../types';
import styles from './styles.module.css';

export interface PerformanceMetricsProps {
  /** System status file with historical data */
  systemFile: SystemStatusFile;
  /** Incidents that may affect this system */
  incidents?: StatusIncident[];
  /** Whether to show the metrics (controlled externally) */
  isVisible: boolean;
  /** Callback when close/collapse is requested */
  onClose?: () => void;
}

type TimePeriod = '24h' | '7d' | '30d' | '90d';
type ChartType = 'response' | 'uptime' | 'sli' | 'error-budget';

export default function PerformanceMetrics({
  systemFile,
  incidents,
  isVisible,
  onClose,
  useDemoData = false,
}: PerformanceMetricsProps): JSX.Element | null {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('7d');
  const [fullscreenChart, setFullscreenChart] = useState<ChartType | null>(null);
  const [uptimeChartType, setUptimeChartType] = useState<'bar' | 'heatmap'>('bar');

  const handleChartClick = useCallback((chartType: ChartType) => {
    setFullscreenChart(chartType);
  }, []);

  const handleCloseFullscreen = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setFullscreenChart(null);
  }, []);

  const handlePeriodChange = useCallback((period: TimePeriod) => {
    setSelectedPeriod(period);
  }, []);

  if (!isVisible) {
    return null;
  }

  const isFullscreen = fullscreenChart !== null;

  return (
    <>
      {/* Main performance metrics section */}
      <section className={styles.performanceMetrics} data-system={systemFile.name}>
        <div className={styles.header}>
          <h3 className={styles.title}>Performance Metrics - {systemFile.name}</h3>
          {onClose && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close performance metrics"
            >
              ✕
            </button>
          )}
        </div>

        {/* Period selector - controls all charts */}
        <div className={styles.periodSelector}>
          <span className={styles.periodLabel}>Time Period:</span>
          <div className={styles.periodButtons}>
            {(['24h', '7d', '30d', '90d'] as TimePeriod[]).map((period) => (
              <button
                key={period}
                className={`${styles.periodButton} ${
                  selectedPeriod === period ? styles.active : ''
                }`}
                onClick={() => handlePeriodChange(period)}
              >
                {period === '24h' ? '24 Hours' : period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Charts grid - side by side on desktop */}
        <div className={styles.chartsGrid}>
          <div className={styles.chartWrapper} onClick={() => handleChartClick('response')}>
            <div className={styles.chartHeader}>
              <h4>Response Time</h4>
              <span className={styles.zoomHint}>Click to enlarge</span>
            </div>
            <ResponseTimeChart
              name={systemFile.name}
              history={systemFile.history}
              period={selectedPeriod}
              height={280}
              showPeriodSelector={false}
            />
          </div>

          <div className={styles.chartWrapper} onClick={() => handleChartClick('uptime')}>
            <div className={styles.chartHeader}>
              <h4>Uptime</h4>
              <div className={styles.chartControls}>
                <select
                  value={uptimeChartType}
                  onChange={(e) => setUptimeChartType(e.target.value as 'bar' | 'heatmap')}
                  onClick={(e) => e.stopPropagation()}
                  className={styles.chartTypeSelect}
                >
                  <option value="bar">Bar Chart</option>
                  <option value="heatmap">Heatmap</option>
                </select>
                <span className={styles.zoomHint}>Click to enlarge</span>
              </div>
            </div>
            <UptimeChart
              name={systemFile.name}
              history={systemFile.history}
              incidents={incidents}
              chartType={uptimeChartType}
              period={selectedPeriod}
              height={280}
            />
          </div>

          <div className={styles.chartWrapper} onClick={() => handleChartClick('sli')}>
            <div className={styles.chartHeader}>
              <h4>SLI/SLO Compliance</h4>
              <span className={styles.zoomHint}>Click to enlarge</span>
            </div>
            <SLIChart
              name={systemFile.name}
              history={systemFile.history}
              period={selectedPeriod}
              height={280}
              showPeriodSelector={false}
              sloTarget={systemFile.sloTarget || 99.9}
            />
          </div>

          <div className={styles.chartWrapper} onClick={() => handleChartClick('error-budget')}>
            <div className={styles.chartHeader}>
              <h4>Error Budget</h4>
              <span className={styles.zoomHint}>Click to enlarge</span>
            </div>
            <SLIChart
              name={systemFile.name}
              history={systemFile.history}
              period={selectedPeriod}
              height={280}
              showPeriodSelector={false}
              showErrorBudget={true}
              sloTarget={systemFile.sloTarget || 99.9}
            />
          </div>
        </div>

        <div className={styles.viewDetails}>
          <a
            href={`/status/history/${systemFile.name
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-')}`}
            className={styles.viewDetailsLink}
          >
            View detailed history →
          </a>
        </div>
      </section>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div className={styles.fullscreenOverlay} onClick={handleCloseFullscreen}>
          <div className={styles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.fullscreenClose}
              onClick={handleCloseFullscreen}
              aria-label="Close fullscreen"
            >
              ✕
            </button>
            <div className={styles.fullscreenChart}>
              {fullscreenChart === 'response' && (
                <>
                  <h2>Response Time - {systemFile.name}</h2>
                  <ResponseTimeChart
                    name={systemFile.name}
                    history={systemFile.history}
                    period={selectedPeriod}
                    height={600}
                    showPeriodSelector={false}
                  />
                </>
              )}
              {fullscreenChart === 'uptime' && (
                <>
                  <h2>Uptime - {systemFile.name}</h2>
                  <UptimeChart
                    name={systemFile.name}
                    history={systemFile.history}
                    incidents={incidents}
                    chartType={uptimeChartType}
                    period={selectedPeriod}
                    height={600}
                  />
                </>
              )}
              {fullscreenChart === 'sli' && (
                <>
                  <h2>SLI/SLO Compliance - {systemFile.name}</h2>
                  <SLIChart
                    name={systemFile.name}
                    history={systemFile.history}
                    period={selectedPeriod}
                    height={600}
                    showPeriodSelector={false}
                    sloTarget={systemFile.sloTarget || 99.9}
                  />
                </>
              )}
              {fullscreenChart === 'error-budget' && (
                <>
                  <h2>Error Budget - {systemFile.name}</h2>
                  <SLIChart
                    name={systemFile.name}
                    history={systemFile.history}
                    period={selectedPeriod}
                    height={600}
                    showPeriodSelector={false}
                    showErrorBudget={true}
                    sloTarget={systemFile.sloTarget || 99.9}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
