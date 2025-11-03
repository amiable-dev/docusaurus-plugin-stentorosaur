/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { 
  generateDemoHistory, 
  calculateAverageResponseTime, 
  calculateUptimePercentage, 
  calculateDailyStats,
  loadHistoricalData,
  aggregateHistoricalData
} from '../src/historical-data';

describe('historical-data utilities', () => {
  describe('generateDemoHistory', () => {
    it('should generate history for specified number of days', () => {
      const history = generateDemoHistory('Test System', 7);
      expect(history.length).toBeGreaterThan(0);
      
      // Should have roughly 288 checks per day (every 5 minutes)
      const expectedChecks = 7 * 288;
      expect(history.length).toBeCloseTo(expectedChecks, -2); // Within 100 checks
    });

    it('should generate checks with valid status values', () => {
      const history = generateDemoHistory('Test System', 1);
      
      history.forEach(check => {
        expect(['up', 'down', 'degraded', 'maintenance']).toContain(check.status);
        expect(check.code).toBeGreaterThan(0);
        expect(check.responseTime).toBeGreaterThan(0);
        expect(check.timestamp).toBeTruthy();
      });
    });

    it('should generate mostly successful checks', () => {
      const history = generateDemoHistory('Test System', 30);
      const upChecks = history.filter(c => c.status === 'up').length;
      const uptimePercent = (upChecks / history.length) * 100;
      
      // Should be around 97% uptime
      expect(uptimePercent).toBeGreaterThan(90);
      expect(uptimePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateAverageResponseTime', () => {
    it('should calculate average response time correctly', () => {
      const history = [
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 200 },
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 300 },
      ];
      
      const avg = calculateAverageResponseTime(history);
      expect(avg).toBe(200);
    });

    it('should return 0 for empty history', () => {
      const avg = calculateAverageResponseTime([]);
      expect(avg).toBe(0);
    });

    it('should filter by period hours', () => {
      const now = Date.now();
      const history = [
        { timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date(now - 25 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 500 },
      ];
      
      const avg24h = calculateAverageResponseTime(history, 24);
      expect(avg24h).toBe(100); // Should only include first check
    });
  });

  describe('calculateUptimePercentage', () => {
    it('should calculate uptime percentage correctly', () => {
      const history = [
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date().toISOString(), status: 'down' as const, code: 500, responseTime: 1000 },
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
      ];
      
      const uptime = calculateUptimePercentage(history);
      expect(uptime).toBe(75); // 3 out of 4
    });

    it('should treat maintenance as uptime', () => {
      const history = [
        { timestamp: new Date().toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date().toISOString(), status: 'maintenance' as const, code: 200, responseTime: 100 },
      ];
      
      const uptime = calculateUptimePercentage(history);
      expect(uptime).toBe(100);
    });

    it('should return 100 for empty history', () => {
      const uptime = calculateUptimePercentage([]);
      expect(uptime).toBe(100);
    });
  });

  describe('calculateDailyStats', () => {
    it('should calculate daily statistics correctly', () => {
      const now = Date.now();
      const history = [
        { timestamp: new Date(now).toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date(now).toISOString(), status: 'up' as const, code: 200, responseTime: 200 },
        { timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(), status: 'down' as const, code: 500, responseTime: 1000 },
      ];
      
      const stats = calculateDailyStats(history, 2);
      expect(stats).toHaveLength(2);
      
      // Today should have 2 checks, both up
      const today = stats[1];
      expect(today.checks).toBe(2);
      expect(today.upChecks).toBe(2);
      expect(today.uptime).toBe(100);
      expect(today.avgResponseTime).toBe(150); // (100 + 200) / 2
      
      // Yesterday should have 1 check, down
      const yesterday = stats[0];
      expect(yesterday.checks).toBe(1);
      expect(yesterday.upChecks).toBe(0);
      expect(yesterday.uptime).toBe(0);
    });

    it('should initialize all days even with no data', () => {
      const stats = calculateDailyStats([], 7);
      expect(stats).toHaveLength(7);
      
      stats.forEach(day => {
        expect(day.checks).toBe(0);
        expect(day.upChecks).toBe(0);
        expect(day.uptime).toBe(100); // Default to 100% if no checks
        expect(day.avgResponseTime).toBe(0);
      });
    });
  });

  describe('loadHistoricalData', () => {
    it('should return empty array in Node environment', async () => {
      // Node environment (no window object)
      const data = await loadHistoricalData('test-system');
      expect(data).toEqual([]);
    });

    it('should handle browser environment with successful fetch', async () => {
      // Save original window and fetch
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      
      // Create a proper mock for window with fetch
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'Test System',
          history: [
            { timestamp: new Date().toISOString(), status: 'up', code: 200, responseTime: 100 }
          ]
        })
      });
      
      // @ts-ignore - Setting up test environment
      global.window = {} as any;
      global.fetch = mockFetch;

      const data = await loadHistoricalData('test-system');
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe('up');
      expect(mockFetch).toHaveBeenCalledWith('/status-data/systems/test-system.json');

      // Restore original values
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
      global.fetch = originalFetch;
    });

    it('should handle browser environment with failed fetch', async () => {
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });
      
      // @ts-ignore - Setting up test environment
      global.window = {} as any;
      global.fetch = mockFetch;

      const data = await loadHistoricalData('missing-system');
      expect(data).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Failed to load historical data for missing-system');

      // Restore
      consoleWarnSpy.mockRestore();
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
      global.fetch = originalFetch;
    });

    it('should handle browser environment with fetch error', async () => {
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // @ts-ignore - Setting up test environment
      global.window = {} as any;
      global.fetch = mockFetch;

      const data = await loadHistoricalData('error-system');
      expect(data).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore
      consoleWarnSpy.mockRestore();
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
      global.fetch = originalFetch;
    });
  });

  describe('aggregateHistoricalData', () => {
    it('should filter history by time period', () => {
      const now = Date.now();
      const history = [
        { timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 200 },
        { timestamp: new Date(now - 25 * 60 * 60 * 1000).toISOString(), status: 'down' as const, code: 500, responseTime: 300 },
      ];

      const last24h = aggregateHistoricalData(history, 24);
      expect(last24h).toHaveLength(2); // Only first two
      expect(last24h[0].responseTime).toBe(200); // Should be sorted
      expect(last24h[1].responseTime).toBe(100);
    });

    it('should return empty array for empty history', () => {
      const result = aggregateHistoricalData([], 24);
      expect(result).toEqual([]);
    });

    it('should sort results by timestamp', () => {
      const now = Date.now();
      const history = [
        { timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 300 },
        { timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 100 },
        { timestamp: new Date(now - 10 * 60 * 60 * 1000).toISOString(), status: 'up' as const, code: 200, responseTime: 200 },
      ];

      const result = aggregateHistoricalData(history, 24);
      expect(result).toHaveLength(3);
      expect(result[0].responseTime).toBe(200); // Oldest first
      expect(result[1].responseTime).toBe(300);
      expect(result[2].responseTime).toBe(100); // Newest last
    });
  });
});
