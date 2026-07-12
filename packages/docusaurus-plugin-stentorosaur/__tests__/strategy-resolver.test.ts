/**
 * TDD Tests for ADR-001: Strategy Resolver
 *
 * These tests are written FIRST (before implementation) following TDD methodology.
 * Tests should initially FAIL until the implementation is complete.
 *
 * The strategy resolver handles:
 * - Converting plugin options to resolved DataSource
 * - Building fetch URLs from DataSource config
 * - Inferring strategy from legacy fetchUrl patterns
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import type { DataSource, PluginOptions } from '../src/types';

// Import resolver functions (will fail until implemented)
import {
  resolveDataSource,
  buildFetchUrl,
  inferStrategyFromUrl,
} from '../src/data-source-resolver';

describe('ADR-001: Strategy Resolver', () => {
  describe('resolveDataSource', () => {
    describe('new dataSource config', () => {
      it('should return github strategy when configured', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'github',
            owner: 'my-org',
            repo: 'my-repo',
          },
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('github');
        if (result.strategy === 'github') {
          expect(result.owner).toBe('my-org');
          expect(result.repo).toBe('my-repo');
          expect(result.branch).toBe('status-data'); // default
          expect(result.path).toBe('current.json'); // default
        }
      });

      it('should return http strategy when configured', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'http',
            url: 'https://api.example.com/status.json',
          },
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('http');
        if (result.strategy === 'http') {
          expect(result.url).toBe('https://api.example.com/status.json');
          expect(result.cacheBust).toBe(false); // default
        }
      });

      it('should return static strategy when configured', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'static',
            path: './packages/status/current.json',
          },
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('static');
        if (result.strategy === 'static') {
          expect(result.path).toBe('./packages/status/current.json');
        }
      });

      it('should return build-only strategy when configured', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'build-only',
          },
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('build-only');
      });

      it('should convert string dataSource to http strategy', () => {
        const options: Partial<PluginOptions> = {
          dataSource: 'https://status.example.com/current.json',
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('http');
        if (result.strategy === 'http') {
          expect(result.url).toBe('https://status.example.com/current.json');
        }
      });

      it('should preserve custom branch and path for github strategy', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'github',
            owner: 'my-org',
            repo: 'my-repo',
            branch: 'custom-branch',
            path: 'data/status.json',
          },
        };

        const result = resolveDataSource(options);

        if (result.strategy === 'github') {
          expect(result.branch).toBe('custom-branch');
          expect(result.path).toBe('data/status.json');
        }
      });

      it('should preserve cacheBust option for http strategy', () => {
        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'http',
            url: 'https://gist.githubusercontent.com/user/id/raw/status.json',
            cacheBust: true,
          },
        };

        const result = resolveDataSource(options);

        if (result.strategy === 'http') {
          expect(result.cacheBust).toBe(true);
        }
      });
    });

    describe('legacy fetchUrl support', () => {
      it('should convert raw.githubusercontent.com URL to github strategy', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          fetchUrl: 'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json',
        };

        const result = resolveDataSource(options);

        // Should infer github strategy from URL pattern
        expect(result.strategy).toBe('github');
        if (result.strategy === 'github') {
          expect(result.owner).toBe('my-org');
          expect(result.repo).toBe('my-repo');
          expect(result.branch).toBe('status-data');
          expect(result.path).toBe('current.json');
        }

        // Should emit deprecation warning
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/fetchUrl.*deprecated/i)
        );

        consoleSpy.mockRestore();
      });

      it('should convert gist URL to http strategy', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          fetchUrl: 'https://gist.githubusercontent.com/user/abc123/raw/status.json',
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('http');
        if (result.strategy === 'http') {
          expect(result.url).toBe('https://gist.githubusercontent.com/user/abc123/raw/status.json');
        }

        consoleSpy.mockRestore();
      });

      it('should convert github pages URL to http strategy', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          fetchUrl: 'https://my-org.github.io/status-data/current.json',
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('http');
        if (result.strategy === 'http') {
          expect(result.url).toBe('https://my-org.github.io/status-data/current.json');
        }

        consoleSpy.mockRestore();
      });

      it('should convert arbitrary URL to http strategy', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          fetchUrl: 'https://status-api.workers.dev/current.json',
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('http');
        if (result.strategy === 'http') {
          expect(result.url).toBe('https://status-api.workers.dev/current.json');
        }

        consoleSpy.mockRestore();
      });

      it('should log deprecation warning for fetchUrl', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          fetchUrl: 'https://example.com/status.json',
        };

        resolveDataSource(options);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/fetchUrl.*deprecated/i)
        );

        consoleSpy.mockRestore();
      });

      it('should prefer dataSource over fetchUrl when both present', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const options: Partial<PluginOptions> = {
          dataSource: {
            strategy: 'github',
            owner: 'preferred-org',
            repo: 'preferred-repo',
          },
          fetchUrl: 'https://ignored.example.com/status.json',
        };

        const result = resolveDataSource(options);

        expect(result.strategy).toBe('github');
        if (result.strategy === 'github') {
          expect(result.owner).toBe('preferred-org');
        }

        // Should warn that fetchUrl is ignored
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/dataSource.*fetchUrl.*ignored/i)
        );

        consoleSpy.mockRestore();
      });
    });

    describe('defaults', () => {
      it('should return build-only when no dataSource or fetchUrl', () => {
        const options: Partial<PluginOptions> = {};

        const result = resolveDataSource(options);

        expect(result).toEqual({ strategy: 'build-only' });
      });

      it('should return build-only when dataSource is undefined', () => {
        const options: Partial<PluginOptions> = {
          owner: 'my-org',
          repo: 'my-repo',
          // No dataSource or fetchUrl
        };

        const result = resolveDataSource(options);

        expect(result).toEqual({ strategy: 'build-only' });
      });
    });
  });

  describe('buildFetchUrl', () => {
    it('should construct raw.githubusercontent.com URL for github strategy', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        branch: 'status-data',
        path: 'current.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json');
    });

    it('should handle nested path for github strategy', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        branch: 'main',
        path: 'data/status/current.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('https://raw.githubusercontent.com/my-org/my-repo/main/data/status/current.json');
    });

    it('should return URL directly for http strategy', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json',
        cacheBust: false,
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('https://api.example.com/status.json');
    });

    it('should append cache-busting parameter when cacheBust is true', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://gist.githubusercontent.com/user/id/raw/status.json',
        cacheBust: true,
      };

      const url = buildFetchUrl(dataSource);

      // Should append ?t=timestamp or similar
      expect(url).toMatch(/^https:\/\/gist\.githubusercontent\.com\/user\/id\/raw\/status\.json\?t=\d+$/);
    });

    it('should handle URL with existing query params when cacheBust is true', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json?format=json',
        cacheBust: true,
      };

      const url = buildFetchUrl(dataSource);

      // Should append &t=timestamp
      expect(url).toMatch(/^https:\/\/api\.example\.com\/status\.json\?format=json&t=\d+$/);
    });

    it('should return file:// URL for static strategy', () => {
      const dataSource: DataSource = {
        strategy: 'static',
        path: './packages/status/current.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('file://./packages/status/current.json');
    });

    it('should handle absolute path for static strategy', () => {
      const dataSource: DataSource = {
        strategy: 'static',
        path: '/var/data/status/current.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('file:///var/data/status/current.json');
    });

    it('should return null for build-only strategy', () => {
      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBeNull();
    });
  });

  describe('inferStrategyFromUrl', () => {
    it('should infer github strategy from raw.githubusercontent.com URL', () => {
      const url = 'https://raw.githubusercontent.com/owner/repo/branch/path/file.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('github');
      if (result.strategy === 'github') {
        expect(result.owner).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('branch');
        expect(result.path).toBe('path/file.json');
      }
    });

    it('should infer github strategy from raw.githubusercontent.com with simple path', () => {
      const url = 'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('github');
      if (result.strategy === 'github') {
        expect(result.owner).toBe('my-org');
        expect(result.repo).toBe('my-repo');
        expect(result.branch).toBe('status-data');
        expect(result.path).toBe('current.json');
      }
    });

    it('should infer http strategy from gist URL', () => {
      const url = 'https://gist.githubusercontent.com/user/id/raw/file.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('http');
      if (result.strategy === 'http') {
        expect(result.url).toBe(url);
      }
    });

    it('should infer http strategy from github.io URL', () => {
      const url = 'https://org.github.io/repo/data/status.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('http');
      if (result.strategy === 'http') {
        expect(result.url).toBe(url);
      }
    });

    it('should infer http strategy from arbitrary URL', () => {
      const url = 'https://status-api.workers.dev/current.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('http');
      if (result.strategy === 'http') {
        expect(result.url).toBe(url);
      }
    });

    it('should infer http strategy from relative URL', () => {
      const url = '/status-data/current.json';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('http');
      if (result.strategy === 'http') {
        expect(result.url).toBe(url);
      }
    });

    it('should handle raw.githubusercontent.com URL with trailing slash', () => {
      const url = 'https://raw.githubusercontent.com/owner/repo/branch/';

      const result = inferStrategyFromUrl(url);

      expect(result.strategy).toBe('github');
      if (result.strategy === 'github') {
        expect(result.owner).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('branch');
        expect(result.path).toBe('current.json'); // default
      }
    });
  });
});
