/**
 * Tests for human-friendly date parsing in maintenance utilities
 */

import { parseHumanDate, extractFrontmatter } from '../src/maintenance-utils';

describe('parseHumanDate', () => {
  it('should preserve ISO 8601 dates unchanged', () => {
    const isoDate = '2025-11-15T02:00:00Z';
    expect(parseHumanDate(isoDate)).toBe(isoDate);
  });

  it('should parse @tomorrow notation', () => {
    const result = parseHumanDate('@tomorrow 2pm');
    expect(result).toBeTruthy();
    expect(result?.endsWith('Z')).toBe(true); // Should be ISO format
  });

  it('should parse tomorrow without @ prefix', () => {
    const result = parseHumanDate('tomorrow at 2pm');
    expect(result).toBeTruthy();
    expect(result?.endsWith('Z')).toBe(true);
  });

  it('should parse @today notation', () => {
    const result = parseHumanDate('@today 14:30');
    expect(result).toBeTruthy();
    expect(result?.endsWith('Z')).toBe(true);
  });

  it('should parse relative times like +2h', () => {
    const now = new Date('2025-11-15T12:00:00Z');
    const result = parseHumanDate('in 2 hours', now);
    expect(result).toBeTruthy();
    
    // Should be approximately 2 hours from reference time
    const parsed = new Date(result!);
    const expected = new Date('2025-11-15T14:00:00Z');
    const diffMinutes = Math.abs((parsed.getTime() - expected.getTime()) / 1000 / 60);
    expect(diffMinutes).toBeLessThan(5); // Within 5 minutes tolerance
  });

  it('should return null for invalid dates', () => {
    expect(parseHumanDate('not a date')).toBeNull();
    expect(parseHumanDate('')).toBeNull();
  });

  it('should handle timezone offsets in ISO dates', () => {
    const isoWithOffset = '2025-11-15T14:30:00-05:00';
    expect(parseHumanDate(isoWithOffset)).toBe(isoWithOffset);
  });
});

describe('extractFrontmatter with human dates', () => {
  it('should parse human-friendly dates in frontmatter', () => {
    const body = `---
start: @tomorrow 2am UTC
end: @tomorrow 4am UTC
---

## Description
Maintenance work`;

    const { frontmatter } = extractFrontmatter(body);
    
    expect(frontmatter.start).toBeTruthy();
    expect(frontmatter.end).toBeTruthy();
    // Should be converted to ISO format
    expect(frontmatter.start?.endsWith('Z')).toBe(true);
    expect(frontmatter.end?.endsWith('Z')).toBe(true);
  });

  it('should skip GitHub H3 headings before frontmatter', () => {
    const body = `### Maintenance Details

---
start: 2025-11-15T02:00:00Z
end: 2025-11-15T04:00:00Z
---

## Description
Maintenance work`;

    const { frontmatter, content } = extractFrontmatter(body);
    
    expect(frontmatter.start).toBe('2025-11-15T02:00:00Z');
    expect(frontmatter.end).toBe('2025-11-15T04:00:00Z');
    expect(content).toContain('## Description');
  });

  it('should handle multiple H3 headings', () => {
    const body = `### Maintenance Details
### Another Heading

---
start: tomorrow 9am
end: tomorrow 5pm
---

Work description`;

    const { frontmatter } = extractFrontmatter(body);
    
    expect(frontmatter.start).toBeTruthy();
    expect(frontmatter.end).toBeTruthy();
  });

  it('should preserve traditional ISO dates', () => {
    const body = `---
start: 2025-11-15T02:00:00Z
end: 2025-11-15T04:00:00Z
---

Description`;

    const { frontmatter } = extractFrontmatter(body);
    
    expect(frontmatter.start).toBe('2025-11-15T02:00:00Z');
    expect(frontmatter.end).toBe('2025-11-15T04:00:00Z');
  });
});
