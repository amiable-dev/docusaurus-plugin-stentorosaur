/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import {formatDistanceToNow} from 'date-fns';
import type {StatusIncident} from '../../types';
import styles from './styles.module.css';

export interface Props {
  incidents: StatusIncident[];
  maxItems?: number;
}

const severityConfig = {
  critical: {
    label: 'Critical',
    color: '#ef4444',
    icon: '🔴',
  },
  major: {
    label: 'Major',
    color: '#f59e0b',
    icon: '🟠',
  },
  minor: {
    label: 'Minor',
    color: '#3b82f6',
    icon: '🔵',
  },
  maintenance: {
    label: 'Maintenance',
    color: '#6366f1',
    icon: '🔧',
  },
};

export default function IncidentHistory({
  incidents,
  maxItems = 10,
}: Props): JSX.Element {
  const displayIncidents = incidents.slice(0, maxItems);

  if (displayIncidents.length === 0) {
    return (
      <div className={styles.incidentHistory}>
        <h2>Incident History</h2>
        <div className={styles.emptyState}>
          <p>No incidents reported. All systems are running smoothly! 🎉</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.incidentHistory}>
      <h2>Recent Incidents</h2>
      <div className={styles.timeline}>
        {displayIncidents.map((incident) => {
          const config = severityConfig[incident.severity];
          const timeAgo = formatDistanceToNow(new Date(incident.createdAt), {
            addSuffix: true,
          });

          return (
            <div
              key={incident.id}
              className={`${styles.incident} ${
                incident.status === 'open' ? styles.incidentOpen : styles.incidentClosed
              }`}
            >
              <div className={styles.incidentMarker}>
                <span
                  className={styles.incidentDot}
                  style={{backgroundColor: config.color}}
                />
                <div className={styles.incidentLine} />
              </div>

              <div className={styles.incidentContent}>
                <div className={styles.incidentHeader}>
                  <div className={styles.incidentTitle}>
                    <span className={styles.severityBadge} style={{color: config.color}}>
                      {config.icon} {config.label}
                    </span>
                    <a
                      href={incident.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.incidentLink}
                    >
                      {incident.title}
                    </a>
                  </div>
                  <div className={styles.incidentStatus}>
                    {incident.status === 'open' ? (
                      <span className={styles.statusOpen}>Open</span>
                    ) : (
                      <span className={styles.statusClosed}>Resolved</span>
                    )}
                  </div>
                </div>

                {incident.affectedSystems.length > 0 && (
                  <div className={styles.affectedSystems}>
                    <span className={styles.affectedLabel}>Affected:</span>
                    {incident.affectedSystems.map((system) => (
                      <span key={system} className={styles.systemTag}>
                        {system}
                      </span>
                    ))}
                  </div>
                )}

                <div className={styles.incidentMeta}>
                  <span>{timeAgo}</span>
                  {incident.closedAt && (
                    <span>
                      • Resolved {formatDistanceToNow(new Date(incident.closedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>

                {incident.body && (
                  <div className={styles.incidentBody}>
                    {incident.body.substring(0, 200)}
                    {incident.body.length > 200 && '...'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
