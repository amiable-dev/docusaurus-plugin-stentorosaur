/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {getDemoStatusData} from '../src/demo-data';

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
