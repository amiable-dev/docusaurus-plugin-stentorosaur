/**
 * Tests for maintenance utility functions
 */

import {
  extractFrontmatter,
  getMaintenanceStatus,
  parseMaintenanceComments,
  isScheduledMaintenance,
  formatDateInTimezone,
  formatShortDate,
} from '../src/maintenance-utils';

describe('maintenance-utils', () => {
  describe('extractFrontmatter', () => {
    it('should extract YAML frontmatter from issue body', () => {
      const body = `---
type: maintenance
start: 2025-11-10T02:00:00Z
end: 2025-11-10T04:00:00Z
systems:
  - database
  - api
---

## Maintenance Description
Database upgrade work`;

      const result = extractFrontmatter(body);

      expect(result.frontmatter.type).toBe('maintenance');
      expect(result.frontmatter.start).toBe('2025-11-10T02:00:00Z');
      expect(result.frontmatter.end).toBe('2025-11-10T04:00:00Z');
      expect(result.frontmatter.systems).toEqual(['database', 'api']);
      expect(result.content.trim()).toContain('## Maintenance Description');
    });

    it('should handle body without frontmatter', () => {
      const body = '## Just a regular issue\nNo frontmatter here';

      const result = extractFrontmatter(body);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(body);
    });

    it('should handle empty body', () => {
      const body = '';

      const result = extractFrontmatter(body);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('');
    });
  });

  describe('getMaintenanceStatus', () => {
    const mockNow = new Date('2025-11-10T03:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(mockNow);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return "upcoming" for future maintenance', () => {
      const start = '2025-11-11T02:00:00Z';
      const end = '2025-11-11T04:00:00Z';

      const status = getMaintenanceStatus(start, end, 'open');

      expect(status).toBe('upcoming');
    });

    it('should return "in-progress" during maintenance window', () => {
      const start = '2025-11-10T02:00:00Z';
      const end = '2025-11-10T04:00:00Z';

      const status = getMaintenanceStatus(start, end, 'open');

      expect(status).toBe('in-progress');
    });

    it('should return "completed" for past maintenance', () => {
      const start = '2025-11-09T02:00:00Z';
      const end = '2025-11-09T04:00:00Z';

      const status = getMaintenanceStatus(start, end, 'open');

      expect(status).toBe('completed');
    });

    it('should return "completed" when issue is closed', () => {
      const start = '2025-11-11T02:00:00Z';
      const end = '2025-11-11T04:00:00Z';

      const status = getMaintenanceStatus(start, end, 'closed');

      expect(status).toBe('completed');
    });
  });

  describe('parseMaintenanceComments', () => {
    it('should parse GitHub comments into maintenance comments', () => {
      const comments = [
        {
          author: { login: 'user1' },
          created_at: '2025-11-09T14:30:00Z',
          body: 'Maintenance window confirmed',
        },
        {
          author: { login: 'user2' },
          created_at: '2025-11-09T18:45:00Z',
          body: 'Added rollback procedure',
        },
      ];

      const result = parseMaintenanceComments(comments);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        author: 'user1',
        timestamp: '2025-11-09T14:30:00Z',
        body: 'Maintenance window confirmed',
      });
      expect(result[1]).toEqual({
        author: 'user2',
        timestamp: '2025-11-09T18:45:00Z',
        body: 'Added rollback procedure',
      });
    });

    it('should handle empty comments array', () => {
      const result = parseMaintenanceComments([]);

      expect(result).toEqual([]);
    });
  });

  describe('isScheduledMaintenance', () => {
    it('should return true if labels contain scheduled-maintenance', () => {
      const labels = ['status', 'scheduled-maintenance', 'database'];

      const result = isScheduledMaintenance(labels);

      expect(result).toBe(true);
    });

    it('should return false if labels do not contain scheduled-maintenance', () => {
      const labels = ['status', 'critical', 'database'];

      const result = isScheduledMaintenance(labels);

      expect(result).toBe(false);
    });

    it('should support custom maintenance labels', () => {
      const labels = ['status', 'planned-maintenance', 'database'];

      const result = isScheduledMaintenance(labels, ['planned-maintenance']);

      expect(result).toBe(true);
    });

    it('should handle empty labels array', () => {
      const result = isScheduledMaintenance([]);

      expect(result).toBe(false);
    });
  });

  describe('formatDateInTimezone', () => {
    const testDate = '2025-01-12T02:00:00Z';

    it('should format date in UTC by default', () => {
      const result = formatDateInTimezone(testDate);

      expect(result).toContain('2025-01-12');
      expect(result).toContain('UTC');
    });

    it('should format date in UTC when timezone is "UTC"', () => {
      const result = formatDateInTimezone(testDate, 'UTC');

      expect(result).toContain('2025-01-12');
      expect(result).toContain('UTC');
    });

    it('should format date in local timezone when timezone is "local"', () => {
      const result = formatDateInTimezone(testDate, 'local');

      // Should return a locale string
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format date in specified timezone', () => {
      const result = formatDateInTimezone(testDate, 'America/New_York');

      expect(result).toContain('America/New_York');
    });

    it('should fall back to UTC for invalid timezone', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = formatDateInTimezone(testDate, 'Invalid/Timezone');

      expect(result).toContain('UTC');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid timezone "Invalid/Timezone"')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('formatShortDate', () => {
    const testDate = '2025-01-12T14:30:00Z';

    it('should format date in short format', () => {
      const result = formatShortDate(testDate);

      expect(result).toMatch(/Jan \d{1,2}, 2025/);
    });

    it('should format date with timezone when specified', () => {
      const result = formatShortDate(testDate, 'America/Los_Angeles');

      // Should return a formatted date
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/Jan \d{1,2}, 2025/);
    });

    it('should handle local timezone', () => {
      const result = formatShortDate(testDate, 'local');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should fall back gracefully for invalid timezone', () => {
      const result = formatShortDate(testDate, 'Invalid/Timezone');

      // Should still return a formatted date
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });
});
