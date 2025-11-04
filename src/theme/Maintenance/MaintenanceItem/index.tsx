import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { ScheduledMaintenance } from '../../../types';
import styles from './styles.module.css';

interface MaintenanceItemProps {
  maintenance: ScheduledMaintenance;
  showComments?: boolean;
  showAffectedSystems?: boolean;
}

const statusIcons = {
  upcoming: '📅',
  'in-progress': '🔧',
  completed: '✅',
};

const statusLabels = {
  upcoming: 'Upcoming',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

export default function MaintenanceItem({
  maintenance,
  showComments = true,
  showAffectedSystems = true,
}: MaintenanceItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const startDate = new Date(maintenance.start);
  const endDate = new Date(maintenance.end);
  const now = new Date();

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const getTimeStatus = () => {
    if (maintenance.status === 'upcoming') {
      return `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`;
    } else if (maintenance.status === 'in-progress') {
      return `Started ${formatDistanceToNow(startDate, { addSuffix: true })}`;
    } else {
      return `Completed ${formatDistanceToNow(endDate, { addSuffix: true })}`;
    }
  };

  return (
    <div className={`${styles.maintenanceItem} ${styles[maintenance.status]}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.statusIcon}>
            {statusIcons[maintenance.status]}
          </span>
          <h3 className={styles.title}>
            <a href={maintenance.url} target="_blank" rel="noopener noreferrer">
              {maintenance.title}
            </a>
          </h3>
        </div>
        <span className={styles.status}>
          {statusLabels[maintenance.status]}
        </span>
      </div>

      <div className={styles.timeInfo}>
        <div className={styles.timeRange}>
          <strong>Scheduled:</strong> {formatDateTime(startDate)} -{' '}
          {formatDateTime(endDate)}
        </div>
        <div className={styles.timeStatus}>{getTimeStatus()}</div>
      </div>

      {showAffectedSystems && maintenance.affectedSystems.length > 0 && (
        <div className={styles.affectedSystems}>
          <strong>Affected Systems:</strong>{' '}
          {maintenance.affectedSystems.join(', ')}
        </div>
      )}

      {maintenance.description && (
        <div className={styles.description}>{maintenance.description}</div>
      )}

      {showComments && maintenance.comments.length > 0 && (
        <div className={styles.commentsSection}>
          <button
            className={styles.toggleButton}
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? '▼' : '▶'} {maintenance.comments.length}{' '}
            {maintenance.comments.length === 1 ? 'update' : 'updates'}
          </button>

          {expanded && (
            <div className={styles.comments}>
              {maintenance.comments.map((comment, index) => (
                <div key={index} className={styles.comment}>
                  <div className={styles.commentHeader}>
                    <span className={styles.commentAuthor}>
                      {comment.author}
                    </span>
                    <span className={styles.commentTimestamp}>
                      {new Date(comment.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className={styles.commentBody}>{comment.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
