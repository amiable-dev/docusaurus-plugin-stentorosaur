/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import type {StatusItem as StatusItemType} from '../../types';
import styles from './styles.module.css';

export interface Props {
  item: StatusItemType;
  showResponseTime?: boolean;
  showUptime?: boolean;
  onClick?: () => void;
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
  showResponseTime = true,
  showUptime = true,
  onClick,
}: Props): JSX.Element {
  const config = statusConfig[item.status];

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
    </div>
  );
}
