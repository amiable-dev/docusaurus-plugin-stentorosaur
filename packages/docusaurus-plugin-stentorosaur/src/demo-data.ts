/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {StatusItem, StatusIncident, SystemStatusFile, StatusCheckHistory, ScheduledMaintenance} from './types';
import {generateDemoHistory} from './historical-data';

// Cache for demo history to ensure consistency between status items and system files
const demoHistoryCache = new Map<string, StatusCheckHistory[]>();

// Consistent base timestamp (rounded to nearest hour) for all demo data generation
const DEMO_BASE_TIMESTAMP = Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000);

/**
 * Get cached demo history for a system, or generate if not cached
 */
function getCachedDemoHistory(systemName: string, days: number): StatusCheckHistory[] {
  const cacheKey = `${systemName}:${days}`;
  if (!demoHistoryCache.has(cacheKey)) {
    demoHistoryCache.set(cacheKey, generateDemoHistory(systemName, days, DEMO_BASE_TIMESTAMP));
  }
  return demoHistoryCache.get(cacheKey)!;
}

export function getDemoStatusData(): {items: StatusItem[]; incidents: StatusIncident[]; maintenance: ScheduledMaintenance[]} {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
  const threeDaysFromNow = new Date(Date.now() + 259200000).toISOString();
  const fourDaysFromNow = new Date(Date.now() + 345600000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 432000000).toISOString();
  const fourDaysAgo = new Date(Date.now() - 345600000).toISOString();

  const items: StatusItem[] = [
    {
      name: 'Main Website',
      status: 'up',
      uptime: '99.98%',
      responseTime: 145,
      lastChecked: now,
      history: getCachedDemoHistory('Main Website', 90),
    },
    {
      name: 'API Service',
      status: 'up',
      uptime: '99.95%',
      responseTime: 89,
      lastChecked: now,
      history: getCachedDemoHistory('API Service', 90),
    },
    {
      name: 'Documentation',
      status: 'up',
      uptime: '100%',
      responseTime: 123,
      lastChecked: now,
      history: getCachedDemoHistory('Documentation', 90),
    },
    {
      name: 'Build & CI/CD',
      status: 'degraded',
      uptime: '98.2%',
      responseTime: 456,
      lastChecked: now,
      history: getCachedDemoHistory('Build & CI/CD', 90),
    },
    {
      name: 'CDN',
      status: 'up',
      uptime: '99.99%',
      responseTime: 34,
      lastChecked: now,
      history: getCachedDemoHistory('CDN', 90),
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
      commentCount: 5,
      resolutionTimeMinutes: 47,
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
      commentCount: 2,
      resolutionTimeMinutes: 15,
    },
  ];

  const maintenance: ScheduledMaintenance[] = [
    {
      id: 101,
      title: 'Database Migration and Index Optimization',
      start: threeDaysFromNow.split('T')[0] + 'T02:00:00Z',
      end: threeDaysFromNow.split('T')[0] + 'T04:00:00Z',
      status: 'upcoming',
      affectedSystems: ['API Service', 'Main Website'],
      description: 'We will be performing a database migration to improve query performance and optimize indexes. The API and main website will be in read-only mode during this window.',
      comments: [
        {
          author: 'devops-bot',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          body: 'Maintenance window confirmed. All stakeholders notified.',
        },
        {
          author: 'sre-team',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          body: 'Rollback plan documented and tested in staging environment.',
        },
      ],
      url: 'https://github.com/example/repo/issues/101',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: 102,
      title: 'SSL Certificate Renewal',
      start: fourDaysFromNow.split('T')[0] + 'T22:00:00Z',
      end: fourDaysFromNow.split('T')[0] + 'T22:30:00Z',
      status: 'upcoming',
      affectedSystems: ['CDN', 'Main Website', 'API Service'],
      description: 'Annual SSL certificate renewal. Brief interruption expected during certificate rotation.',
      comments: [],
      url: 'https://github.com/example/repo/issues/102',
      createdAt: new Date(Date.now() - 604800000).toISOString(),
    },
    {
      id: 103,
      title: 'Build Server Upgrade',
      start: fiveDaysAgo.split('T')[0] + 'T01:00:00Z',
      end: fourDaysAgo.split('T')[0] + 'T03:00:00Z',
      status: 'completed',
      affectedSystems: ['Build & CI/CD'],
      description: 'Upgrade build servers to latest LTS version with performance improvements.',
      comments: [
        {
          author: 'ci-admin',
          timestamp: fiveDaysAgo,
          body: 'Starting maintenance as scheduled.',
        },
        {
          author: 'ci-admin',
          timestamp: new Date(Date.now() - 400000000).toISOString(),
          body: 'All build agents upgraded successfully. Running smoke tests.',
        },
        {
          author: 'ci-admin',
          timestamp: fourDaysAgo,
          body: 'Maintenance completed. Build times improved by 25% on average.',
        },
      ],
      url: 'https://github.com/example/repo/issues/103',
      createdAt: new Date(Date.now() - 864000000).toISOString(),
    },
  ];

  return {items, incidents, maintenance};
}

/**
 * Get demo system status files with historical data
 */
export function getDemoSystemFiles(): SystemStatusFile[] {
  const systemNames = [
    'Main Website',
    'API Service',
    'Documentation',
    'Build & CI/CD',
    'CDN',
  ];

  return systemNames.map(name => {
    const history = getCachedDemoHistory(name, 90);
    const currentStatus = history.length > 0 
      ? history[history.length - 1].status 
      : 'up';
    
    // Calculate time-window averages
    const last24h = history.filter(h => 
      new Date(h.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
    );
    const last7d = history.filter(h => 
      new Date(h.timestamp).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    const last30d = history.filter(h => 
      new Date(h.timestamp).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    
    const avgTime = (checks: typeof history) => 
      checks.length > 0
        ? Math.round(checks.reduce((sum, c) => sum + c.responseTime, 0) / checks.length)
        : 0;
    
    const uptimeCalc = (checks: typeof history) => {
      const upChecks = checks.filter(c => c.status === 'up' || c.status === 'maintenance').length;
      return checks.length > 0 ? ((upChecks / checks.length) * 100).toFixed(2) + '%' : '100%';
    };

    return {
      name,
      url: `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
      lastChecked: new Date().toISOString(),
      currentStatus,
      history,
      timeDay: avgTime(last24h),
      timeWeek: avgTime(last7d),
      timeMonth: avgTime(last30d),
      uptimeDay: uptimeCalc(last24h),
      uptimeWeek: uptimeCalc(last7d),
      uptimeMonth: uptimeCalc(last30d),
      uptime: uptimeCalc(history),
      sloTarget: 99.9, // Default SLO target for demo data
    };
  });
}

/**
 * Generate demo data in current.json format (compact readings)
 * This matches the format used by the monitoring script
 */
export function getDemoCurrentJson(): {
  version: string;
  generated: number;
  readings: Array<{
    t: number;
    svc: string;
    state: 'up' | 'down' | 'degraded' | 'maintenance';
    code: number;
    lat: number;
    err?: string;
  }>;
} {
  const systemFiles = getDemoSystemFiles();
  const readings: Array<{
    t: number;
    svc: string;
    state: 'up' | 'down' | 'degraded' | 'maintenance';
    code: number;
    lat: number;
    err?: string;
  }> = [];

  // Convert each system's history to compact readings
  // Only keep last 14 days (matching the hot file window)
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  
  for (const systemFile of systemFiles) {
    const recentHistory = systemFile.history.filter(
      h => new Date(h.timestamp).getTime() > fourteenDaysAgo
    );
    
    for (const check of recentHistory) {
      readings.push({
        t: new Date(check.timestamp).getTime(),
        svc: systemFile.name,
        state: check.status,
        code: check.code,
        lat: check.responseTime,
      });
    }
  }

  // Sort by timestamp ascending (oldest first)
  readings.sort((a, b) => a.t - b.t);

  return {
    version: '1.0',
    generated: Date.now(),
    readings,
  };
}
