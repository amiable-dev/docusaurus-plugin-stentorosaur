/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {StatusItem, StatusIncident, SystemStatusFile, StatusCheckHistory} from './types';
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
