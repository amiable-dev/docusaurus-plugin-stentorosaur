/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {StatusItem, StatusIncident} from './types';

export function getDemoStatusData(): {items: StatusItem[]; incidents: StatusIncident[]} {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();

  const items: StatusItem[] = [
    {
      name: 'Main Website',
      status: 'up',
      uptime: '99.98%',
      responseTime: 145,
      lastChecked: now,
    },
    {
      name: 'API Service',
      status: 'up',
      uptime: '99.95%',
      responseTime: 89,
      lastChecked: now,
    },
    {
      name: 'Documentation',
      status: 'up',
      uptime: '100%',
      responseTime: 123,
      lastChecked: now,
    },
    {
      name: 'Build & CI/CD',
      status: 'degraded',
      uptime: '98.2%',
      responseTime: 456,
      lastChecked: now,
    },
    {
      name: 'CDN',
      status: 'up',
      uptime: '99.99%',
      responseTime: 34,
      lastChecked: now,
    },
  ];

  const incidents: StatusIncident[] = [
    {
      id: 1,
      title: 'Build System Performance Degradation',
      severity: 'major',
      status: 'open',
      affectedSystems: ['Build & CI/CD'],
      createdAt: twoHoursAgo,
      updatedAt: oneHourAgo,
      url: 'https://github.com/example/repo/issues/1',
      body: 'We are investigating reports of slow build times and occasional timeouts.\n\n**Update:** We have identified increased load on our build servers.',
      labels: ['status', 'build-system', 'investigating'],
    },
    {
      id: 2,
      title: 'Scheduled Maintenance - Database Upgrade',
      severity: 'maintenance',
      status: 'closed',
      affectedSystems: ['API Service', 'Main Website'],
      createdAt: oneDayAgo,
      updatedAt: oneDayAgo,
      closedAt: oneDayAgo,
      url: 'https://github.com/example/repo/issues/2',
      body: 'Database upgrade completed successfully. All systems operational.',
      labels: ['status', 'maintenance', 'resolved'],
    },
    {
      id: 3,
      title: 'CDN Cache Issue - Stale Content',
      severity: 'minor',
      status: 'closed',
      affectedSystems: ['CDN', 'Main Website'],
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
      closedAt: twoDaysAgo,
      url: 'https://github.com/example/repo/issues/3',
      body: 'Cache purged. Content now up to date.',
      labels: ['status', 'cdn', 'resolved'],
    },
  ];

  return {items, incidents};
}
