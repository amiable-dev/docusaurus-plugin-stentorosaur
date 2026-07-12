/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-004: StatusBadge Component
 *
 * Status indicator badge with status text and icon.
 * Supports i18n via customizable labels and size variants.
 *
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import styles from './styles.module.css';

/**
 * Status types supported by the badge
 */
export type StatusType = 'up' | 'degraded' | 'down' | 'maintenance';

/**
 * Custom labels for i18n support
 */
export interface StatusLabels {
  up?: string;
  degraded?: string;
  down?: string;
  maintenance?: string;
}

/**
 * Size variants
 */
export type StatusBadgeSize = 'sm' | 'md' | 'lg';

/**
 * Props for StatusBadge component
 */
export interface StatusBadgeProps {
  /** Current status */
  status: StatusType;
  /** Custom labels for i18n */
  labels?: StatusLabels;
  /** Size variant (default: 'md') */
  size?: StatusBadgeSize;
  /** Optional additional className */
  className?: string;
}

/**
 * Default labels for each status
 */
const DEFAULT_LABELS: Required<StatusLabels> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Major Outage',
  maintenance: 'Maintenance',
};

/**
 * Status icons for visual indication (accessible, works with or without color)
 */
const STATUS_ICONS: Record<StatusType, string> = {
  up: '●',
  degraded: '●',
  down: '●',
  maintenance: '●',
};

/**
 * CSS class mapping for status types
 */
const STATUS_CLASS_MAP: Record<StatusType, string> = {
  up: styles.statusUp,
  degraded: styles.statusDegraded,
  down: styles.statusDown,
  maintenance: styles.statusMaintenance,
};

/**
 * CSS class mapping for sizes
 */
const SIZE_CLASS_MAP: Record<StatusBadgeSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

/**
 * StatusBadge Component
 *
 * Displays a status indicator with colored dot and label text.
 * Designed for accessibility with ARIA role and visual icon.
 */
export function StatusBadge({
  status,
  labels,
  size = 'md',
  className,
}: StatusBadgeProps): React.ReactElement {
  // Merge custom labels with defaults
  const resolvedLabels = {
    ...DEFAULT_LABELS,
    ...labels,
  };

  const label = resolvedLabels[status];
  const icon = STATUS_ICONS[status];
  const statusClass = STATUS_CLASS_MAP[status];
  const sizeClass = SIZE_CLASS_MAP[size];

  return (
    <span
      className={`${styles.statusBadge} ${statusClass} ${sizeClass} ${className || ''}`}
      role="status"
    >
      <span className={styles.statusIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.statusLabel}>{label}</span>
    </span>
  );
}

// Default export for easier imports
export default StatusBadge;
