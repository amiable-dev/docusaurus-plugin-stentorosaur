/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-004: UptimeBar Component
 *
 * 90-day horizontal uptime bar visualization.
 * Displays daily uptime status as colored cells.
 *
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React, { useMemo, useCallback, useState, useRef, type KeyboardEvent } from 'react';
import { useStatusData, type DayStatus } from '../../context/StatusDataProvider';
import styles from './styles.module.css';

/**
 * Custom thresholds for status determination
 */
export interface UptimeThresholds {
  /** Uptime >= this is operational (default: 99) */
  operational: number;
  /** Uptime >= this is degraded, < is outage (default: 95) */
  degraded: number;
}

/**
 * Props for UptimeBar component
 */
export interface UptimeBarProps {
  /** Service name for data lookup (uses context) */
  serviceName: string;
  /** Override data for testing/Storybook */
  data?: DayStatus[];
  /** Number of days to display (default: 90) */
  days?: number;
  /** Height of the bar in pixels (default: 34) */
  height?: number;
  /** Gap between bars in pixels (default: 2) */
  gap?: number;
  /** Show uptime percentage text (default: true) */
  showPercentage?: boolean;
  /** Show date labels (default: true) */
  showDateLabels?: boolean;
  /** Customizable thresholds */
  thresholds?: UptimeThresholds;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Accessibility label */
  ariaLabel?: string;
  /** Interaction callbacks */
  onDayClick?: (date: string, status: DayStatus) => void;
  onDayHover?: (date: string, status: DayStatus | null) => void;
  /** Optional additional className */
  className?: string;
}

/**
 * Default thresholds per ADR-004
 */
const DEFAULT_THRESHOLDS: UptimeThresholds = {
  operational: 99,
  degraded: 95,
};

/**
 * Get status class based on uptime and thresholds
 */
function getStatusClass(
  uptimePercent: number,
  thresholds: UptimeThresholds,
  originalStatus: DayStatus['status']
): string {
  // If original status is no-data, keep it
  if (originalStatus === 'no-data') {
    return styles.statusNoData;
  }

  // Apply threshold-based status
  if (uptimePercent >= thresholds.operational) {
    return styles.statusOperational;
  }
  if (uptimePercent >= thresholds.degraded) {
    return styles.statusDegraded;
  }
  return styles.statusOutage;
}

/**
 * Calculate average uptime percentage
 */
function calculateAverageUptime(days: DayStatus[]): number {
  if (days.length === 0) return 0;
  const sum = days.reduce((acc, day) => acc + day.uptimePercent, 0);
  return sum / days.length;
}

/**
 * Generate summary for screen readers
 */
function generateAriaLabel(
  serviceName: string,
  days: DayStatus[],
  averageUptime: number
): string {
  const operationalDays = days.filter((d) => d.status === 'operational').length;
  const degradedDays = days.filter((d) => d.status === 'degraded').length;
  const outageDays = days.filter((d) => d.status === 'outage').length;

  let summary = `${days.length}-day uptime for ${serviceName}: ${averageUptime.toFixed(1)}%.`;

  if (operationalDays > 0) {
    summary += ` ${operationalDays} days operational.`;
  }
  if (degradedDays > 0) {
    summary += ` ${degradedDays} days degraded.`;
  }
  if (outageDays > 0) {
    summary += ` ${outageDays} days with outage.`;
  }

  return summary;
}

/**
 * UptimeBar Component
 *
 * Displays a horizontal bar of daily uptime status cells.
 * Each cell represents one day, colored by uptime percentage.
 */
export function UptimeBar({
  serviceName,
  data: providedData,
  days = 90,
  height = 34,
  gap = 2,
  showPercentage = true,
  showDateLabels = true,
  thresholds = DEFAULT_THRESHOLDS,
  loading = false,
  error,
  onRetry,
  ariaLabel,
  onDayClick,
  onDayHover,
  className,
}: UptimeBarProps): React.ReactElement {
  // Get data from context or use provided data
  const { getMerged90Days } = useStatusData();

  // Roving tabindex state - track which day has focus
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dayCellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dayData = useMemo(() => {
    if (providedData) {
      return providedData.slice(0, days);
    }
    return getMerged90Days(serviceName).slice(0, days);
  }, [providedData, serviceName, days, getMerged90Days]);

  // Calculate average uptime
  const averageUptime = useMemo(
    () => calculateAverageUptime(dayData),
    [dayData]
  );

  // Generate aria label
  const computedAriaLabel = useMemo(() => {
    if (ariaLabel) return ariaLabel;
    return generateAriaLabel(serviceName, dayData, averageUptime);
  }, [ariaLabel, serviceName, dayData, averageUptime]);

  // Event handlers
  const handleDayClick = useCallback(
    (day: DayStatus, index: number) => {
      setFocusedIndex(index);
      if (onDayClick) {
        onDayClick(day.date, day);
      }
    },
    [onDayClick]
  );

  // Roving tabindex keyboard navigation
  const handleBarKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const displayDays = [...dayData].reverse();
      const maxIndex = displayDays.length - 1;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const newIndex = Math.min(prev + 1, maxIndex);
            dayCellRefs.current[newIndex]?.focus();
            return newIndex;
          });
          break;
        case 'ArrowLeft':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const newIndex = Math.max(prev - 1, 0);
            dayCellRefs.current[newIndex]?.focus();
            return newIndex;
          });
          break;
        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          dayCellRefs.current[0]?.focus();
          break;
        case 'End':
          event.preventDefault();
          setFocusedIndex(maxIndex);
          dayCellRefs.current[maxIndex]?.focus();
          break;
      }
    },
    [dayData]
  );

  const handleDayKeyDown = useCallback(
    (event: KeyboardEvent, day: DayStatus, index: number) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (onDayClick) {
          onDayClick(day.date, day);
        }
      }
    },
    [onDayClick]
  );

  const handleDayHover = useCallback(
    (day: DayStatus | null) => {
      if (onDayHover && day) {
        onDayHover(day.date, day);
      } else if (onDayHover && !day) {
        // Pass the last hovered date (or empty string) with null
        onDayHover('', null);
      }
    },
    [onDayHover]
  );

  // Loading state
  if (loading) {
    return (
      <div className={`${styles.uptimeBarContainer} ${styles.loading} ${className || ''}`}>
        <div className={styles.skeleton} style={{ height: `${height}px` }} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${styles.uptimeBarContainer} ${styles.error} ${className || ''}`}>
        <span className={styles.errorMessage}>Failed to load uptime data</span>
        {onRetry && (
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetry}
            aria-label="Retry loading uptime data"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (dayData.length === 0) {
    return (
      <div
        className={`${styles.uptimeBarContainer} ${styles.empty} ${className || ''}`}
        role="img"
        aria-label={`No uptime data available for ${serviceName}`}
      >
        <span className={styles.emptyMessage}>No data available</span>
      </div>
    );
  }

  // Reverse for display (oldest first, newest last)
  const displayDays = [...dayData].reverse();

  return (
    <div className={`${styles.uptimeBarContainer} ${className || ''}`}>
      {/* Uptime percentage */}
      {showPercentage && (
        <div className={styles.uptimePercentage}>
          <span className={styles.percentageValue}>
            {averageUptime.toFixed(2)}%
          </span>
          <span className={styles.percentageLabel}>uptime</span>
        </div>
      )}

      {/* Main bar - Roving tabindex pattern: container is focusable, arrow keys navigate */}
      <div
        className={styles.uptimeBar}
        role="group"
        aria-label={computedAriaLabel}
        style={{ height: `${height}px`, gap: `${gap}px` }}
        onKeyDown={handleBarKeyDown}
      >
        {displayDays.map((day, index) => (
          <button
            key={day.date}
            ref={(el) => { dayCellRefs.current[index] = el; }}
            type="button"
            className={`${styles.dayCell} ${getStatusClass(day.uptimePercent, thresholds, day.status)}`}
            tabIndex={index === focusedIndex ? 0 : -1}
            aria-label={`${day.date}: ${day.uptimePercent.toFixed(1)}% uptime, ${day.incidents} incidents`}
            onClick={() => handleDayClick(day, index)}
            onKeyDown={(e) => handleDayKeyDown(e, day, index)}
            onMouseEnter={() => handleDayHover(day)}
            onMouseLeave={() => handleDayHover(null)}
            onFocus={() => setFocusedIndex(index)}
          />
        ))}
      </div>

      {/* Date labels */}
      {showDateLabels && (
        <div className={styles.dateLabels}>
          <span className={styles.dateLabelStart}>{days} days ago</span>
          <span className={styles.dateLabelEnd}>Today</span>
        </div>
      )}
    </div>
  );
}

// Default export for easier imports
export default UptimeBar;

// Re-export types
export type { DayStatus };
