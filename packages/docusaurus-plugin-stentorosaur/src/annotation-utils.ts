/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ChartAnnotation, StatusIncident, ScheduledMaintenance } from './types';

/**
 * Convert a StatusIncident to a ChartAnnotation
 */
export function incidentToAnnotation(incident: StatusIncident): ChartAnnotation {
  const severityColors = {
    critical: 'rgba(220, 38, 38, 0.8)', // red-600
    major: 'rgba(249, 115, 22, 0.8)',   // orange-500
    minor: 'rgba(234, 179, 8, 0.8)',    // yellow-500
    maintenance: 'rgba(107, 114, 128, 0.8)', // gray-500
  };

  const severityIcons = {
    critical: '⚠️',
    major: '📌',
    minor: '📍',
    maintenance: '🔧',
  };

  // Map 'maintenance' severity to 'info' for ChartAnnotation
  const mappedSeverity: 'critical' | 'major' | 'minor' | 'info' =
    incident.severity === 'maintenance' ? 'info' : incident.severity;

  return {
    id: `incident-${incident.id}`,
    type: 'incident',
    timestamp: incident.createdAt,
    title: incident.title,
    severity: mappedSeverity,
    affectedSystems: incident.affectedSystems,
    url: incident.url,
    icon: severityIcons[incident.severity],
    color: severityColors[incident.severity],
    data: {
      status: incident.status,
    },
  };
}

/**
 * Convert a ScheduledMaintenance to a ChartAnnotation
 */
export function maintenanceToAnnotation(maintenance: ScheduledMaintenance): ChartAnnotation {
  const statusColors = {
    upcoming: 'rgba(59, 130, 246, 0.8)',    // blue-500
    'in-progress': 'rgba(147, 51, 234, 0.8)', // purple-600
    completed: 'rgba(107, 114, 128, 0.6)',   // gray-500 (lighter)
  };

  const statusIcons = {
    upcoming: '🔔',
    'in-progress': '🔧',
    completed: '✅',
  };

  return {
    id: `maintenance-${maintenance.id}`,
    type: 'maintenance',
    timestamp: maintenance.start,
    title: maintenance.title,
    severity: 'info',
    affectedSystems: maintenance.affectedSystems,
    url: maintenance.url,
    icon: statusIcons[maintenance.status],
    color: statusColors[maintenance.status],
    data: {
      start: maintenance.start,
      end: maintenance.end,
      maintenanceStatus: maintenance.status,
    },
  };
}

/**
 * Convert arrays of incidents and maintenance to annotations
 * @param incidents Array of incidents
 * @param maintenance Array of maintenance windows
 * @returns Combined array of annotations sorted by timestamp (newest first)
 */
export function createAnnotations(
  incidents: StatusIncident[] = [],
  maintenance: ScheduledMaintenance[] = []
): ChartAnnotation[] {
  const incidentAnnotations = incidents.map(incidentToAnnotation);
  const maintenanceAnnotations = maintenance.map(maintenanceToAnnotation);

  const allAnnotations = [...incidentAnnotations, ...maintenanceAnnotations];

  // Sort by timestamp, newest first
  allAnnotations.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  });

  return allAnnotations;
}

/**
 * Filter annotations by affected system
 * @param annotations Array of annotations
 * @param systemName Name of the system to filter by
 * @returns Filtered annotations that affect the specified system
 */
export function filterAnnotationsBySystem(
  annotations: ChartAnnotation[],
  systemName: string
): ChartAnnotation[] {
  return annotations.filter((annotation) =>
    annotation.affectedSystems &&
    annotation.affectedSystems.includes(systemName)
  );
}
