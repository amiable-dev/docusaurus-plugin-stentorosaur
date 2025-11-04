import React from 'react';
import MaintenanceItem from '../MaintenanceItem';
import type { ScheduledMaintenance } from '../../../types';
import styles from './styles.module.css';

interface MaintenanceListProps {
  maintenance: ScheduledMaintenance[];
  filterStatus?: 'upcoming' | 'in-progress' | 'completed' | 'all';
  showComments?: boolean;
  showAffectedSystems?: boolean;
  emptyMessage?: string;
}

export default function MaintenanceList({
  maintenance,
  filterStatus = 'all',
  showComments = true,
  showAffectedSystems = true,
  emptyMessage = 'No scheduled maintenance',
}: MaintenanceListProps): JSX.Element {
  // Filter maintenance based on status
  const filteredMaintenance =
    filterStatus === 'all'
      ? maintenance
      : maintenance.filter((m) => m.status === filterStatus);

  // Sort by start time (upcoming first, then most recent)
  const sortedMaintenance = [...filteredMaintenance].sort((a, b) => {
    const aDate = new Date(a.start).getTime();
    const bDate = new Date(b.start).getTime();

    // For upcoming/in-progress, show soonest first
    if (a.status !== 'completed' && b.status !== 'completed') {
      return aDate - bDate;
    }

    // For completed, show most recent first
    if (a.status === 'completed' && b.status === 'completed') {
      return bDate - aDate;
    }

    // Mix of statuses: non-completed before completed
    if (a.status !== 'completed') return -1;
    if (b.status !== 'completed') return 1;

    return 0;
  });

  if (sortedMaintenance.length === 0) {
    return <div className={styles.emptyState}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.maintenanceList}>
      {sortedMaintenance.map((m) => (
        <MaintenanceItem
          key={m.id}
          maintenance={m}
          showComments={showComments}
          showAffectedSystems={showAffectedSystems}
        />
      ))}
    </div>
  );
}
