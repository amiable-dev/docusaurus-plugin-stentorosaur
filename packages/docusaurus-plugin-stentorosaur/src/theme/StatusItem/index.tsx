/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useMemo } from 'react';
import type {StatusItem as StatusItemType, StatusIncident, ScheduledMaintenance, StatusCheckHistory} from '../../types';
import { useDailySummary } from '../../hooks/useDailySummary';
import MiniHeatmap from './MiniHeatmap';
import styles from './styles.module.css';

export interface Props {
  item: StatusItemType;
  incidents?: StatusIncident[];
  maintenance?: ScheduledMaintenance[];
  showResponseTime?: boolean;
  showUptime?: boolean;
  showMiniChart?: boolean;
  onClick?: () => void;
  /** Base URL for fetching daily-summary.json (enables 90-day heatmap) */
  dataBaseUrl?: string;
  /** Number of days to show in heatmap (default: 14, or 90 if dataBaseUrl provided) */
  heatmapDays?: number;
}

const statusConfig = {
  up: {
    label: 'Operational',
    color: '#10b981',
    icon: '✓',
  },
  down: {
    label: 'Down',
    color: '#ef4444',
    icon: '✕',
  },
  degraded: {
    label: 'Degraded',
    color: '#f59e0b',
    icon: '!',
  },
  maintenance: {
    label: 'Maintenance',
    color: '#6366f1',
    icon: '⚙',
  },
};

export default function StatusItem({
  item,
  incidents = [],
  maintenance = [],
  showResponseTime = true,
  showUptime = true,
  showMiniChart = true,
  onClick,
  dataBaseUrl,
  heatmapDays,
}: Props): JSX.Element {
  const config = statusConfig[item.status];

  // Determine days to show: use prop if provided, otherwise 90 if dataBaseUrl, else 14
  const daysToShow = heatmapDays ?? (dataBaseUrl ? 90 : 14);

  // Fetch daily summary data if baseUrl provided (ADR-002)
  const { data: summaryData } = useDailySummary({
    baseUrl: dataBaseUrl || '',
    serviceName: item.name,
    days: daysToShow,
    enabled: !!dataBaseUrl && showMiniChart,
  });

  // Convert summary data to history format for MiniHeatmap
  const enhancedHistory = useMemo((): StatusCheckHistory[] => {
    // Start with existing history
    const existingHistory = item.history || [];

    // If no summary data, return existing
    if (!summaryData || summaryData.length === 0) {
      return existingHistory;
    }

    // Create synthetic history entries from summary data
    // Each day becomes a single "check" with status based on uptimePct
    const summaryAsHistory: StatusCheckHistory[] = summaryData.map(entry => {
      // Determine status from uptime percentage
      let status: 'up' | 'down' | 'degraded' | 'maintenance' = 'up';
      if (entry.uptimePct < 0.5) {
        status = 'down';
      } else if (entry.uptimePct < 0.99) {
        status = 'degraded';
      }

      return {
        timestamp: `${entry.date}T12:00:00Z`, // Noon UTC as representative time
        status,
        code: entry.checksPassed > 0 ? 200 : 500,
        responseTime: entry.avgLatencyMs || 0,
      };
    });

    // Merge: prefer existing history for recent days, use summary for older days
    const existingDates = new Set(
      existingHistory.map(h => h.timestamp.split('T')[0])
    );

    // Add summary entries for dates not in existing history
    const combined = [...existingHistory];
    for (const entry of summaryAsHistory) {
      const dateKey = entry.timestamp.split('T')[0];
      if (!existingDates.has(dateKey)) {
        combined.push(entry);
      }
    }

    // Sort by timestamp descending (most recent first)
    return combined.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [item.history, summaryData]);

  return (
    <div 
      className={`${styles.statusItem} ${onClick ? styles.clickable : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className={styles.statusHeader}>
        <div className={styles.statusName}>
          <span
            className={styles.statusIcon}
            style={{backgroundColor: config.color}}
          >
            {config.icon}
          </span>
          <h3>{item.name}</h3>
        </div>
        <div className={styles.statusLabel} style={{color: config.color}}>
          {config.label}
        </div>
      </div>

      {item.description && (
        <p className={styles.statusDescription}>{item.description}</p>
      )}

      <div className={styles.statusMetrics}>
        {showUptime && item.uptime && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Uptime:</span>
            <span className={styles.metricValue}>{item.uptime}</span>
          </div>
        )}
        
        {showResponseTime && item.responseTime !== undefined && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Response Time:</span>
            <span className={styles.metricValue}>{item.responseTime}ms</span>
          </div>
        )}

        {item.incidentCount !== undefined && item.incidentCount > 0 && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Active Incidents:</span>
            <span className={styles.metricValue}>{item.incidentCount}</span>
          </div>
        )}

        {item.lastChecked && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Last Checked:</span>
            <span className={styles.metricValue}>
              {new Date(item.lastChecked).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {showMiniChart && enhancedHistory.length > 0 && (
        <MiniHeatmap history={enhancedHistory} incidents={incidents} maintenance={maintenance} systemName={item.name} days={daysToShow} />
      )}
    </div>
  );
}
