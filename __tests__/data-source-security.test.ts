/**
 * TDD Tests for ADR-001: Data Source Security & Validation
 *
 * These tests cover:
 * - Issue #43: Zod schema validation for fetched data
 * - Issue #44: Security validation (HTTPS, size limits, headers)
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import type { DataSource } from '../src/types';

// Import validator functions (will fail until implemented)
import {
  validateStatusData,
  validateDataSourceSecurity,
  StatusDataSchema,
  MAX_PAYLOAD_SIZE,
} from '../src/data-source-validator';

describe('ADR-001: Zod Schema Validation (Issue #43)', () => {
  describe('StatusDataSchema', () => {
    it('should accept valid StatusData with services array', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational' },
          { name: 'Web', status: 'degraded', latency: 150 },
        ],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should accept valid StatusData with timestamp', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational' },
        ],
        timestamp: '2026-01-01T12:00:00Z',
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should accept empty services array', () => {
      const data = {
        services: [],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should reject malformed JSON structure', () => {
      const data = 'not an object';

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject array instead of object', () => {
      const data = [{ name: 'API', status: 'operational' }];

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject missing services field', () => {
      const data = {
        timestamp: '2026-01-01T12:00:00Z',
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject invalid status value', () => {
      const data = {
        services: [
          { name: 'API', status: 'invalid-status' },
        ],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject service name exceeding max length', () => {
      const data = {
        services: [
          { name: 'A'.repeat(101), status: 'operational' },
        ],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject services array exceeding max count', () => {
      const data = {
        services: Array.from({ length: 101 }, (_, i) => ({
          name: `Service${i}`,
          status: 'operational',
        })),
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should strip unexpected fields from services', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational', unexpectedField: 'value' },
        ],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.services[0]).not.toHaveProperty('unexpectedField');
      }
    });

    it('should accept all valid status values', () => {
      const statuses = ['operational', 'degraded', 'outage', 'maintenance'];

      for (const status of statuses) {
        const data = {
          services: [{ name: 'API', status }],
        };

        const result = StatusDataSchema.safeParse(data);
        expect(result.success).toBe(true);
      }
    });

    it('should accept optional latency as number', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational', latency: 42.5 },
        ],
      };

      const result = StatusDataSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.services[0].latency).toBe(42.5);
      }
    });
  });

  describe('validateStatusData', () => {
    it('should return validated data for valid input', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational' },
        ],
      };

      const result = validateStatusData(data);

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('API');
    });

    it('should throw error for invalid input', () => {
      const data = { invalid: 'data' };

      expect(() => validateStatusData(data)).toThrow();
    });

    it('should throw descriptive error for missing services', () => {
      const data = {};

      expect(() => validateStatusData(data)).toThrow();
    });
  });

  describe('Payload Size Validation', () => {
    it('should define MAX_PAYLOAD_SIZE as 1MB', () => {
      expect(MAX_PAYLOAD_SIZE).toBe(1_000_000);
    });

    it('should reject payload exceeding 1MB', () => {
      // Create a large payload with max-length names
      // 100 services * 100 char name = 10KB base, need more
      const largeServices = Array.from({ length: 100 }, (_, i) => ({
        name: `Service${'X'.repeat(90)}${i}`.slice(0, 100), // Max 100 chars
        status: 'operational' as const,
        latency: 12345678901234, // Large number
      }));

      const data = {
        services: largeServices,
        // The refine runs after transform, so we test via validateAndParseResponse
      };

      // Test raw response size validation instead
      // Each service needs ~100 bytes, so 12000 services with longer names = >1MB
      const oversizedJson = JSON.stringify({
        services: Array.from({ length: 12000 }, (_, i) => ({
          name: `ServiceName${i.toString().padStart(5, '0')}${'X'.repeat(50)}`,
          status: 'operational',
          latency: 12345.67890,
        })),
      });

      expect(oversizedJson.length).toBeGreaterThan(MAX_PAYLOAD_SIZE);

      // Import the validateAndParseResponse function for size check
      const { validateAndParseResponse } = require('../src/data-source-validator');
      expect(() => validateAndParseResponse(oversizedJson)).toThrow(/exceeds maximum size/i);
    });

    it('should accept payload under 1MB', () => {
      const data = {
        services: [
          { name: 'API', status: 'operational' },
          { name: 'Web', status: 'operational' },
        ],
      };

      const jsonString = JSON.stringify(data);
      expect(jsonString.length).toBeLessThan(MAX_PAYLOAD_SIZE);

      const result = StatusDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

describe('ADR-001: Security Validation (Issue #44)', () => {
  describe('HTTPS Enforcement', () => {
    it('should warn when http:// URL used in production context', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'http://insecure.example.com/status.json',
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/http:\/\/.*production.*HTTPS/i)
      );

      consoleSpy.mockRestore();
    });

    it('should not warn for http:// URL in development context', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'http://localhost:3000/status.json',
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'development' });

      // Should not warn about HTTPS in development
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/HTTPS.*production/i)
      );

      consoleSpy.mockRestore();
    });

    it('should not warn for https:// URLs', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://secure.example.com/status.json',
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not warn for relative URLs', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: '/status-data/current.json',
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Authorization Header Warning', () => {
    it('should warn if Authorization header present in http strategy', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json',
        headers: {
          'Authorization': 'Bearer token123',
        },
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Authorization.*header.*exposed|secret.*client/i)
      );

      consoleSpy.mockRestore();
    });

    it('should warn for any auth-related headers', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const authHeaders = ['Authorization', 'X-API-Key', 'X-Auth-Token'];

      for (const header of authHeaders) {
        consoleSpy.mockClear();

        const dataSource: DataSource = {
          strategy: 'http',
          url: 'https://api.example.com/status.json',
          headers: {
            [header]: 'secret-value',
          },
          cacheBust: false,
        };

        validateDataSourceSecurity(dataSource, { context: 'production' });

        expect(consoleSpy).toHaveBeenCalled();
      }

      consoleSpy.mockRestore();
    });

    it('should not warn for non-sensitive headers', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Strategy-Specific Validation', () => {
    it('should skip security checks for github strategy', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      // GitHub strategy uses known-secure URLs
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should skip security checks for static strategy', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'static',
        path: './data/status.json',
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      // Static strategy reads local files
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should skip security checks for build-only strategy', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      validateDataSourceSecurity(dataSource, { context: 'production' });

      // Build-only has no runtime fetch
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Mixed Content Warning', () => {
    it('should warn about mixed content when fetching http from https site', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataSource: DataSource = {
        strategy: 'http',
        url: 'http://insecure.example.com/status.json',
        cacheBust: false,
      };

      validateDataSourceSecurity(dataSource, {
        context: 'production',
        siteProtocol: 'https:',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/mixed content|blocked.*HTTPS/i)
      );

      consoleSpy.mockRestore();
    });
  });
});
