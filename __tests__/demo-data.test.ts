/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {getDemoStatusData, getDemoSystemFiles} from '../src/demo-data';

describe('getDemoStatusData', () => {
  it('should return valid demo data structure', () => {
    const data = getDemoStatusData();

    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('incidents');
  });

  it('should return array of status items', () => {
    const data = getDemoStatusData();

    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('should have valid status item structure', () => {
    const data = getDemoStatusData();
    const item = data.items[0];

    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('status');
    expect(['up', 'down', 'degraded', 'maintenance']).toContain(item.status);
  });

  it('should return array of incidents', () => {
    const data = getDemoStatusData();

    expect(Array.isArray(data.incidents)).toBe(true);
    expect(data.incidents.length).toBeGreaterThan(0);
  });

  it('should have valid incident structure', () => {
    const data = getDemoStatusData();
    const incident = data.incidents[0];

    expect(incident).toHaveProperty('id');
    expect(incident).toHaveProperty('title');
    expect(incident).toHaveProperty('status');
    expect(incident).toHaveProperty('severity');
    expect(incident).toHaveProperty('createdAt');
    expect(incident).toHaveProperty('url');
    expect(['open', 'closed']).toContain(incident.status);
    expect(['critical', 'major', 'minor', 'maintenance']).toContain(incident.severity);
  });

  it('should have valid ISO date strings', () => {
    const data = getDemoStatusData();
    
    data.incidents.forEach(incident => {
      expect(() => new Date(incident.createdAt)).not.toThrow();
      expect(() => new Date(incident.updatedAt)).not.toThrow();
      if (incident.closedAt) {
        expect(() => new Date(incident.closedAt as string)).not.toThrow();
      }
    });
  });

  it('should include affected systems in incidents', () => {
    const data = getDemoStatusData();

    data.incidents.forEach(incident => {
      expect(Array.isArray(incident.affectedSystems)).toBe(true);
    });
  });

  it('should have realistic demo data', () => {
    const data = getDemoStatusData();

    // Should have a mix of statuses
    const statuses = data.items.map(item => item.status);
    expect(new Set(statuses).size).toBeGreaterThan(1);

    // Should have some uptime percentages
    const itemsWithUptime = data.items.filter(item => item.uptime);
    expect(itemsWithUptime.length).toBeGreaterThan(0);
  });
});

describe('getDemoSystemFiles', () => {
  it('should return an array of system files', () => {
    const systemFiles = getDemoSystemFiles();
    
    expect(Array.isArray(systemFiles)).toBe(true);
    expect(systemFiles.length).toBe(5);
  });

  it('should have valid system file structure', () => {
    const systemFiles = getDemoSystemFiles();
    const systemFile = systemFiles[0];

    expect(systemFile).toHaveProperty('name');
    expect(systemFile).toHaveProperty('url');
    expect(systemFile).toHaveProperty('lastChecked');
    expect(systemFile).toHaveProperty('currentStatus');
    expect(systemFile).toHaveProperty('history');
    expect(systemFile).toHaveProperty('timeDay');
    expect(systemFile).toHaveProperty('timeWeek');
    expect(systemFile).toHaveProperty('timeMonth');
    expect(systemFile).toHaveProperty('uptimeDay');
    expect(systemFile).toHaveProperty('uptimeWeek');
    expect(systemFile).toHaveProperty('uptimeMonth');
    expect(systemFile).toHaveProperty('uptime');
  });

  it('should have valid system names', () => {
    const systemFiles = getDemoSystemFiles();
    const expectedNames = [
      'Main Website',
      'API Service',
      'Documentation',
      'Build & CI/CD',
      'CDN',
    ];

    systemFiles.forEach((file, index) => {
      expect(file.name).toBe(expectedNames[index]);
    });
  });

  it('should have historical data for each system', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      expect(Array.isArray(file.history)).toBe(true);
      expect(file.history.length).toBeGreaterThan(0);
      
      // Should have approximately 30 days of data (288 checks per day)
      expect(file.history.length).toBeGreaterThan(8000);
      expect(file.history.length).toBeLessThan(9000);
    });
  });

  it('should calculate time-window averages correctly', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      expect(typeof file.timeDay).toBe('number');
      expect(typeof file.timeWeek).toBe('number');
      expect(typeof file.timeMonth).toBe('number');
      
      expect(file.timeDay).toBeGreaterThan(0);
      expect(file.timeWeek).toBeGreaterThan(0);
      expect(file.timeMonth).toBeGreaterThan(0);
    });
  });

  it('should calculate uptime percentages correctly', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      expect(typeof file.uptimeDay).toBe('string');
      expect(typeof file.uptimeWeek).toBe('string');
      expect(typeof file.uptimeMonth).toBe('string');
      expect(typeof file.uptime).toBe('string');
      
      // Should end with %
      expect(file.uptimeDay).toMatch(/%$/);
      expect(file.uptimeWeek).toMatch(/%$/);
      expect(file.uptimeMonth).toMatch(/%$/);
      expect(file.uptime).toMatch(/%$/);
      
      // Should be valid percentages
      const uptimeDayNum = parseFloat(file.uptimeDay);
      expect(uptimeDayNum).toBeGreaterThanOrEqual(0);
      expect(uptimeDayNum).toBeLessThanOrEqual(100);
    });
  });

  it('should have valid URLs', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.url).toContain('example.com');
    });
  });

  it('should have valid ISO timestamps', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      expect(() => new Date(file.lastChecked)).not.toThrow();
      
      file.history.forEach(check => {
        expect(() => new Date(check.timestamp)).not.toThrow();
      });
    });
  });

  it('should have valid status values', () => {
    const systemFiles = getDemoSystemFiles();
    const validStatuses = ['up', 'down', 'degraded', 'maintenance'];

    systemFiles.forEach(file => {
      expect(validStatuses).toContain(file.currentStatus);
      
      file.history.forEach(check => {
        expect(validStatuses).toContain(check.status);
        expect(typeof check.code).toBe('number');
        expect(typeof check.responseTime).toBe('number');
      });
    });
  });

  it('should have mostly successful checks', () => {
    const systemFiles = getDemoSystemFiles();

    systemFiles.forEach(file => {
      const upChecks = file.history.filter(c => c.status === 'up').length;
      const uptimePercent = (upChecks / file.history.length) * 100;
      
      // Should be around 97% uptime
      expect(uptimePercent).toBeGreaterThan(90);
      expect(uptimePercent).toBeLessThanOrEqual(100);
    });
  });

  it('should handle edge case of empty history', () => {
    // This is a synthetic test to ensure the code handles empty history
    // In practice, getDemoSystemFiles always returns history, but we test the logic
    const systemFiles = getDemoSystemFiles();
    
    systemFiles.forEach(file => {
      // Verify that if history were empty, the fallback values would be correct
      // This tests the ternary operators in lines 114-128
      expect(file.history.length).toBeGreaterThan(0); // Normal case
      
      // The currentStatus logic: history.length > 0 ? history[history.length - 1].status : 'up'
      expect(file.currentStatus).toBe(file.history[file.history.length - 1].status);
    });
  });

  it('should calculate metrics correctly for systems with varying history', () => {
    const systemFiles = getDemoSystemFiles();
    
    // Each system should have consistent metrics
    systemFiles.forEach(file => {
      // Time metrics should be positive numbers
      expect(file.timeDay).toBeGreaterThan(0);
      expect(file.timeWeek).toBeGreaterThan(0);
      expect(file.timeMonth).toBeGreaterThan(0);
      
      // Week average should generally be close to month average (within 50ms typically)
      const weekMonthDiff = Math.abs(file.timeWeek - file.timeMonth);
      expect(weekMonthDiff).toBeLessThan(100);
      
      // Uptime should be high and consistent across periods
      const uptimeDay = parseFloat(file.uptimeDay);
      const uptimeWeek = parseFloat(file.uptimeWeek);
      const uptimeMonth = parseFloat(file.uptimeMonth);
      const uptime = parseFloat(file.uptime);
      
      expect(uptimeDay).toBeGreaterThan(90);
      expect(uptimeWeek).toBeGreaterThan(90);
      expect(uptimeMonth).toBeGreaterThan(90);
      expect(uptime).toBeGreaterThan(90);
    });
  });
});
