/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StatusCheckHistory, SystemStatusFile } from './types';

/**
 * Reading from new data format (Issue #19):
 * - current.json: Rolling 14-day window with compact format
 * - archives/YYYY/MM/history-YYYY-MM-DD.jsonl: Daily JSONL files
 * 
 * Reading format:
 * {
 *   t: timestamp (ms since epoch)
 *   svc: service name
 *   state: 'up' | 'down' | 'degraded'
 *   code: HTTP status code
 *   lat: latency in ms
 *   err?: error message (optional)
 * }
 */

interface CompactReading {
  t: number;
  svc: string;
  state: 'up' | 'down' | 'degraded' | 'maintenance';
  code: number;
  lat: number;
  err?: string;
}

/**
 * Load historical status data from current.json (rolling 14-day window)
 */
export async function loadHistoricalData(
  systemName: string,
  dataPath: string = 'status-data'
): Promise<StatusCheckHistory[]> {
  try {
    // In browser environment, fetch from built data
    if (typeof window !== 'undefined') {
      // Try new format first (current.json)
      try {
        const response = await fetch(`/${dataPath}/current.json`);
        if (response.ok) {
          const readings: CompactReading[] = await response.json();
          
          // Filter by system name and convert to legacy format
          return readings
            .filter(r => r.svc === systemName)
            .map(r => ({
              timestamp: new Date(r.t).toISOString(),
              status: r.state,
              code: r.code,
              responseTime: r.lat,
            }));
        }
      } catch (error) {
        console.warn(`New format (current.json) not available, trying legacy format...`);
      }
      
      // Fall back to legacy format (systems/*.json)
      try {
        const response = await fetch(`/${dataPath}/systems/${systemName}.json`);
        if (response.ok) {
          const data: SystemStatusFile = await response.json();
          return data.history || [];
        }
      } catch (error) {
        console.warn(`Legacy format also failed for ${systemName}`);
      }
      
      console.warn(`Failed to load historical data for ${systemName}`);
      return [];
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
 * Simple seeded random number generator
 * Based on mulberry32 PRNG for deterministic output
 */
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate sample historical data for demo purposes
 * Uses system name as seed for consistent data across builds
 * 
 * @param systemName - Name of the system (used as seed)
 * @param days - Number of days of history to generate
 * @param baseTimestamp - Optional base timestamp (for consistency across calls)
 */
export function generateDemoHistory(
  systemName: string,
  days: number = 30,
  baseTimestamp?: number
): StatusCheckHistory[] {
  const history: StatusCheckHistory[] = [];
  // Use provided timestamp or round current time to nearest hour for consistency
  const now = baseTimestamp || (Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000));
  const checksPerDay = 288; // Every 5 minutes
  
  // Create deterministic seed from system name
  let seed = 0;
  for (let i = 0; i < systemName.length; i++) {
    seed = ((seed << 5) - seed) + systemName.charCodeAt(i);
    seed |= 0; // Convert to 32-bit integer
  }
  
  const random = seededRandom(seed);
  
  // System-specific reliability profiles
  const reliability = systemName.includes('CDN') ? 0.9995 : // 99.95%
                     systemName.includes('Documentation') ? 0.999 : // 99.9%
                     systemName.includes('Build') ? 0.982 : // 98.2% (degraded)
                     systemName.includes('API') ? 0.9995 : // 99.95%
                     0.9998; // 99.98% for Main Website
  
  // Simulate outage periods for more realistic patterns
  const outages: Array<{start: number; duration: number}> = [];
  
  // Generate 2-4 outage periods for systems with lower reliability
  if (reliability < 0.999) {
    const outageCount = 2 + Math.floor(random() * 3); // 2-4 outages
    for (let i = 0; i < outageCount; i++) {
      const dayOffset = Math.floor(random() * days);
      const duration = 30 + Math.floor(random() * 120); // 30-150 minutes
      outages.push({
        start: dayOffset * 24 * 60 + Math.floor(random() * 24 * 60),
        duration
      });
    }
  }
  
  for (let d = days - 1; d >= 0; d--) {
    for (let c = 0; c < checksPerDay; c++) {
      const timestamp = new Date(now - (d * 24 * 60 * 60 * 1000) - (c * 5 * 60 * 1000));
      const minuteOffset = (days - 1 - d) * 24 * 60 + c * 5;
      
      // Check if this time is during an outage
      const inOutage = outages.some(outage => 
        minuteOffset >= outage.start && 
        minuteOffset < outage.start + outage.duration
      );
      
      let status: 'up' | 'down' | 'degraded' | 'maintenance';
      let code: number;
      let responseTime: number;
      
      if (inOutage) {
        // During outage: higher chance of failures
        const r = random();
        if (r < 0.7) {
          // 70% of outage time is down
          status = 'down';
          code = [500, 502, 503, 504][Math.floor(random() * 4)];
          responseTime = Math.floor(2000 + random() * 3000);
        } else {
          // 30% is degraded
          status = 'degraded';
          code = 200;
          responseTime = Math.floor(500 + random() * 1000);
        }
      } else {
        // Outside outages: normal reliability pattern
        const r = random();
        if (r < reliability) {
          // Normal operation
          status = 'up';
          code = 200;
          responseTime = Math.floor(50 + random() * 150); // 50-200ms
        } else if (r < reliability + ((1 - reliability) * 0.3)) {
          // Occasional degradation (30% of failures)
          status = 'degraded';
          code = 200;
          responseTime = Math.floor(500 + random() * 1000);
        } else {
          // Occasional downtime (70% of failures)
          status = 'down';
          code = [500, 502, 503, 504][Math.floor(random() * 4)];
          responseTime = Math.floor(2000 + random() * 3000);
        }
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
