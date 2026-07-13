/**
 * Copyright (c) Amiable Development
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SLI/SLO compliance chart — inline SVG (ADR-005 §11, ticket #73;
 * chart.js removed). Daily SLI values against the SLO target line, or
 * remaining error budget in budget mode. Math ported unchanged.
 */

import React, { useState, useMemo } from 'react';
import type { StatusCheckHistory } from '../../types';
import { aggregateHistoricalData } from '../../historical-data';
import { ExportButton } from '../components/ExportButton';
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

export interface SLIChartProps {
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
  /** Show error budget instead of SLI compliance */
  showErrorBudget?: boolean;
  /** SLO target (default 99.9%) */
  sloTarget?: number;
}

export default function SLIChart({
  name,
  history,
  period = '30d',
  height = 300,
  showPeriodSelector = true,
  showErrorBudget = false,
  sloTarget = 99.9,
}: SLIChartProps): JSX.Element {
  // null until the user interacts, so a changed period PROP always flows
  // through (Council PR #88 r=1: useState(period) froze the first value).
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  const activePeriod = showPeriodSelector ? (selectedPeriod ?? period) : period;

  const chartData = useMemo(() => {
    // Explicit temporal sort: the cumulative error-budget walk depends on
    // day insertion order (Council PR #88 r=1 — never rely on an upstream
    // function's unstated ordering).
    const filteredHistory = [...aggregateHistoricalData(history, PERIOD_HOURS[activePeriod])]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (filteredHistory.length === 0) {
      return null;
    }

    const dailyData = new Map<string, { total: number; successful: number }>();
    filteredHistory.forEach(check => {
      const date = new Date(check.timestamp).toLocaleDateString();
      const existing = dailyData.get(date) || { total: 0, successful: 0 };
      existing.total++;
      if (check.status === 'up' || check.status === 'maintenance') {
        existing.successful++;
      }
      dailyData.set(date, existing);
    });

    const labels: string[] = [];
    const sliValues: number[] = [];
    const errorBudgetValues: number[] = [];

    const allowedError = 100 - sloTarget;
    const totalChecks = filteredHistory.length;
    const allowedDowntimeChecks = (allowedError / 100) * totalChecks;
    let cumulativeFailedChecks = 0;

    dailyData.forEach((data, date) => {
      labels.push(date);
      sliValues.push((data.successful / data.total) * 100);
      cumulativeFailedChecks += data.total - data.successful;
      const budgetRemaining =
        allowedDowntimeChecks > 0
          ? Math.max(0, ((allowedDowntimeChecks - cumulativeFailedChecks) / allowedDowntimeChecks) * 100)
          : 100;
      errorBudgetValues.push(budgetRemaining);
    });

    const exportData = labels.map((date, index) => ({
      date,
      sliPercent: parseFloat(sliValues[index].toFixed(2)),
      errorBudgetRemaining: parseFloat(errorBudgetValues[index].toFixed(2)),
      sloTarget: parseFloat(sloTarget.toFixed(2)),
    }));

    return { labels, sliValues, errorBudgetValues, sloTarget, exportData };
  }, [history, activePeriod, sloTarget]);

  if (!chartData) {
    return (
      <div className={styles.noData}>
        <p>No historical data available for {PERIOD_LABELS[activePeriod]}</p>
      </div>
    );
  }

  const values = showErrorBudget ? chartData.errorBudgetValues : chartData.sliValues;
  const points: LinePoint[] = chartData.labels.map((label, i) => ({
    label,
    value: values[i],
    tone: showErrorBudget
      ? values[i] > 25 ? 'ok' : values[i] > 0 ? 'warn' : 'bad'
      : values[i] >= sloTarget ? 'ok' : 'bad',
    title: `${label}: ${values[i].toFixed(2)}%${showErrorBudget ? ' budget remaining' : ' SLI'}`,
  }));

  const latest = values[values.length - 1] ?? 0;
  const filenameBase = `${name.toLowerCase().replace(/\s+/g, '-')}-${showErrorBudget ? 'error-budget' : 'sli'}`;

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
            <span className={styles.statLabel}>
              {showErrorBudget ? 'Error Budget Remaining:' : 'Current SLI:'}
            </span>
            <span className={styles.statValue}>{latest.toFixed(2)}%</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>SLO Target:</span>
            <span className={styles.statValue}>{sloTarget}%</span>
          </div>
        </div>
        <div className={styles.exportButtons}>
          <ExportButton
            filename={filenameBase}
            data={chartData.exportData}
            columns={['date', 'sliPercent', 'errorBudgetRemaining', 'sloTarget']}
            format="csv"
            ariaLabel="Download SLI data as CSV"
          />
          <ExportButton
            filename={filenameBase}
            data={chartData.exportData}
            format="json"
            ariaLabel="Download SLI data as JSON"
          />
        </div>
      </div>

      <div className={styles.chart}>
        <SvgLineChart
          points={points}
          height={height}
          yMax={100}
          yFormat={v => `${v.toFixed(1)}%`}
          thresholds={showErrorBudget ? [] : [{value: sloTarget, label: `SLO ${sloTarget}%`}]}
          ariaLabel={`${showErrorBudget ? 'Error budget' : 'SLI compliance'} chart for ${name}, ${PERIOD_LABELS[activePeriod]}: latest ${latest.toFixed(2)}% against a ${sloTarget}% target`}
        />
      </div>
    </div>
  );
}
