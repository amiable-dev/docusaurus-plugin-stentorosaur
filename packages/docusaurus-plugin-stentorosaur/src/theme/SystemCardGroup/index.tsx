/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-004: SystemCardGroup Component
 *
 * Container for grouping multiple SystemCards with collapsible behavior.
 * Shows aggregate status (worst-of) for the group.
 *
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React, {
  useState,
  useCallback,
  useMemo,
  Children,
  isValidElement,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import styles from './styles.module.css';

/**
 * Status types (matching SystemCard)
 */
export type GroupStatus = 'up' | 'degraded' | 'down' | 'maintenance';

/**
 * Status priority for aggregation (higher = worse)
 */
const STATUS_PRIORITY: Record<GroupStatus, number> = {
  up: 0,
  maintenance: 1,
  degraded: 2,
  down: 3,
};

/**
 * Props for SystemCardGroup component
 */
export interface SystemCardGroupProps {
  /** Group identifier */
  name: string;
  /** Display name */
  displayName: string;
  /** Initially collapsed (default: false) */
  defaultCollapsed?: boolean;
  /** Group status override (derived from children if not provided) */
  status?: GroupStatus;
  /** Semantic heading level (default: 2) */
  headingLevel?: 2 | 3 | 4;
  /** Children (SystemCard components) */
  children: ReactNode;
  /** Optional additional className */
  className?: string;
}

/**
 * Status labels for group header
 */
const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  up: 'All Operational',
  degraded: 'Partial Issues',
  down: 'Service Outage',
  maintenance: 'Maintenance',
};

/**
 * Status class mapping
 */
const GROUP_STATUS_CLASS_MAP: Record<GroupStatus, string> = {
  up: styles.groupStatusUp,
  degraded: styles.groupStatusDegraded,
  down: styles.groupStatusDown,
  maintenance: styles.groupStatusMaintenance,
};

/**
 * Extract status from SystemCard children
 */
function getWorstStatus(children: ReactNode): GroupStatus {
  let worstStatus: GroupStatus = 'up';
  let worstPriority = STATUS_PRIORITY.up;

  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.props.status) {
      const childStatus = child.props.status as GroupStatus;
      const priority = STATUS_PRIORITY[childStatus] ?? 0;

      if (priority > worstPriority) {
        worstPriority = priority;
        worstStatus = childStatus;
      }
    }
  });

  return worstStatus;
}

/**
 * Count valid children
 */
function countChildren(children: ReactNode): number {
  let count = 0;
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      count++;
    }
  });
  return count;
}

/**
 * SystemCardGroup Component
 *
 * Groups multiple SystemCards together with a collapsible header.
 * Displays aggregate status based on worst child status.
 */
export function SystemCardGroup({
  name,
  displayName,
  defaultCollapsed = false,
  status: explicitStatus,
  headingLevel = 2,
  children,
  className,
}: SystemCardGroupProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Derive status from children or use explicit override
  const aggregatedStatus = useMemo(() => {
    if (explicitStatus) return explicitStatus;
    return getWorstStatus(children);
  }, [explicitStatus, children]);

  // Count children
  const childCount = useMemo(() => countChildren(children), [children]);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  const Heading = `h${headingLevel}` as keyof JSX.IntrinsicElements;
  const statusLabel = GROUP_STATUS_LABELS[aggregatedStatus];
  const statusClass = GROUP_STATUS_CLASS_MAP[aggregatedStatus];
  const serviceWord = childCount === 1 ? 'service' : 'services';

  return (
    <section
      className={`${styles.systemCardGroup} ${collapsed ? styles.collapsed : ''} ${statusClass} ${className || ''}`}
      data-group={name}
    >
      {/* Group header */}
      <div className={styles.groupHeader}>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={!collapsed}
          aria-label={`Toggle ${displayName} group`}
        >
          <span
            className={`${styles.expandIcon} ${!collapsed ? styles.expandIconOpen : ''}`}
          >
            ▼
          </span>
        </button>

        <div className={styles.groupInfo}>
          <Heading className={styles.groupTitle}>{displayName}</Heading>
          <span className={styles.groupMeta}>
            <span className={styles.serviceCount}>
              {childCount} {serviceWord}
            </span>
            <span className={styles.statusDot} />
            <span className={styles.statusLabel}>{statusLabel}</span>
          </span>
        </div>
      </div>

      {/* Group content (children) */}
      <div
        className={`${styles.groupContent} ${collapsed ? styles.contentHidden : ''}`}
        aria-hidden={collapsed}
      >
        {children}
      </div>
    </section>
  );
}

// Default export
export default SystemCardGroup;
