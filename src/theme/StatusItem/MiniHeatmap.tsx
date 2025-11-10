/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useMemo } from 'react';
import type { StatusCheckHistory, StatusIncident } from '../../types';
import { ExportButton } from '../components/ExportButton';
import { formatDateForFilename } from '../../utils/csv';
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
    const result: Array<{ date: string; uptime: number | null }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const stats = dailyStats.get(dateKey);

      result.push({
        date: dateKey,
        uptime: stats ? (stats.up / stats.total) * 100 : null, // null = no data
      });
    }

    return result;
  };

  const dailyData = calculateDailyUptime();

  // Filter incidents for this system
  const relevantIncidents = systemName 
    ? incidents.filter(incident => incident.affectedSystems && incident.affectedSystems.includes(systemName))
    : incidents;

  // Prepare data for CSV/JSON export
  const exportableData = useMemo(() => {
    return dailyData.map(({ date, uptime }) => {
      // Find incidents for this day
      const dayIncidents = relevantIncidents.filter(incident => {
        const incidentDate = new Date(incident.createdAt).toISOString().split('T')[0];
        return incidentDate === date;
      });

      return {
        date,
        uptimePercent: uptime !== null ? parseFloat(uptime.toFixed(2)) : 'No data',
        incidentCount: dayIncidents.length,
        incidents: dayIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('; '),
      };
    });
  }, [dailyData, relevantIncidents]);

  // Generate filename with date range
  const generateExportFilename = () => {
    if (dailyData.length === 0) {
      return systemName 
        ? `${systemName.toLowerCase().replace(/\s+/g, '-')}-heatmap`
        : 'uptime-heatmap';
    }
    
    const firstDate = new Date(dailyData[0].date);
    const lastDate = new Date(dailyData[dailyData.length - 1].date);
    const systemSlug = systemName 
      ? systemName.toLowerCase().replace(/\s+/g, '-')
      : 'uptime';
    
    return `${systemSlug}-heatmap-${formatDateForFilename(firstDate)}-to-${formatDateForFilename(lastDate)}`;
  };

  const getColor = (uptime: number | null): string => {
    if (uptime === null) return 'var(--ifm-color-emphasis-300)'; // Gray for no data
    if (uptime >= 99) return 'var(--ifm-color-success)';
    if (uptime >= 95) return 'var(--ifm-color-warning)';
    return 'var(--ifm-color-danger)';
  };

  const getTitle = (date: string, uptime: number | null, dayIncidents: StatusIncident[]): string => {
    let title = uptime !== null
      ? `${date}: ${uptime.toFixed(2)}% uptime`
      : `${date}: No monitoring data`;
    if (dayIncidents.length > 0) {
      title += '\n' + dayIncidents.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('\n');
    }
    return title;
  };

  if (history.length === 0) {
    return <div className={styles.noData}>No historical data</div>;
  }

  return (
    <div className={styles.miniHeatmap}>
      <div className={styles.heatmapHeader}>
        <span className={styles.legendLabel}>Last {days} days</span>
        <div className={styles.exportButtons}>
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            columns={['date', 'uptimePercent', 'incidentCount', 'incidents']}
            format="csv"
            ariaLabel="Download heatmap data as CSV"
          />
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            format="json"
            ariaLabel="Download heatmap data as JSON"
          />
        </div>
      </div>
      <div className={styles.cells}>
        {dailyData.map(({ date, uptime }) => {
          const isNoData = uptime === null;

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
    </div>
  );
}
