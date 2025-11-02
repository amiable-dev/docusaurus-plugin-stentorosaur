/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { StatusCheckHistory } from '../../types';
import styles from './styles.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

export default function ResponseTimeChart({
  name,
  history,
  period = '7d',
  height = 300,
  showPeriodSelector = true,
}: ResponseTimeChartProps): JSX.Element {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(period);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  // Detect dark mode from document
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkTheme(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    
    checkDarkMode();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    
    return () => observer.disconnect();
  }, []);

  // Filter data by selected period
  const getFilteredData = () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - PERIOD_HOURS[selectedPeriod] * 60 * 60 * 1000);
    
    return history
      .filter(check => new Date(check.timestamp) >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  const filteredData = getFilteredData();

  // Calculate average response time
  const avgResponseTime = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, check) => sum + check.responseTime, 0) / filteredData.length)
    : 0;

  // Prepare chart data
  const chartData = {
    labels: filteredData.map(check => {
      const date = new Date(check.timestamp);
      if (selectedPeriod === '24h') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    }),
    datasets: [
      {
        label: 'Response Time (ms)',
        data: filteredData.map(check => check.responseTime),
        borderColor: isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(53, 162, 235)',
        backgroundColor: isDarkTheme ? 'rgba(75, 192, 192, 0.1)' : 'rgba(53, 162, 235, 0.1)',
        pointBackgroundColor: filteredData.map(check => {
          // Color code points based on status
          if (check.status === 'down') return 'rgb(255, 99, 132)';
          if (check.status === 'degraded') return 'rgb(255, 205, 86)';
          return isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(53, 162, 235)';
        }),
        pointBorderColor: filteredData.map(check => {
          if (check.status === 'down') return 'rgb(255, 99, 132)';
          if (check.status === 'degraded') return 'rgb(255, 205, 86)';
          return isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(53, 162, 235)';
        }),
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Average',
        data: filteredData.map(() => avgResponseTime),
        borderColor: isDarkTheme ? 'rgba(153, 102, 255, 0.5)' : 'rgba(153, 102, 255, 0.5)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: isDarkTheme ? 'rgba(28, 30, 33, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        bodyColor: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        borderColor: isDarkTheme ? '#444' : '#ccc',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => {
            const dataIndex = context.dataIndex;
            const check = filteredData[dataIndex];
            const lines = [`Response Time: ${context.parsed.y} ms`];
            
            if (context.datasetIndex === 0 && check) {
              lines.push(`Status: ${check.status}`);
              lines.push(`Code: ${check.code}`);
            }
            
            return lines;
          },
        },
      },
      title: {
        display: true,
        text: `${name} - Response Time Trends`,
        color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Response Time (ms)',
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        },
        ticks: {
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        },
        grid: {
          color: isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Time',
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        },
        ticks: {
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
  };

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
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => (
            <button
              key={p}
              className={`${styles.periodButton} ${selectedPeriod === p ? styles.active : ''}`}
              onClick={() => setSelectedPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      )}
      
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

      <div className={styles.chart} style={{ height: `${height}px` }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
