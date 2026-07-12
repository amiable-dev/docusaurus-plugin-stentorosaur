/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment jsdom
 */

import {
  escapeCSVValue,
  convertToCSV,
  downloadFile,
  formatDateForFilename,
  sanitizeFilename,
} from '../src/utils/csv';

describe('CSV Utilities', () => {
  describe('escapeCSVValue', () => {
    it('should return value as-is if no special characters', () => {
      expect(escapeCSVValue('simple')).toBe('simple');
      expect(escapeCSVValue('123')).toBe('123');
      expect(escapeCSVValue('no-special-chars')).toBe('no-special-chars');
    });

    it('should wrap value in quotes if it contains comma', () => {
      expect(escapeCSVValue('hello, world')).toBe('"hello, world"');
      expect(escapeCSVValue('a,b,c')).toBe('"a,b,c"');
    });

    it('should wrap value in quotes if it contains newline', () => {
      expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
      expect(escapeCSVValue('multi\nline\ntext')).toBe('"multi\nline\ntext"');
    });

    it('should wrap value in quotes and double internal quotes', () => {
      expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""');
      expect(escapeCSVValue('"quoted"')).toBe('"""quoted"""');
    });

    it('should handle combination of special characters', () => {
      expect(escapeCSVValue('hello, "world"\nnew line')).toBe('"hello, ""world""\nnew line"');
    });

    it('should handle empty string', () => {
      expect(escapeCSVValue('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(escapeCSVValue(null)).toBe('');
      expect(escapeCSVValue(undefined)).toBe('');
    });

    it('should convert numbers to strings', () => {
      expect(escapeCSVValue(123)).toBe('123');
      expect(escapeCSVValue(45.67)).toBe('45.67');
    });

    it('should convert booleans to strings', () => {
      expect(escapeCSVValue(true)).toBe('true');
      expect(escapeCSVValue(false)).toBe('false');
    });
  });

  describe('convertToCSV', () => {
    it('should convert simple array of objects to CSV', () => {
      const data = [
        { name: 'Alice', age: 30, city: 'NYC' },
        { name: 'Bob', age: 25, city: 'LA' },
      ];
      const result = convertToCSV(data);
      expect(result).toBe('name,age,city\nAlice,30,NYC\nBob,25,LA');
    });

    it('should use specified columns in order', () => {
      const data = [
        { name: 'Alice', age: 30, city: 'NYC' },
        { name: 'Bob', age: 25, city: 'LA' },
      ];
      const result = convertToCSV(data, ['age', 'name']);
      expect(result).toBe('age,name\n30,Alice\n25,Bob');
    });

    it('should handle missing columns with empty values', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', city: 'LA' },
      ];
      const result = convertToCSV(data, ['name', 'age', 'city']);
      expect(result).toBe('name,age,city\nAlice,30,\nBob,,LA');
    });

    it('should escape values with special characters', () => {
      const data = [
        { name: 'Alice, Jr.', description: 'Says "hello"' },
        { name: 'Bob\nSmith', description: 'Multi\nline' },
      ];
      const result = convertToCSV(data);
      expect(result).toBe('name,description\n"Alice, Jr.","Says ""hello"""\n"Bob\nSmith","Multi\nline"');
    });

    it('should handle empty array', () => {
      const result = convertToCSV([]);
      expect(result).toBe('');
    });

    it('should handle array with empty objects', () => {
      const data = [{}, {}];
      const result = convertToCSV(data);
      expect(result).toBe('');
    });

    it('should handle objects with nested properties by stringifying', () => {
      const data = [
        { name: 'Alice', metadata: { role: 'admin' } },
      ];
      const result = convertToCSV(data);
      expect(result).toContain('name,metadata');
      expect(result).toContain('Alice');
    });

    it('should infer columns from first object if not specified', () => {
      const data = [
        { a: 1, b: 2, c: 3 },
        { a: 4, b: 5, c: 6 },
      ];
      const result = convertToCSV(data);
      expect(result).toBe('a,b,c\n1,2,3\n4,5,6');
    });

    it('should handle single row', () => {
      const data = [{ name: 'Alice', age: 30 }];
      const result = convertToCSV(data);
      expect(result).toBe('name,age\nAlice,30');
    });
  });

  describe('downloadFile', () => {
    let createElementSpy: jest.SpyInstance;
    let appendChildSpy: jest.SpyInstance;
    let removeChildSpy: jest.SpyInstance;
    let createObjectURLSpy: jest.SpyInstance;
    let revokeObjectURLSpy: jest.SpyInstance;
    let clickSpy: jest.Mock;
    let mockAnchor: any;

    beforeEach(() => {
      clickSpy = jest.fn();
      mockAnchor = {
        href: '',
        download: '',
        click: clickSpy,
        style: {},
      };

      createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
      removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor);
      
      // Mock URL.createObjectURL and URL.revokeObjectURL
      createObjectURLSpy = jest.fn().mockReturnValue('blob:mock-url');
      revokeObjectURLSpy = jest.fn();
      global.URL.createObjectURL = createObjectURLSpy;
      global.URL.revokeObjectURL = revokeObjectURLSpy;
    });

    afterEach(() => {
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should create blob and trigger download', () => {
      downloadFile('test content', 'test.txt', 'text/plain');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should set correct filename and mime type', () => {
      downloadFile('csv data', 'data.csv', 'text/csv');
      
      const blob = (createObjectURLSpy.mock.calls[0][0] as Blob);
      expect(blob.type).toBe('text/csv');
      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it('should handle empty content', () => {
      downloadFile('', 'empty.txt', 'text/plain');
      
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('formatDateForFilename', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2024-03-15T10:30:00Z');
      expect(formatDateForFilename(date)).toBe('2024-03-15');
    });

    it('should handle single digit months and days', () => {
      const date = new Date('2024-01-05T10:30:00Z');
      expect(formatDateForFilename(date)).toBe('2024-01-05');
    });

    it('should handle end of year', () => {
      const date = new Date('2024-12-31T23:59:59Z');
      expect(formatDateForFilename(date)).toBe('2024-12-31');
    });

    it('should handle beginning of year', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      expect(formatDateForFilename(date)).toBe('2024-01-01');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid filename characters', () => {
      expect(sanitizeFilename('file/name')).toBe('file_name');
      expect(sanitizeFilename('file\\name')).toBe('file_name');
      expect(sanitizeFilename('file:name')).toBe('file_name');
      expect(sanitizeFilename('file*name')).toBe('file_name');
      expect(sanitizeFilename('file?name')).toBe('file_name');
      expect(sanitizeFilename('file"name')).toBe('file_name');
      expect(sanitizeFilename('file<name>')).toBe('file_name_');
      expect(sanitizeFilename('file|name')).toBe('file_name');
    });

    it('should keep valid characters', () => {
      expect(sanitizeFilename('valid-filename_123.csv')).toBe('valid-filename_123.csv');
      expect(sanitizeFilename('my file.txt')).toBe('my file.txt');
    });

    it('should handle empty string', () => {
      expect(sanitizeFilename('')).toBe('');
    });

    it('should handle string with only invalid characters', () => {
      expect(sanitizeFilename('///:***')).toBe('_______');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeFilename('file-名前.txt')).toBe('file-名前.txt');
    });
  });
});
