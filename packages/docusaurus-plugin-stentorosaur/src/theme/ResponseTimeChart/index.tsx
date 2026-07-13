/**
 * Copyright (c) Amiable Development
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Response time chart — inline SVG (ADR-005 §11, ticket #73; chart.js
 * removed). Theming comes from CSS variables; CSV/JSON export retained;
 * chart-image export dropped with the canvas.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { StatusCheckHistory } from '../../types';
import { ExportButton } from '../components/ExportButton';
import { formatDateForFilename } from '../../utils/csv';
import { SvgLineChart } from '../svg/SvgCharts';
import type { LinePoint } from '../svg/SvgCharts';
import styles from './styles.module.css';

type TimePeriod = '24h' | '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
};

const PERIOD_HOURS: Record<TimePeriod, number> = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
  '90d': 2160,
};

export interface ResponseTimeChartProps {
  /** System name */
  name: string;
  /** Historical check data */
  history: StatusCheckHistory[];
  /** Time period to display */
  period?: '24h' | '7d' | '30d' | '90d';
  /** Chart height in pixels */
  height?: number;
  /** Show time period selector */
  showPeriodSelector?: boolean;
}

export default function ResponseTimeChart({
  name,
  history,
  period = '7d',
  height = 300,
  showPeriodSelector = true,
}: ResponseTimeChartProps): JSX.Element {
  // null until the user interacts, so a changed period PROP always flows
  // through (Council PR #88 r=1/r=2): a NEW prop value also clears any
  // user selection (parent intent resets the override).
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  React.useEffect(() => {
    setSelectedPeriod(null);
  }, [period]);
  const activePeriod = showPeriodSelector ? (selectedPeriod ?? period) : period;

  const filteredData = useMemo(() => {
    const cutoff = Date.now() - PERIOD_HOURS[activePeriod] * 60 * 60 * 1000;
    return history
      .filter(check => new Date(check.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [history, activePeriod]);

  const avgResponseTime = useMemo(
    () =>
      filteredData.length > 0
        ? Math.round(filteredData.reduce((sum, check) => sum + check.responseTime, 0) / filteredData.length)
        : 0,
    [filteredData]
  );

  const exportableData = useMemo(
    () =>
      filteredData.map(check => ({
        timestamp: check.timestamp,
        responseTime: check.responseTime,
        status: check.status,
        statusCode: check.code,
      })),
    [filteredData]
  );

  const generateExportFilename = useCallback(() => {
    const systemSlug = name.toLowerCase().replace(/\s+/g, '-');
    if (filteredData.length === 0) return `${systemSlug}-response-time`;
    const firstDate = new Date(filteredData[0].timestamp);
    const lastDate = new Date(filteredData[filteredData.length - 1].timestamp);
    return `${systemSlug}-response-time-${formatDateForFilename(firstDate)}-to-${formatDateForFilename(lastDate)}`;
  }, [filteredData, name]);

  const points = useMemo<LinePoint[]>(
    () =>
      filteredData.map(check => {
        const date = new Date(check.timestamp);
        // Fixed locale + UTC: SSR'd SVG must hydrate identically on any
        // client locale/timezone (Council PR #88 r=2).
        const label =
          activePeriod === '24h'
            ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const tone = check.status === 'up' ? 'ok' : check.status === 'down' ? 'bad' : 'warn';
        return {
          label,
          value: check.responseTime,
          tone,
          title: `${label}: ${check.responseTime} ms (${check.status})`,
        };
      }),
    [filteredData, activePeriod]
  );

  if (filteredData.length === 0) {
    return (
      <div className={styles.noData}>
        <p>No response time data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer}>
      {showPeriodSelector && (
        <div className={styles.periodSelector}>
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map(p => (
            <button
              key={p}
              className={`${styles.periodButton} ${activePeriod === p ? styles.active : ''}`}
              onClick={() => setSelectedPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      <div className={styles.chartHeader}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Average Response Time:</span>
            <span className={styles.statValue}>{avgResponseTime} ms</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Data Points:</span>
            <span className={styles.statValue}>{filteredData.length}</span>
          </div>
        </div>
        <div className={styles.exportButtons}>
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            columns={['timestamp', 'responseTime', 'status', 'statusCode']}
            format="csv"
            ariaLabel="Download response time data as CSV"
          />
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            format="json"
            ariaLabel="Download response time data as JSON"
          />
        </div>
      </div>

      <div className={styles.chart}>
        <SvgLineChart
          points={points}
          height={height}
          yMin={0}
          yFormat={v => `${Math.round(v)} ms`}
          ariaLabel={`Response time chart for ${name}, ${PERIOD_LABELS[activePeriod]}: average ${avgResponseTime} ms over ${filteredData.length} checks`}
        />
      </div>
    </div>
  );
}
