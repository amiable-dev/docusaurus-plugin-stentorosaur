/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StatusCheckHistory, SystemStatusFile } from './types';

/**
 * Load historical status data from a system status file
 */
export async function loadHistoricalData(
  systemName: string,
  dataPath: string = 'status-data'
): Promise<StatusCheckHistory[]> {
  try {
    // In browser environment, fetch from built data
    if (typeof window !== 'undefined') {
      const response = await fetch(`/${dataPath}/systems/${systemName}.json`);
      if (!response.ok) {
        console.warn(`Failed to load historical data for ${systemName}: ${response.statusText}`);
        return [];
      }
      const data: SystemStatusFile = await response.json();
      return data.history || [];
    }
    
    // In Node environment (build time), this would require fs
    // But we'll handle this at build time in the plugin
    return [];
  } catch (error) {
    console.warn(`Failed to load historical data for ${systemName}:`, error);
    return [];
  }
}

/**
 * Aggregate historical data by time period
 */
export function aggregateHistoricalData(
  history: StatusCheckHistory[],
  periodHours: number
): StatusCheckHistory[] {
  if (history.length === 0) return [];
  
  const now = new Date();
  const cutoff = new Date(now.getTime() - periodHours * 60 * 60 * 1000);
  
  return history
    .filter(check => new Date(check.timestamp) >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Calculate average response time for a time period
 */
export function calculateAverageResponseTime(
  history: StatusCheckHistory[],
  periodHours?: number
): number {
  let data = history;
  
  if (periodHours) {
    data = aggregateHistoricalData(history, periodHours);
  }
  
  if (data.length === 0) return 0;
  
  const sum = data.reduce((acc, check) => acc + check.responseTime, 0);
  return Math.round(sum / data.length);
}

/**
 * Calculate uptime percentage for a time period
 */
export function calculateUptimePercentage(
  history: StatusCheckHistory[],
  periodHours?: number
): number {
  let data = history;
  
  if (periodHours) {
    data = aggregateHistoricalData(history, periodHours);
  }
  
  if (data.length === 0) return 100;
  
  const upChecks = data.filter(
    check => check.status === 'up' || check.status === 'maintenance'
  ).length;
  
  return parseFloat(((upChecks / data.length) * 100).toFixed(2));
}

/**
 * Calculate daily uptime statistics
 */
export interface DailyUptimeStats {
  date: string;
  uptime: number;
  checks: number;
  upChecks: number;
  avgResponseTime: number;
}

export function calculateDailyStats(
  history: StatusCheckHistory[],
  days: number
): DailyUptimeStats[] {
  const now = new Date();
  const dailyData: Map<string, { checks: StatusCheckHistory[] }> = new Map();

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyData.set(dateStr, { checks: [] });
  }

  // Group checks by day
  history.forEach(check => {
    const checkDate = new Date(check.timestamp).toISOString().split('T')[0];
    const dayData = dailyData.get(checkDate);
    
    if (dayData) {
      dayData.checks.push(check);
    }
  });

  // Calculate stats for each day
  return Array.from(dailyData.entries()).map(([date, data]) => {
    const upChecks = data.checks.filter(
      check => check.status === 'up' || check.status === 'maintenance'
    ).length;
    
    const avgResponseTime = data.checks.length > 0
      ? Math.round(
          data.checks.reduce((sum, check) => sum + check.responseTime, 0) / data.checks.length
        )
      : 0;
    
    return {
      date,
      uptime: data.checks.length > 0 ? (upChecks / data.checks.length) * 100 : 100,
      checks: data.checks.length,
      upChecks,
      avgResponseTime,
    };
  });
}

/**
 * Generate sample historical data for demo purposes
 */
export function generateDemoHistory(
  systemName: string,
  days: number = 30
): StatusCheckHistory[] {
  const history: StatusCheckHistory[] = [];
  const now = Date.now();
  const checksPerDay = 288; // Every 5 minutes
  
  for (let d = days - 1; d >= 0; d--) {
    for (let c = 0; c < checksPerDay; c++) {
      const timestamp = new Date(now - (d * 24 * 60 * 60 * 1000) - (c * 5 * 60 * 1000));
      
      // Generate mostly successful checks with occasional issues
      const random = Math.random();
      let status: 'up' | 'down' | 'degraded' | 'maintenance';
      let code: number;
      let responseTime: number;
      
      if (random < 0.97) {
        // 97% uptime
        status = 'up';
        code = 200;
        responseTime = Math.floor(50 + Math.random() * 150); // 50-200ms
      } else if (random < 0.99) {
        // 2% degraded
        status = 'degraded';
        code = 200;
        responseTime = Math.floor(500 + Math.random() * 1000); // 500-1500ms
      } else {
        // 1% down
        status = 'down';
        code = [500, 502, 503, 504][Math.floor(Math.random() * 4)];
        responseTime = Math.floor(2000 + Math.random() * 3000); // 2000-5000ms
      }
      
      history.push({
        timestamp: timestamp.toISOString(),
        status,
        code,
        responseTime,
      });
    }
  }
  
  return history.reverse(); // Oldest first
}
