/**
 * Tests for time utility functions
 */

import {
  calculateResolutionTime,
  formatDuration,
  formatResolutionInfo,
} from '../src/time-utils';

describe('time-utils', () => {
  describe('calculateResolutionTime', () => {
    it('should calculate resolution time in minutes', () => {
      const created = '2025-11-04T10:00:00Z';
      const closed = '2025-11-04T10:47:00Z';
      
      const result = calculateResolutionTime(created, closed);
      
      expect(result).toBe(47);
    });

    it('should return undefined if closedAt is undefined', () => {
      const created = '2025-11-04T10:00:00Z';
      
      const result = calculateResolutionTime(created, undefined);
      
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid dates', () => {
      const result = calculateResolutionTime('invalid', '2025-11-04T10:00:00Z');
      
      expect(result).toBeUndefined();
    });

    it('should handle multi-day incidents', () => {
      const created = '2025-11-03T10:00:00Z';
      const closed = '2025-11-05T14:30:00Z';
      
      const result = calculateResolutionTime(created, closed);
      
      expect(result).toBe(2 * 24 * 60 + 4 * 60 + 30); // 2 days 4.5 hours = 3150 minutes
    });

    it('should handle incidents resolved in less than a minute', () => {
      const created = '2025-11-04T10:00:00Z';
      const closed = '2025-11-04T10:00:30Z';
      
      const result = calculateResolutionTime(created, closed);
      
      expect(result).toBe(1); // Rounds to 1 minute
    });
  });

  describe('formatDuration', () => {
    it('should format minutes correctly (singular)', () => {
      expect(formatDuration(1)).toBe('1 minute');
    });

    it('should format minutes correctly (plural)', () => {
      expect(formatDuration(45)).toBe('45 minutes');
    });

    it('should format less than a minute', () => {
      expect(formatDuration(0.5)).toBe('less than a minute');
    });

    it('should format hours without minutes', () => {
      expect(formatDuration(120)).toBe('2 hours');
    });

    it('should format singular hour', () => {
      expect(formatDuration(60)).toBe('1 hour');
    });

    it('should format hours with minutes', () => {
      expect(formatDuration(90)).toBe('1 hour 30 minutes');
    });

    it('should format multiple hours with minutes', () => {
      expect(formatDuration(150)).toBe('2 hours 30 minutes');
    });

    it('should format days without hours', () => {
      expect(formatDuration(1440)).toBe('1 day');
    });

    it('should format multiple days without hours', () => {
      expect(formatDuration(2880)).toBe('2 days');
    });

    it('should format days with hours', () => {
      expect(formatDuration(1500)).toBe('1 day 1 hour');
    });

    it('should format multiple days with hours', () => {
      expect(formatDuration(3000)).toBe('2 days 2 hours');
    });

    it('should round minutes properly', () => {
      expect(formatDuration(2 * 60 + 45)).toBe('2 hours 45 minutes');
    });
  });

  describe('formatResolutionInfo', () => {
    it('should format resolution time and comment count', () => {
      const result = formatResolutionInfo(47, 5);
      
      expect(result).toBe('Resolved in 47 minutes with 5 posts');
    });

    it('should handle singular post', () => {
      const result = formatResolutionInfo(30, 1);
      
      expect(result).toBe('Resolved in 30 minutes with 1 post');
    });

    it('should handle resolution time only', () => {
      const result = formatResolutionInfo(120, undefined);
      
      expect(result).toBe('Resolved in 2 hours');
    });

    it('should handle comment count only', () => {
      const result = formatResolutionInfo(undefined, 3);
      
      expect(result).toBe('with 3 posts');
    });

    it('should handle zero comments (no comment display)', () => {
      const result = formatResolutionInfo(60, 0);
      
      expect(result).toBe('Resolved in 1 hour');
    });

    it('should return undefined when both values are undefined', () => {
      const result = formatResolutionInfo(undefined, undefined);
      
      expect(result).toBeUndefined();
    });

    it('should format long duration incidents', () => {
      const result = formatResolutionInfo(2 * 24 * 60 + 3 * 60, 10);
      
      expect(result).toBe('Resolved in 2 days 3 hours with 10 posts');
    });
  });
});
