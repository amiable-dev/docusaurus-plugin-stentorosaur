/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import type { StatusCheckHistory, StatusIncident } from '../../types';
import styles from './MiniHeatmap.module.css';

export interface MiniHeatmapProps {
  /** Historical check data */
  history: StatusCheckHistory[];
  /** Incidents to display */
  incidents?: StatusIncident[];
  /** System name to filter incidents */
  systemName?: string;
  /** Number of days to show (default 90) */
  days?: number;
}

/**
 * Compact heatmap visualization showing daily uptime status
 * Similar to status.claude.com or GitHub contribution graph
 */
export default function MiniHeatmap({
  history,
  incidents = [],
  systemName,
  days = 90,
}: MiniHeatmapProps): JSX.Element {
  // Calculate daily uptime percentages
  const calculateDailyUptime = () => {
    const dailyStats = new Map<string, { up: number; total: number }>();
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    history.forEach(check => {
      const checkDate = new Date(check.timestamp);
      if (checkDate < cutoff) return;

      const dateKey = checkDate.toISOString().split('T')[0];
      const stats = dailyStats.get(dateKey) || { up: 0, total: 0 };
      
      stats.total++;
      if (check.status === 'up' || check.status === 'maintenance') {
        stats.up++;
      }
      
      dailyStats.set(dateKey, stats);
    });

    // Fill in all days even if no data
    const result: Array<{ date: string; uptime: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const stats = dailyStats.get(dateKey);
      
      result.push({
        date: dateKey,
        uptime: stats ? (stats.up / stats.total) * 100 : 100,
      });
    }

    return result;
  };

  const dailyData = calculateDailyUptime();

  const getColor = (uptime: number): string => {
    if (uptime >= 99) return 'var(--ifm-color-success)';
    if (uptime >= 95) return 'var(--ifm-color-warning)';
    return 'var(--ifm-color-danger)';
  };

  const getTitle = (date: string, uptime: number, dayIncidents: StatusIncident[]): string => {
    let title = `${date}: ${uptime.toFixed(2)}% uptime`;
    if (dayIncidents.length > 0) {
      title += '\n' + dayIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('\n');
    }
    return title;
  };

  // Filter incidents for this system
  const relevantIncidents = systemName 
    ? incidents.filter(incident => incident.affectedSystems && incident.affectedSystems.includes(systemName))
    : incidents;

  if (history.length === 0) {
    return <div className={styles.noData}>No historical data</div>;
  }

  return (
    <div className={styles.miniHeatmap}>
      <div className={styles.cells}>
        {dailyData.map(({ date, uptime }) => {
          // Check if this day has any incidents
          const dayIncidents = relevantIncidents.filter(incident => {
            const incidentDate = new Date(incident.createdAt).toISOString().split('T')[0];
            return incidentDate === date;
          });
          
          const hasIncident = dayIncidents.length > 0;
          const hasCritical = dayIncidents.some(i => i.severity === 'critical');
          
          return (
            <div
              key={date}
              className={`${styles.cell} ${hasIncident ? styles.hasIncident : ''}`}
              style={{ backgroundColor: getColor(uptime) }}
              title={getTitle(date, uptime, dayIncidents)}
            >
              {hasIncident && (
                <span className={styles.incidentDot} data-critical={hasCritical} />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendLabel}>Last {days} days</span>
      </div>
    </div>
  );
}
