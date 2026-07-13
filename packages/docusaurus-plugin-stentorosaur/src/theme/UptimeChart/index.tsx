/**
 * Copyright (c) Amiable Development
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Uptime chart — inline SVG (ADR-005 §11, ticket #73; chart.js removed).
 * Bar mode renders time-block uptime bars; heatmap mode renders a cell
 * grid. Annotations (incidents/maintenance/custom) render as an
 * accessible marker list below the chart instead of a canvas overlay.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { ChartAnnotation, ScheduledMaintenance, StatusCheckHistory, StatusIncident } from '../../types';
import { createAnnotations } from '../../annotation-utils';
import { ExportButton } from '../components/ExportButton';
import { formatDateForFilename } from '../../utils/csv';
import { SvgUptimeBars } from '../svg/SvgCharts';
import type { UptimeBarDatum } from '../svg/SvgCharts';
import styles from './styles.module.css';

type TimePeriod = '24h' | '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
};

const PERIOD_DAYS: Record<TimePeriod, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface TimeBlockUptime {
  timestamp: string;
  label: string;
  uptime: number | null;
  checks: number;
  upChecks: number;
}

export interface UptimeChartProps {
  /** System name */
  name: string;
  /** Historical check data */
  history: StatusCheckHistory[];
  /** Incidents affecting this system (deprecated - use annotations instead) */
  incidents?: StatusIncident[];
  /** Maintenance windows affecting this system (deprecated - use annotations instead) */
  maintenance?: ScheduledMaintenance[];
  /** Generic annotations for extensibility (incidents, maintenance, deployments, etc.) */
  annotations?: ChartAnnotation[];
  /** Chart type */
  chartType?: 'bar' | 'heatmap';
  /** Time period to display */
  period?: '24h' | '7d' | '30d' | '90d';
  /** Chart height in pixels */
  height?: number;
  /** Show period selector */
  showPeriodSelector?: boolean;
}

/** Bucket checks into time blocks (hourly/4-hourly/daily by period). */
function calculateTimeBlockUptime(
  history: StatusCheckHistory[],
  activePeriod: TimePeriod
): TimeBlockUptime[] {
  const now = new Date();
  let blockSizeMs: number;
  let blockCount: number;
  let formatLabel: (date: Date) => string;

  if (activePeriod === '24h') {
    blockSizeMs = 60 * 60 * 1000;
    blockCount = 24;
    formatLabel = date => {
      const hour = date.getHours();
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return `${hour % 12 || 12} ${ampm}`;
    };
  } else if (activePeriod === '7d') {
    blockSizeMs = 4 * 60 * 60 * 1000;
    blockCount = 42;
    formatLabel = date => {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const hour = date.getHours();
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return `${dayNames[date.getDay()]} ${hour % 12 || 12}${ampm}`;
    };
  } else {
    blockSizeMs = 24 * 60 * 60 * 1000;
    blockCount = PERIOD_DAYS[activePeriod];
    formatLabel = date => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  const blocks: TimeBlockUptime[] = [];
  for (let i = blockCount - 1; i >= 0; i--) {
    const blockStart = new Date(now.getTime() - i * blockSizeMs);
    if (activePeriod === '24h') {
      blockStart.setMinutes(0, 0, 0);
    } else if (activePeriod === '7d') {
      blockStart.setHours(Math.floor(blockStart.getHours() / 4) * 4, 0, 0, 0);
    } else {
      blockStart.setHours(0, 0, 0, 0);
    }
    blocks.push({
      timestamp: blockStart.toISOString(),
      label: formatLabel(blockStart),
      uptime: null,
      checks: 0,
      upChecks: 0,
    });
  }

  for (const check of history) {
    const t = new Date(check.timestamp).getTime();
    for (const block of blocks) {
      const start = new Date(block.timestamp).getTime();
      if (t >= start && t < start + blockSizeMs) {
        block.checks++;
        if (check.status === 'up' || check.status === 'maintenance') {
          block.upChecks++;
        }
        break;
      }
    }
  }

  for (const block of blocks) {
    block.uptime = block.checks > 0 ? (block.upChecks / block.checks) * 100 : null;
  }
  return blocks;
}

function heatmapTone(uptime: number | null): string {
  if (uptime === null) return styles.cellNoData ?? '';
  if (uptime >= 99) return styles.cellOk ?? '';
  if (uptime >= 95) return styles.cellWarn ?? '';
  return styles.cellBad ?? '';
}

export default function UptimeChart({
  name,
  history,
  incidents = [],
  maintenance = [],
  annotations,
  chartType = 'bar',
  period = '90d',
  height = 300,
  showPeriodSelector = true,
}: UptimeChartProps): JSX.Element {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>(period);
  const activePeriod = showPeriodSelector ? internalPeriod : period;

  const blocks = useMemo(
    () => calculateTimeBlockUptime(history, activePeriod),
    [history, activePeriod]
  );

  const withData = blocks.filter(b => b.uptime !== null);
  const overallUptime =
    withData.length > 0
      ? withData.reduce((sum, b) => sum + (b.uptime ?? 0), 0) / withData.length
      : null;

  const resolvedAnnotations = useMemo<ChartAnnotation[]>(() => {
    if (annotations) return annotations;
    return createAnnotations(incidents, maintenance);
  }, [annotations, incidents, maintenance]);

  const periodStartMs = Date.now() - PERIOD_DAYS[activePeriod] * 24 * 60 * 60 * 1000;
  const visibleAnnotations = resolvedAnnotations.filter(
    annotation => new Date(annotation.timestamp).getTime() >= periodStartMs
  );

  const exportableData = useMemo(
    () =>
      blocks.map(block => ({
        timestamp: block.timestamp,
        label: block.label,
        uptimePercent: block.uptime === null ? null : parseFloat(block.uptime.toFixed(2)),
        checks: block.checks,
      })),
    [blocks]
  );

  const generateExportFilename = useCallback(() => {
    const systemSlug = name.toLowerCase().replace(/\s+/g, '-');
    if (blocks.length === 0) return `${systemSlug}-uptime`;
    return `${systemSlug}-uptime-${formatDateForFilename(new Date(blocks[0].timestamp))}-to-${formatDateForFilename(new Date(blocks[blocks.length - 1].timestamp))}`;
  }, [blocks, name]);

  if (history.length === 0) {
    return (
      <div className={styles.noData}>
        <p>No uptime data available for the selected period.</p>
      </div>
    );
  }

  const bars: UptimeBarDatum[] = blocks.map(block => ({
    label: block.label,
    uptime: block.uptime,
    title:
      block.uptime === null
        ? `${block.label}: no data`
        : `${block.label}: ${block.uptime.toFixed(2)}% uptime (${block.upChecks}/${block.checks} checks)`,
  }));

  return (
    <div className={styles.chartContainer}>
      {showPeriodSelector && (
        <div className={styles.periodSelector}>
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map(p => (
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
            <span className={styles.statLabel}>Overall Uptime:</span>
            <span className={styles.statValue}>
              {overallUptime === null ? 'n/a' : `${overallUptime.toFixed(2)}%`}
            </span>
          </div>
        </div>
        <div className={styles.exportButtons}>
          <ExportButton
            filename={generateExportFilename()}
            data={exportableData}
            columns={['timestamp', 'label', 'uptimePercent', 'checks']}
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

      {chartType === 'heatmap' ? (
        <div
          className={styles.heatmapGrid}
          role="img"
          aria-label={`Uptime heatmap for ${name}, ${PERIOD_LABELS[activePeriod]}`}
        >
          {blocks.map((block, i) => (
            <span
              key={i}
              data-testid="heatmap-cell"
              className={`${styles.heatmapCell ?? ''} ${heatmapTone(block.uptime)}`}
              title={bars[i].title}
            />
          ))}
        </div>
      ) : (
        <div className={styles.chart}>
          <SvgUptimeBars
            bars={bars}
            height={height}
            ariaLabel={`Uptime chart for ${name}, ${PERIOD_LABELS[activePeriod]}: ${
              overallUptime === null ? 'no data' : `${overallUptime.toFixed(2)}% overall`
            }`}
          />
        </div>
      )}

      {visibleAnnotations.length > 0 && (
        <ul className={styles.annotationList} aria-label="Chart annotations">
          {visibleAnnotations.map((annotation, i) => (
            <li key={i} data-testid="chart-annotation">
              <span className={styles.annotationType}>{annotation.type}</span>{' '}
              {annotation.title} — {new Date(annotation.timestamp).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
