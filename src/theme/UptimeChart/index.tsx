/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import type { StatusCheckHistory, StatusIncident } from '../../types';
import { useChartExport } from '../hooks/useChartExport';
import { ExportButton } from '../components/ExportButton';
import { formatDateForFilename } from '../../utils/csv';
import styles from './styles.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

export interface UptimeChartProps {
  /** System name */
  name: string;
  /** Historical check data */
  history: StatusCheckHistory[];
  /** Incidents affecting this system */
  incidents?: StatusIncident[];
  /** Chart type */
  chartType?: 'bar' | 'heatmap';
  /** Time period to display */
  period?: '24h' | '7d' | '30d' | '90d';
  /** Chart height in pixels */
  height?: number;
  /** Show period selector */
  showPeriodSelector?: boolean;
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
  incidents = [],
  chartType = 'bar',
  period = '30d',
  height = 300,
  showPeriodSelector = false,
}: UptimeChartProps): JSX.Element {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>(period);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const chartRef = useRef<ChartJS<'bar'>>(null);
  const { exportPNG, exportJPEG } = useChartExport();
  
  // Use internal state only if period selector is shown, otherwise use prop
  const activePeriod = showPeriodSelector ? internalPeriod : period;

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
  const calculateDailyUptime = useCallback((): DayUptime[] => {
    const now = new Date();
    const days = PERIOD_DAYS[activePeriod];
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
  }, [history, activePeriod]);

  const dailyUptime = useMemo(() => calculateDailyUptime(), [calculateDailyUptime]);

  // Calculate overall uptime
  const overallUptime = useMemo(() => {
    return dailyUptime.length > 0
      ? dailyUptime.reduce((sum, day) => sum + day.uptime, 0) / dailyUptime.length
      : 100;
  }, [dailyUptime]);

  // Get color based on uptime percentage
  const getUptimeColor = useCallback((uptime: number): string => {
    if (uptime >= 99) return isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(34, 197, 94)'; // Green
    if (uptime >= 95) return 'rgb(255, 205, 86)'; // Yellow
    return 'rgb(255, 99, 132)'; // Red
  }, [isDarkTheme]);

  // Filter incidents relevant to this system and period
  const relevantIncidents = useMemo(() => {
    const now = new Date();
    const days = PERIOD_DAYS[activePeriod];
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    return incidents
      .filter(incident => incident.affectedSystems && incident.affectedSystems.includes(name))
      .filter(incident => {
        const incidentDate = new Date(incident.createdAt);
        return incidentDate >= periodStart && incidentDate <= now;
      });
  }, [incidents, name, activePeriod]);

  // Prepare data for CSV/JSON export
  const exportableData = useMemo(() => {
    return dailyUptime.map(day => {
      // Find incidents for this day
      const dayIncidents = relevantIncidents.filter(incident => {
        const incidentDate = new Date(incident.createdAt).toISOString().split('T')[0];
        return incidentDate === day.date;
      });

      return {
        date: day.date,
        uptimePercent: parseFloat(day.uptime.toFixed(2)),
        totalChecks: day.checks,
        successfulChecks: day.upChecks,
        failedChecks: day.checks - day.upChecks,
        incidentCount: dayIncidents.length,
        incidents: dayIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('; '),
      };
    });
  }, [dailyUptime, relevantIncidents]);

  // Generate filename with date range
  const generateExportFilename = useCallback(() => {
    if (dailyUptime.length === 0) return `${name}-uptime`;
    
    const firstDate = new Date(dailyUptime[0].date);
    const lastDate = new Date(dailyUptime[dailyUptime.length - 1].date);
    const systemSlug = name.toLowerCase().replace(/\s+/g, '-');
    
    return `${systemSlug}-uptime-${formatDateForFilename(firstDate)}-to-${formatDateForFilename(lastDate)}`;
  }, [dailyUptime, name]);

  // Bar chart data (computed even if showing heatmap to maintain hook order)
  const chartData = useMemo(() => ({
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
  }), [dailyUptime, getUptimeColor]);

  // Create incident annotations (computed even if showing heatmap to maintain hook order)
  const annotations = useMemo(() => {
    const annotationMap: Record<string, any> = {};
    
    relevantIncidents.forEach((incident, index) => {
      const incidentDate = new Date(incident.createdAt);
      const dateStr = incidentDate.toISOString().split('T')[0];
      const dataIndex = dailyUptime.findIndex(day => day.date === dateStr);
      
      if (dataIndex !== -1) {
        const severityColors = {
          critical: 'rgba(220, 38, 38, 0.8)',
          major: 'rgba(249, 115, 22, 0.8)',
          minor: 'rgba(234, 179, 8, 0.8)',
          maintenance: 'rgba(107, 114, 128, 0.8)',
        };

        annotationMap[`incident${index}`] = {
          type: 'line',
          xMin: dataIndex,
          xMax: dataIndex,
          borderColor: severityColors[incident.severity],
          borderWidth: 2,
          borderDash: [5, 5],
          label: {
            display: true,
            content: incident.severity === 'critical' ? '⚠️' : '📌',
            position: 'start',
            backgroundColor: severityColors[incident.severity],
            color: 'white',
            font: {
              size: 10,
            },
          },
          click: (ctx: any, event: any) => {
            if (incident.url) {
              window.open(incident.url, '_blank');
            }
          },
        };
      }
    });

    return annotationMap;
  }, [relevantIncidents, dailyUptime]);

  if (chartType === 'heatmap') {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.heatmapHeader}>
          <h3 className={styles.chartTitle}>{name} - Uptime Heatmap</h3>
          <div className={styles.exportButtons}>
            <ExportButton
              filename={generateExportFilename()}
              data={exportableData}
              columns={['date', 'uptimePercent', 'totalChecks', 'successfulChecks', 'failedChecks', 'incidentCount', 'incidents']}
              format="csv"
              ariaLabel="Download uptime data as CSV"
            />
            <ExportButton
              filename={generateExportFilename()}
              data={exportableData}
              format="json"
              ariaLabel="Download uptime data as JSON"
            />
          </div>
        </div>

        <div className={styles.heatmapGrid}>
          {dailyUptime.map((day) => {
            const uptimePercent = day.uptime;
            const color = getUptimeColor(uptimePercent);
            
            // Check if this day has any incidents
            const dayIncidents = relevantIncidents.filter(incident => {
              const incidentDate = new Date(incident.createdAt).toISOString().split('T')[0];
              return incidentDate === day.date;
            });
            
            const hasIncident = dayIncidents.length > 0;
            const incidentIcon = hasIncident && dayIncidents[0].severity === 'critical' ? '⚠️' : (hasIncident ? '📌' : '');
            
            return (
              <div
                key={day.date}
                className={styles.heatmapCell}
                style={{ backgroundColor: color }}
                title={`${day.date}: ${uptimePercent.toFixed(2)}% uptime (${day.upChecks}/${day.checks} checks)${hasIncident ? '\n' + dayIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('\n') : ''}`}
              >
                <span className={styles.heatmapDate}>
                  {new Date(day.date).getDate()}
                </span>
                {hasIncident && <span className={styles.incidentMarker}>{incidentIcon}</span>}
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

  // Bar chart rendering
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
            const dayIncidents = relevantIncidents.filter(incident => {
              const incidentDate = new Date(incident.createdAt).toISOString().split('T')[0];
              return incidentDate === day.date;
            });
            
            const lines = [
              `Uptime: ${day.uptime.toFixed(2)}%`,
              `Successful: ${day.upChecks}/${day.checks} checks`,
            ];
            
            if (dayIncidents.length > 0) {
              lines.push('');
              lines.push('📌 Incidents:');
              dayIncidents.forEach(incident => {
                lines.push(`  ${incident.severity.toUpperCase()}: ${incident.title}`);
              });
            }
            
            return lines;
          },
        },
      },
      title: {
        display: true,
        text: `${name} - Daily Uptime`,
        color: isDarkTheme ? '#e3e3e3' : '#1c1e21',
      },
      annotation: {
        annotations,
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
      <div className={styles.chartHeader}>
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
        <div className={styles.exportButtons}>
          <button
            className={styles.exportButton}
            onClick={() => exportPNG(chartRef.current, `${name.toLowerCase().replace(/\s+/g, '-')}-uptime`)}
            title="Export as PNG"
          >
            PNG
          </button>
          <button
            className={styles.exportButton}
            onClick={() => exportJPEG(chartRef.current, `${name.toLowerCase().replace(/\s+/g, '-')}-uptime`)}
            title="Export as JPEG"
          >
            JPG
          </button>
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            columns={['date', 'uptimePercent', 'totalChecks', 'successfulChecks', 'failedChecks', 'incidentCount', 'incidents']}
            format="csv"
            ariaLabel="Download uptime data as CSV"
          />
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            format="json"
            ariaLabel="Download uptime data as JSON"
          />
        </div>
      </div>

      <div className={styles.chart} style={{ height: `${height}px` }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
