/**
 * TDD Tests for ADR-001: Configurable Data Fetching Strategies
 *
 * These tests are written FIRST (before implementation) following TDD methodology.
 * Tests should initially FAIL until the implementation is complete.
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import { Joi } from '@docusaurus/utils-validation';

// Import types (will fail until implemented)
import type {
  DataSource,
  GitHubDataSource,
  HttpDataSource,
  StaticDataSource,
  BuildOnlyDataSource,
} from '../src/types';

// Import validation (will fail until implemented)
import { dataSourceSchema, validateDataSource } from '../src/options';

describe('ADR-001: DataSource Types', () => {
  describe('Type Discrimination', () => {
    /**
     * TypeScript should correctly narrow DataSource types based on strategy field.
     * This is tested at compile time, but we verify runtime behavior here.
     */

    it('should identify GitHubDataSource when strategy is "github"', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'test-org',
        repo: 'test-repo',
      };

      expect(dataSource.strategy).toBe('github');

      // Type narrowing should work in switch
      if (dataSource.strategy === 'github') {
        expect(dataSource.owner).toBe('test-org');
        expect(dataSource.repo).toBe('test-repo');
      }
    });

    it('should identify HttpDataSource when strategy is "http"', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
      };

      expect(dataSource.strategy).toBe('http');

      if (dataSource.strategy === 'http') {
        expect(dataSource.url).toBe('https://example.com/status.json');
      }
    });

    it('should identify StaticDataSource when strategy is "static"', () => {
      const dataSource: DataSource = {
        strategy: 'static',
        path: './status-data/current.json',
      };

      expect(dataSource.strategy).toBe('static');

      if (dataSource.strategy === 'static') {
        expect(dataSource.path).toBe('./status-data/current.json');
      }
    });

    it('should identify BuildOnlyDataSource when strategy is "build-only"', () => {
      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      expect(dataSource.strategy).toBe('build-only');
    });

    it('should support optional fields on GitHubDataSource', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'test-org',
        repo: 'test-repo',
        branch: 'status-data',
        path: 'current.json',
      };

      if (dataSource.strategy === 'github') {
        expect(dataSource.branch).toBe('status-data');
        expect(dataSource.path).toBe('current.json');
      }
    });

    it('should support optional fields on HttpDataSource', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://example.com/status.json',
        headers: { 'X-Custom-Header': 'value' },
        cacheBust: true,
      };

      if (dataSource.strategy === 'http') {
        expect(dataSource.headers).toEqual({ 'X-Custom-Header': 'value' });
        expect(dataSource.cacheBust).toBe(true);
      }
    });
  });
});

describe('ADR-001: DataSource Joi Validation', () => {
  describe('String Shorthand', () => {
    it('should accept string dataSource as http strategy shorthand', () => {
      const result = dataSourceSchema.validate('https://example.com/status.json');

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({
        strategy: 'http',
        url: 'https://example.com/status.json',
        cacheBust: false,  // Default value
      });
    });

    it('should accept relative URL string as http strategy', () => {
      const result = dataSourceSchema.validate('/status-data/current.json');

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({
        strategy: 'http',
        url: '/status-data/current.json',
        cacheBust: false,  // Default value
      });
    });
  });

  describe('GitHub Strategy', () => {
    it('should accept github strategy with owner and repo', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.strategy).toBe('github');
      expect(result.value.owner).toBe('my-org');
      expect(result.value.repo).toBe('my-repo');
    });

    it('should apply default branch for github strategy', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.branch).toBe('status-data');
    });

    it('should apply default path for github strategy', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.path).toBe('current.json');
    });

    it('should accept custom branch and path for github strategy', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        branch: 'custom-branch',
        path: 'data/status.json',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.branch).toBe('custom-branch');
      expect(result.value.path).toBe('data/status.json');
    });

    it('should reject github strategy without owner', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        repo: 'my-repo',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/owner/i);
    });

    it('should reject github strategy without repo', () => {
      const result = dataSourceSchema.validate({
        strategy: 'github',
        owner: 'my-org',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/repo/i);
    });
  });

  describe('HTTP Strategy', () => {
    it('should accept http strategy with URL', () => {
      const result = dataSourceSchema.validate({
        strategy: 'http',
        url: 'https://api.example.com/status',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.strategy).toBe('http');
      expect(result.value.url).toBe('https://api.example.com/status');
    });

    it('should accept http strategy with optional headers', () => {
      const result = dataSourceSchema.validate({
        strategy: 'http',
        url: 'https://api.example.com/status',
        headers: { 'X-API-Key': 'build-time-only' },
      });

      expect(result.error).toBeUndefined();
      expect(result.value.headers).toEqual({ 'X-API-Key': 'build-time-only' });
    });

    it('should accept http strategy with cacheBust option', () => {
      const result = dataSourceSchema.validate({
        strategy: 'http',
        url: 'https://gist.githubusercontent.com/user/id/raw/status.json',
        cacheBust: true,
      });

      expect(result.error).toBeUndefined();
      expect(result.value.cacheBust).toBe(true);
    });

    it('should default cacheBust to false', () => {
      const result = dataSourceSchema.validate({
        strategy: 'http',
        url: 'https://example.com/status.json',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.cacheBust).toBe(false);
    });

    it('should reject http strategy without url', () => {
      const result = dataSourceSchema.validate({
        strategy: 'http',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/url/i);
    });
  });

  describe('Static Strategy', () => {
    it('should accept static strategy with path', () => {
      const result = dataSourceSchema.validate({
        strategy: 'static',
        path: './packages/status/current.json',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.strategy).toBe('static');
      expect(result.value.path).toBe('./packages/status/current.json');
    });

    it('should accept absolute path for static strategy', () => {
      const result = dataSourceSchema.validate({
        strategy: 'static',
        path: '/var/data/status/current.json',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.path).toBe('/var/data/status/current.json');
    });

    it('should reject static strategy without path', () => {
      const result = dataSourceSchema.validate({
        strategy: 'static',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/path/i);
    });
  });

  describe('Build-Only Strategy', () => {
    it('should accept build-only strategy', () => {
      const result = dataSourceSchema.validate({
        strategy: 'build-only',
      });

      expect(result.error).toBeUndefined();
      expect(result.value.strategy).toBe('build-only');
    });

    it('should reject extra fields for build-only strategy', () => {
      // Security: extra fields are rejected, not silently stripped
      const result = dataSourceSchema.validate({
        strategy: 'build-only',
        extraField: 'should-be-rejected',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/extraField.*not allowed/i);
    });
  });

  describe('Invalid Strategy', () => {
    it('should reject unknown strategy name', () => {
      const result = dataSourceSchema.validate({
        strategy: 'unknown',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/strategy/i);
    });

    it('should reject empty object', () => {
      const result = dataSourceSchema.validate({});

      expect(result.error).toBeDefined();
    });

    it('should reject null', () => {
      const result = dataSourceSchema.validate(null);

      expect(result.error).toBeDefined();
    });
  });
});

describe('ADR-001: fetchUrl Deprecation', () => {
  // These tests require the full plugin options validation context

  it('should emit deprecation warning when fetchUrl is used', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    validateDataSource({ fetchUrl: 'https://example.com/status.json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/fetchUrl.*deprecated/i)
    );

    consoleSpy.mockRestore();
  });

  it('should convert fetchUrl to http strategy', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = validateDataSource({
      fetchUrl: 'https://example.com/status.json'
    });

    expect(result).toEqual({
      strategy: 'http',
      url: 'https://example.com/status.json',
      cacheBust: false,
    });

    consoleSpy.mockRestore();
  });

  it('should prefer dataSource over fetchUrl when both present', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = validateDataSource({
      dataSource: {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      },
      fetchUrl: 'https://example.com/ignored.json',
    });

    expect(result.strategy).toBe('github');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/dataSource.*fetchUrl.*ignored/i)
    );

    consoleSpy.mockRestore();
  });

  it('should return build-only when neither dataSource nor fetchUrl provided', () => {
    const result = validateDataSource({});

    expect(result).toEqual({ strategy: 'build-only' });
  });
});

describe('ADR-001: Type Exhaustiveness', () => {
  /**
   * Verify that a switch statement covering all strategies is exhaustive.
   * This test ensures we don't forget to handle new strategies.
   */

  function handleDataSource(ds: DataSource): string {
    switch (ds.strategy) {
      case 'github':
        return `github:${ds.owner}/${ds.repo}`;
      case 'http':
        return `http:${ds.url}`;
      case 'static':
        return `static:${ds.path}`;
      case 'build-only':
        return 'build-only';
      default:
        // TypeScript should error if we miss a case
        const _exhaustive: never = ds;
        throw new Error(`Unknown strategy: ${_exhaustive}`);
    }
  }

  it('should handle github strategy', () => {
    expect(handleDataSource({
      strategy: 'github',
      owner: 'org',
      repo: 'repo'
    })).toBe('github:org/repo');
  });

  it('should handle http strategy', () => {
    expect(handleDataSource({
      strategy: 'http',
      url: 'https://example.com'
    })).toBe('http:https://example.com');
  });

  it('should handle static strategy', () => {
    expect(handleDataSource({
      strategy: 'static',
      path: './data.json'
    })).toBe('static:./data.json');
  });

  it('should handle build-only strategy', () => {
    expect(handleDataSource({
      strategy: 'build-only'
    })).toBe('build-only');
  });
});
