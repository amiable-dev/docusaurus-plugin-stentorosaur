/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import type { StatusCheckHistory } from '../../types';
import { aggregateHistoricalData } from '../../historical-data';
import styles from './styles.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

type TimePeriod = '24h' | '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '24h': '24 Hours',
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
};

const PERIOD_HOURS: Record<TimePeriod, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
};

export default function SLIChart({
  name,
  history,
  period = '7d',
  height = 300,
  showPeriodSelector = true,
  showErrorBudget = false,
  sloTarget = 99.9,
}: SLIChartProps): JSX.Element {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>(period);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  
  // Use internal state only if period selector is shown, otherwise use prop
  const activePeriod = showPeriodSelector ? internalPeriod : period;

  // Detect dark mode from document
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkTheme(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    
    return () => observer.disconnect();
  }, []);

  // Calculate SLI/SLO data
  const chartData = useMemo(() => {
    const periodHours = PERIOD_HOURS[activePeriod];
    const filteredHistory = aggregateHistoricalData(history, periodHours);

    if (filteredHistory.length === 0) {
      return null;
    }

    // Group by day
    const dailyData = new Map<string, { total: number; successful: number }>();
    
    filteredHistory.forEach((check) => {
      const date = new Date(check.timestamp).toLocaleDateString();
      const existing = dailyData.get(date) || { total: 0, successful: 0 };
      existing.total++;
      if (check.status === 'up' || check.status === 'maintenance') {
        existing.successful++;
      }
      dailyData.set(date, existing);
    });

    // Convert to arrays
    const labels: string[] = [];
    const sliValues: number[] = [];
    const errorBudgetValues: number[] = [];
    
    // Calculate error budget for the entire period
    // Error budget is the allowed failure percentage (e.g., 0.1% for 99.9% SLO)
    const allowedError = 100 - sloTarget; // e.g., 0.1% for 99.9% SLO
    
    // Calculate total allowed downtime for the period
    const totalChecks = filteredHistory.length;
    const allowedDowntimeChecks = (allowedError / 100) * totalChecks;
    
    // Track cumulative error consumption over time
    let cumulativeFailedChecks = 0;
    let checkIndex = 0;
    
    dailyData.forEach((data, date) => {
      labels.push(date);
      const sli = (data.successful / data.total) * 100;
      sliValues.push(sli);
      
      // Add failed checks from this day to cumulative total
      const failedChecksThisDay = data.total - data.successful;
      cumulativeFailedChecks += failedChecksThisDay;
      checkIndex += data.total;
      
      // Calculate remaining error budget as percentage
      // Remaining budget = (allowed downtime - actual downtime) / allowed downtime * 100
      const budgetRemaining = allowedDowntimeChecks > 0 
        ? Math.max(0, ((allowedDowntimeChecks - cumulativeFailedChecks) / allowedDowntimeChecks) * 100)
        : 100;
      errorBudgetValues.push(budgetRemaining);
    });

    return {
      labels,
      sliValues,
      errorBudgetValues,
      sloTarget,
    };
  }, [history, activePeriod, sloTarget]);

  if (!chartData) {
    return (
      <div className={styles.noData}>
        <p>No historical data available for {PERIOD_LABELS[activePeriod]}</p>
      </div>
    );
  }

  const textColor = isDarkTheme ? '#e3e3e3' : '#1c1e21';
  const gridColor = isDarkTheme ? '#2e2e2e' : '#e0e0e0';
  const targetColor = isDarkTheme ? '#ff6b6b' : '#ff4444';
  const goodColor = isDarkTheme ? '#51cf66' : '#2eb875';
  const warningColor = isDarkTheme ? '#ffd93d' : '#ffaa00';

  const data = {
    labels: chartData.labels,
    datasets: showErrorBudget
      ? [
          {
            label: 'Error Budget Remaining (%)',
            data: chartData.errorBudgetValues,
            backgroundColor: chartData.errorBudgetValues.map((val) =>
              val > 50 ? `${goodColor}80` : val > 20 ? `${warningColor}80` : `${targetColor}80`
            ),
            borderColor: chartData.errorBudgetValues.map((val) =>
              val > 50 ? goodColor : val > 20 ? warningColor : targetColor
            ),
            borderWidth: 2,
          },
        ]
      : [
          {
            label: 'SLI (%)',
            data: chartData.sliValues,
            borderColor: goodColor,
            backgroundColor: `${goodColor}20`,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: chartData.sliValues.map((val) =>
              val >= chartData.sloTarget ? goodColor : targetColor
            ),
            pointBorderColor: chartData.sliValues.map((val) =>
              val >= chartData.sloTarget ? goodColor : targetColor
            ),
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: `SLO Target (${chartData.sloTarget}%)`,
            data: Array(chartData.labels.length).fill(chartData.sloTarget),
            borderColor: targetColor,
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: textColor,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y.toFixed(2);
            return `${label}: ${value}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: textColor,
          callback: (value: any) => `${value}%`,
        },
        grid: {
          color: gridColor,
        },
      },
      x: {
        ticks: {
          color: textColor,
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  return (
    <div className={styles.chartContainer}>
      <div className={styles.sliChart}>
        {showPeriodSelector && (
          <div className={styles.periodSelector}>
            {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => (
              <button
                key={p}
                className={`${styles.periodButton} ${internalPeriod === p ? styles.active : ''}`}
                onClick={() => setInternalPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      <div className={styles.chart} style={{ height: `${height}px` }}>
        {showErrorBudget ? (
          <Bar data={data} options={options} />
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
      {showErrorBudget && (
        <div className={styles.budgetInfo}>
          <p className={styles.budgetNote}>
            Error budget shows cumulative remaining tolerance for downtime over the selected period relative to SLO target ({sloTarget}%).
            Green (&gt;50%) = healthy, Yellow (20-50%) = caution, Red (&lt;20%) = critical.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}