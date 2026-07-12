/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ADR-004: SystemCard Compound Component
 *
 * Collapsible system status card with compound component pattern.
 * Includes Header, UptimeBar, Details, Metrics, and Charts sub-components.
 *
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { StatusBadge } from '../StatusBadge';
import { UptimeBar, type UptimeBarProps } from '../UptimeBar';
import styles from './styles.module.css';

/**
 * Status types
 */
export type SystemStatus = 'up' | 'degraded' | 'down' | 'maintenance';

/**
 * Context for compound components
 */
interface SystemCardContextValue {
  name: string;
  status: SystemStatus;
  expanded: boolean;
  expandable: boolean;
}

const SystemCardContext = createContext<SystemCardContextValue | undefined>(
  undefined
);

function useSystemCardContext(): SystemCardContextValue {
  const context = useContext(SystemCardContext);
  if (!context) {
    throw new Error(
      'SystemCard compound components must be used within a SystemCard'
    );
  }
  return context;
}

/**
 * Props for SystemCard component
 */
export interface SystemCardProps {
  /** System identifier */
  name: string;
  /** Display name (optional) */
  displayName?: string;
  /** Current status */
  status: SystemStatus;
  /** Enable expand on click (default: true) */
  expandable?: boolean;
  /** Initial expanded state */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expanded/collapsed */
  onExpandChange?: (expanded: boolean) => void;
  /** Semantic heading level (default: 3) */
  headingLevel?: 2 | 3 | 4;
  /** Accessibility label for expand button */
  expandButtonLabel?: string;
  /** Compound component children */
  children?: ReactNode;
  /** Optional additional className */
  className?: string;
}

/**
 * Status class mapping
 */
const STATUS_CLASS_MAP: Record<SystemStatus, string> = {
  up: styles.statusUp,
  degraded: styles.statusDegraded,
  down: styles.statusDown,
  maintenance: styles.statusMaintenance,
};

/**
 * SystemCard Component
 *
 * Main container for system status with expand/collapse functionality.
 */
export function SystemCard({
  name,
  displayName,
  status,
  expandable = true,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandChange,
  headingLevel = 3,
  expandButtonLabel,
  children,
  className,
}: SystemCardProps): React.ReactElement {
  // Uncontrolled state
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Use controlled or uncontrolled state
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = useCallback(() => {
    if (!expandable) return;

    const newExpanded = !expanded;

    if (!isControlled) {
      setInternalExpanded(newExpanded);
    }

    onExpandChange?.(newExpanded);
  }, [expandable, expanded, isControlled, onExpandChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!expandable) return;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle();
      } else if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        if (!isControlled) {
          setInternalExpanded(false);
        }
        onExpandChange?.(false);
      }
    },
    [expandable, expanded, isControlled, onExpandChange, handleToggle]
  );

  const Heading = `h${headingLevel}` as keyof JSX.IntrinsicElements;
  const label = displayName || name;

  // Context value for compound components
  const contextValue: SystemCardContextValue = {
    name,
    status,
    expanded,
    expandable,
  };

  const statusClass = STATUS_CLASS_MAP[status];

  return (
    <SystemCardContext.Provider value={contextValue}>
      <article
        className={`${styles.systemCard} ${statusClass} ${expanded ? styles.expanded : ''} ${className || ''}`}
        role="article"
        aria-expanded={expanded}
        tabIndex={expandable ? 0 : undefined}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleRow}>
            <Heading className={styles.cardTitle}>{label}</Heading>
            <StatusBadge status={status} size="sm" />
          </div>
          {expandable && (
            <button
              type="button"
              className={styles.expandButton}
              aria-label={expandButtonLabel || `Toggle ${label} details`}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
            >
              <span
                className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}
              >
                ▼
              </span>
            </button>
          )}
        </div>

        {/* Children (Header, UptimeBar, etc.) */}
        {children}
      </article>
    </SystemCardContext.Provider>
  );
}

/**
 * SystemCard.Header - Custom header content
 */
export interface SystemCardHeaderProps {
  children?: ReactNode;
}

export function SystemCardHeader({
  children,
}: SystemCardHeaderProps): React.ReactElement {
  return <div className={styles.customHeader}>{children}</div>;
}

/**
 * SystemCard.UptimeBar - Embedded UptimeBar
 */
export function SystemCardUptimeBar(
  props: Omit<UptimeBarProps, 'serviceName'> & { serviceName?: string }
): React.ReactElement {
  const { name } = useSystemCardContext();
  return (
    <div className={styles.uptimeBarWrapper}>
      <UptimeBar {...props} serviceName={props.serviceName || name} />
    </div>
  );
}

/**
 * SystemCard.Details - Expandable content container
 */
export interface SystemCardDetailsProps {
  children?: ReactNode;
}

export function SystemCardDetails({
  children,
}: SystemCardDetailsProps): React.ReactElement {
  const { expanded } = useSystemCardContext();

  return (
    <div
      className={`${styles.cardDetails} ${expanded ? styles.detailsVisible : ''}`}
      aria-hidden={!expanded}
    >
      {children}
    </div>
  );
}

/**
 * SystemCard.Metrics - Response time and last checked
 */
export interface SystemCardMetricsProps {
  responseTime?: number;
  lastChecked?: string;
}

export function SystemCardMetrics({
  responseTime,
  lastChecked,
}: SystemCardMetricsProps): React.ReactElement {
  return (
    <div className={styles.metricsGrid}>
      {responseTime !== undefined && (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Response Time</span>
          <span className={styles.metricValue}>{responseTime}ms</span>
        </div>
      )}
      {lastChecked !== undefined && (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Last Checked</span>
          <span className={styles.metricValue}>{lastChecked}</span>
        </div>
      )}
      {responseTime === undefined && lastChecked === undefined && (
        <div className={styles.metricItem}>
          <span className={styles.metricValue}>N/A</span>
        </div>
      )}
    </div>
  );
}

/**
 * SystemCard.Charts - Chart container (placeholder)
 */
export interface SystemCardChartsProps {
  serviceName?: string;
  children?: ReactNode;
}

export function SystemCardCharts({
  children,
}: SystemCardChartsProps): React.ReactElement {
  return <div className={styles.chartsContainer}>{children}</div>;
}

// Attach compound components to SystemCard
SystemCard.Header = SystemCardHeader;
SystemCard.UptimeBar = SystemCardUptimeBar;
SystemCard.Details = SystemCardDetails;
SystemCard.Metrics = SystemCardMetrics;
SystemCard.Charts = SystemCardCharts;

// Default export
export default SystemCard;
