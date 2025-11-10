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

interface TimeBlockUptime {
  timestamp: string; // ISO timestamp or date string
  label: string; // Display label (e.g., "3 AM", "Mon 12 PM", "Jan 15")
  uptime: number | null; // null indicates no data for this time block
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

  // Calculate uptime by time blocks (hourly for 24h, 4-hour for 7d, daily for 30d/90d)
  const calculateTimeBlockUptime = useCallback((): TimeBlockUptime[] => {
    const now = new Date();
    const blockData: Map<string, { upChecks: number; totalChecks: number }> = new Map();

    // Determine granularity based on period
    let blockSizeMs: number;
    let blockCount: number;
    let formatLabel: (timestamp: Date) => string;

    if (activePeriod === '24h') {
      // Hourly blocks for 24 hours
      blockSizeMs = 60 * 60 * 1000; // 1 hour
      blockCount = 24;
      formatLabel = (date: Date) => {
        const hour = date.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour} ${ampm}`;
      };
    } else if (activePeriod === '7d') {
      // 4-hour blocks for 7 days (42 blocks)
      blockSizeMs = 4 * 60 * 60 * 1000; // 4 hours
      blockCount = 42; // 7 days * 6 blocks per day
      formatLabel = (date: Date) => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const hour = date.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${dayNames[date.getDay()]} ${displayHour}${ampm}`;
      };
    } else {
      // Daily blocks for 30d/90d (existing behavior)
      blockSizeMs = 24 * 60 * 60 * 1000; // 1 day
      blockCount = PERIOD_DAYS[activePeriod];
      formatLabel = (date: Date) => {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      };
    }

    // Initialize all time blocks
    const blocks: TimeBlockUptime[] = [];
    for (let i = blockCount - 1; i >= 0; i--) {
      const blockStart = new Date(now.getTime() - i * blockSizeMs);
      // Round down to block boundary
      if (activePeriod === '24h') {
        blockStart.setMinutes(0, 0, 0);
      } else if (activePeriod === '7d') {
        const hour = Math.floor(blockStart.getHours() / 4) * 4;
        blockStart.setHours(hour, 0, 0, 0);
      } else {
        blockStart.setHours(0, 0, 0, 0);
      }

      const timestamp = blockStart.toISOString();
      blockData.set(timestamp, { upChecks: 0, totalChecks: 0 });
      blocks.push({
        timestamp,
        label: formatLabel(blockStart),
        uptime: null,
        checks: 0,
        upChecks: 0,
      });
    }

    // Count checks per time block
    history.forEach(check => {
      const checkTime = new Date(check.timestamp);

      // Find which block this check belongs to
      for (const block of blocks) {
        const blockStart = new Date(block.timestamp);
        const blockEnd = new Date(blockStart.getTime() + blockSizeMs);

        if (checkTime >= blockStart && checkTime < blockEnd) {
          const data = blockData.get(block.timestamp);
          if (data) {
            data.totalChecks++;
            if (check.status === 'up' || check.status === 'maintenance') {
              data.upChecks++;
            }
          }
          break;
        }
      }
    });

    // Calculate uptime percentages
    return blocks.map(block => {
      const data = blockData.get(block.timestamp);
      if (data) {
        return {
          ...block,
          uptime: data.totalChecks > 0 ? (data.upChecks / data.totalChecks) * 100 : null,
          checks: data.totalChecks,
          upChecks: data.upChecks,
        };
      }
      return block;
    });
  }, [history, activePeriod]);

  const timeBlocks = useMemo(() => calculateTimeBlockUptime(), [calculateTimeBlockUptime]);

  // Calculate overall uptime (exclude blocks with no data)
  const overallUptime = useMemo(() => {
    const blocksWithData = timeBlocks.filter(block => block.uptime !== null);
    return blocksWithData.length > 0
      ? blocksWithData.reduce((sum, block) => sum + (block.uptime || 0), 0) / blocksWithData.length
      : null; // null if no data at all
  }, [timeBlocks]);

  // Get color based on uptime percentage
  const getUptimeColor = useCallback((uptime: number | null): string => {
    if (uptime === null) return isDarkTheme ? 'rgb(100, 100, 100)' : 'rgb(200, 200, 200)'; // Gray for no data
    if (uptime >= 99) return isDarkTheme ? 'rgb(75, 192, 192)' : 'rgb(34, 197, 94)'; // Green
    if (uptime >= 95) return 'rgb(255, 205, 86)'; // Yellow
    return 'rgb(255, 99, 132)'; // Red
  }, [isDarkTheme]);

  // Filter incidents relevant to this system and period
  const relevantIncidents = useMemo(() => {
    if (timeBlocks.length === 0) return [];

    const periodStart = new Date(timeBlocks[0].timestamp);
    const lastBlockStart = new Date(timeBlocks[timeBlocks.length - 1].timestamp);

    // Calculate period end by adding one block duration to the last block start
    const blockDuration = activePeriod === '24h' ? 60 * 60 * 1000 :
                          activePeriod === '7d' ? 4 * 60 * 60 * 1000 :
                          24 * 60 * 60 * 1000;
    const periodEnd = new Date(lastBlockStart.getTime() + blockDuration);

    return incidents
      .filter(incident => incident.affectedSystems && incident.affectedSystems.includes(name))
      .filter(incident => {
        const incidentDate = new Date(incident.createdAt);
        return incidentDate >= periodStart && incidentDate <= periodEnd;
      });
  }, [incidents, name, timeBlocks, activePeriod]);

  // Prepare data for CSV/JSON export
  const exportableData = useMemo(() => {
    return timeBlocks.map(block => {
      // Find incidents for this time block
      const blockStart = new Date(block.timestamp);
      const blockEnd = new Date(blockStart.getTime() +
        (activePeriod === '24h' ? 60 * 60 * 1000 :
         activePeriod === '7d' ? 4 * 60 * 60 * 1000 :
         24 * 60 * 60 * 1000));

      const blockIncidents = relevantIncidents.filter(incident => {
        const incidentDate = new Date(incident.createdAt);
        return incidentDate >= blockStart && incidentDate < blockEnd;
      });

      return {
        timestamp: block.timestamp,
        label: block.label,
        uptimePercent: block.uptime !== null ? parseFloat(block.uptime.toFixed(2)) : 'No data',
        totalChecks: block.checks,
        successfulChecks: block.upChecks,
        failedChecks: block.checks - block.upChecks,
        incidentCount: blockIncidents.length,
        incidents: blockIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('; '),
      };
    });
  }, [timeBlocks, relevantIncidents, activePeriod]);

  // Generate filename with date range
  const generateExportFilename = useCallback(() => {
    if (timeBlocks.length === 0) return `${name}-uptime`;

    const firstDate = new Date(timeBlocks[0].timestamp);
    const lastDate = new Date(timeBlocks[timeBlocks.length - 1].timestamp);
    const systemSlug = name.toLowerCase().replace(/\s+/g, '-');

    return `${systemSlug}-uptime-${formatDateForFilename(firstDate)}-to-${formatDateForFilename(lastDate)}`;
  }, [timeBlocks, name]);

  // Bar chart data (computed even if showing heatmap to maintain hook order)
  const chartData = useMemo(() => ({
    labels: timeBlocks.map(block => block.label),
    datasets: [
      {
        label: 'Uptime %',
        data: timeBlocks.map(block => block.uptime ?? 0), // Use 0 for chart rendering, will style as no-data
        backgroundColor: timeBlocks.map(block => getUptimeColor(block.uptime)),
        borderColor: timeBlocks.map(block => getUptimeColor(block.uptime)),
        borderWidth: 1,
        // Add pattern for no-data bars
        borderDash: timeBlocks.map(block => block.uptime === null ? [5, 5] : []),
      },
    ],
  }), [timeBlocks, getUptimeColor]);

  // Create incident annotations (computed even if showing heatmap to maintain hook order)
  const annotations = useMemo(() => {
    const annotationMap: Record<string, any> = {};

    relevantIncidents.forEach((incident, index) => {
      const incidentDate = new Date(incident.createdAt);

      // Find which time block this incident belongs to
      const dataIndex = timeBlocks.findIndex(block => {
        const blockStart = new Date(block.timestamp);
        const blockEnd = new Date(blockStart.getTime() +
          (activePeriod === '24h' ? 60 * 60 * 1000 :
           activePeriod === '7d' ? 4 * 60 * 60 * 1000 :
           24 * 60 * 60 * 1000));
        return incidentDate >= blockStart && incidentDate < blockEnd;
      });

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
  }, [relevantIncidents, timeBlocks, activePeriod]);

  if (chartType === 'heatmap') {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.heatmapHeader}>
          <h3 className={styles.chartTitle}>{name} - Uptime Heatmap</h3>
          <div className={styles.exportButtons}>
            <ExportButton
              filename={generateExportFilename()}
              data={exportableData}
              columns={['timestamp', 'label', 'uptimePercent', 'totalChecks', 'successfulChecks', 'failedChecks', 'incidentCount', 'incidents']}
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
          {timeBlocks.map((block) => {
            const uptimePercent = block.uptime;
            const color = getUptimeColor(uptimePercent);
            const isNoData = uptimePercent === null;
            const blockStart = new Date(block.timestamp);

            // Check if this block has any incidents
            const blockEnd = new Date(blockStart.getTime() +
              (activePeriod === '24h' ? 60 * 60 * 1000 :
               activePeriod === '7d' ? 4 * 60 * 60 * 1000 :
               24 * 60 * 60 * 1000));

            const blockIncidents = relevantIncidents.filter(incident => {
              const incidentDate = new Date(incident.createdAt);
              return incidentDate >= blockStart && incidentDate < blockEnd;
            });

            const hasIncident = blockIncidents.length > 0;
            const incidentIcon = hasIncident && blockIncidents[0].severity === 'critical' ? '⚠️' : (hasIncident ? '📌' : '');

            const tooltipText = isNoData
              ? `${block.label}: No monitoring data`
              : `${block.label}: ${uptimePercent.toFixed(2)}% uptime (${block.upChecks}/${block.checks} checks)${hasIncident ? '\n' + blockIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('\n') : ''}`;

            return (
              <div
                key={block.timestamp}
                className={styles.heatmapCell}
                style={{ backgroundColor: color }}
                title={tooltipText}
              >
                <span className={styles.heatmapDate}>
                  {block.label}
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
          <div className={styles.legendItem}>
            <div className={styles.legendColor} style={{ backgroundColor: isDarkTheme ? 'rgb(100, 100, 100)' : 'rgb(200, 200, 200)' }} />
            <span>No data</span>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Overall Uptime:</span>
            <span className={styles.statValue}>
              {overallUptime !== null ? `${overallUptime.toFixed(2)}%` : 'No data'}
            </span>
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
            const block = timeBlocks[dataIndex];

            // Handle no data case
            if (block.uptime === null) {
              return ['No monitoring data available'];
            }

            const blockStart = new Date(block.timestamp);
            const blockEnd = new Date(blockStart.getTime() +
              (activePeriod === '24h' ? 60 * 60 * 1000 :
               activePeriod === '7d' ? 4 * 60 * 60 * 1000 :
               24 * 60 * 60 * 1000));

            const blockIncidents = relevantIncidents.filter(incident => {
              const incidentDate = new Date(incident.createdAt);
              return incidentDate >= blockStart && incidentDate < blockEnd;
            });

            const lines = [
              `Uptime: ${block.uptime.toFixed(2)}%`,
              `Successful: ${block.upChecks}/${block.checks} checks`,
            ];

            if (blockIncidents.length > 0) {
              lines.push('');
              lines.push('📌 Incidents:');
              blockIncidents.forEach(incident => {
                lines.push(`  ${incident.severity.toUpperCase()}: ${incident.title}`);
              });
            }

            return lines;
          },
        },
      },
      title: {
        display: true,
        text: `${name} - ${activePeriod === '24h' ? 'Hourly' : activePeriod === '7d' ? '4-Hour Block' : 'Daily'} Uptime`,
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

  if (timeBlocks.length === 0) {
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
            <span className={styles.statValue}>
              {overallUptime !== null ? `${overallUptime.toFixed(2)}%` : 'No data'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Checks:</span>
            <span className={styles.statValue}>
              {timeBlocks.reduce((sum, block) => sum + block.checks, 0)}
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
            columns={['timestamp', 'label', 'uptimePercent', 'totalChecks', 'successfulChecks', 'failedChecks', 'incidentCount', 'incidents']}
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
