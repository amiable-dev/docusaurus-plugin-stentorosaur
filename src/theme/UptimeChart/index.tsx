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
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { StatusCheckHistory } from '../../types';
import styles from './styles.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export interface UptimeChartProps {
  /** System name */
  name: string;
  /** Historical check data */
  history: StatusCheckHistory[];
  /** Chart type */
  chartType?: 'bar' | 'heatmap';
  /** Time period to display */
  period?: '24h' | '7d' | '30d' | '90d';
  /** Chart height in pixels */
  height?: number;
}

type TimePeriod = '24h' | '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '24h': '24 Hours',
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
};

const PERIOD_DAYS: Record<TimePeriod, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface DayUptime {
  date: string;
  uptime: number;
  checks: number;
  upChecks: number;
}

export default function UptimeChart({
  name,
  history,
  chartType = 'bar',
  period = '30d',
  height = 300,
}: UptimeChartProps): JSX.Element {
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

  // Calculate daily uptime percentages
  const calculateDailyUptime = (): DayUptime[] => {
    const now = new Date();
    const days = PERIOD_DAYS[period];
    const dailyData: Map<string, { upChecks: number; totalChecks: number }> = new Map();

    // Initialize all days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData.set(dateStr, { upChecks: 0, totalChecks: 0 });
    }

    // Count checks per day
    history.forEach(check => {
      const checkDate = new Date(check.timestamp).toISOString().split('T')[0];
      const dayData = dailyData.get(checkDate);
      
      if (dayData) {
        dayData.totalChecks++;
        if (check.status === 'up' || check.status === 'maintenance') {
          dayData.upChecks++;
        }
      }
    });

    // Calculate uptime percentages
    return Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      uptime: data.totalChecks > 0 ? (data.upChecks / data.totalChecks) * 100 : 100,
      checks: data.totalChecks,
      upChecks: data.upChecks,
    }));
  };

  const dailyUptime = calculateDailyUptime();

  // Calculate overall uptime
  const overallUptime = dailyUptime.length > 0
    ? dailyUptime.reduce((sum, day) => sum + day.uptime, 0) / dailyUptime.length
    : 100;

  // Get color based on uptime percentage
  const getUptimeColor = (uptime: number): string => {
    if (uptime >= 99) return isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(34, 197, 94)'; // Green
    if (uptime >= 95) return 'rgb(255, 205, 86)'; // Yellow
    return 'rgb(255, 99, 132)'; // Red
  };

  if (chartType === 'heatmap') {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.heatmapHeader}>
          <h3 className={styles.chartTitle}>{name} - Uptime Heatmap</h3>
        </div>

        <div className={styles.heatmapGrid}>
          {dailyUptime.map((day) => {
            const uptimePercent = day.uptime;
            const color = getUptimeColor(uptimePercent);
            
            return (
              <div
                key={day.date}
                className={styles.heatmapCell}
                style={{ backgroundColor: color }}
                title={`${day.date}: ${uptimePercent.toFixed(2)}% uptime (${day.upChecks}/${day.checks} checks)`}
              >
                <span className={styles.heatmapDate}>
                  {new Date(day.date).getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.heatmapLegend}>
          <span className={styles.legendLabel}>Uptime:</span>
          <div className={styles.legendItem}>
            <div className={styles.legendColor} style={{ backgroundColor: 'rgb(255, 99, 132)' }} />
            <span>&lt; 95%</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendColor} style={{ backgroundColor: 'rgb(255, 205, 86)' }} />
            <span>95-99%</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendColor} style={{ backgroundColor: isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(34, 197, 94)' }} />
            <span>≥ 99%</span>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Overall Uptime:</span>
            <span className={styles.statValue}>{overallUptime.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Bar chart
  const chartData = {
    labels: dailyUptime.map(day => {
      const date = new Date(day.date);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Uptime %',
        data: dailyUptime.map(day => day.uptime),
        backgroundColor: dailyUptime.map(day => getUptimeColor(day.uptime)),
        borderColor: dailyUptime.map(day => getUptimeColor(day.uptime)),
        borderWidth: 1,
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
        display: false,
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
            const day = dailyUptime[dataIndex];
            return [
              `Uptime: ${day.uptime.toFixed(2)}%`,
              `Successful: ${day.upChecks}/${day.checks} checks`,
            ];
          },
        },
      },
      title: {
        display: true,
        text: `${name} - Daily Uptime`,
        color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Uptime %',
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
        },
        ticks: {
          color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
          callback: (value: any) => `${value}%`,
        },
        grid: {
          color: isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Date',
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

  if (dailyUptime.length === 0) {
    return (
      <div className={styles.noData}>
        <p>No uptime data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Average Uptime:</span>
          <span className={styles.statValue}>{overallUptime.toFixed(2)}%</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Checks:</span>
          <span className={styles.statValue}>
            {dailyUptime.reduce((sum, day) => sum + day.checks, 0)}
          </span>
        </div>
      </div>

      <div className={styles.chart} style={{ height: `${height}px` }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
