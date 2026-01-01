/**
 * TDD Tests for ADR-001: Client-Safe Data Source Utilities
 *
 * Tests that the client-safe module can be imported without Node.js dependencies.
 * This is critical for webpack bundling in browser contexts.
 */

import type { DataSource } from '../src/types';

// Import client-safe module - should NOT pull in Node.js dependencies
import { buildFetchUrl } from '../src/data-source-resolver.client';

describe('ADR-001: Client-Safe Data Source Resolver', () => {
  describe('buildFetchUrl', () => {
    it('should build GitHub raw URL from github strategy', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe(
        'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json'
      );
    });

    it('should use custom branch and path for github strategy', () => {
      const dataSource: DataSource = {
        strategy: 'github',
        owner: 'my-org',
        repo: 'my-repo',
        branch: 'custom-branch',
        path: 'data/status.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe(
        'https://raw.githubusercontent.com/my-org/my-repo/custom-branch/data/status.json'
      );
    });

    it('should return URL directly for http strategy', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('https://api.example.com/status.json');
    });

    it('should add cache busting parameter when cacheBust is true', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json',
        cacheBust: true,
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toMatch(/^https:\/\/api\.example\.com\/status\.json\?t=\d+$/);
    });

    it('should append cache bust to existing query string', () => {
      const dataSource: DataSource = {
        strategy: 'http',
        url: 'https://api.example.com/status.json?foo=bar',
        cacheBust: true,
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toMatch(
        /^https:\/\/api\.example\.com\/status\.json\?foo=bar&t=\d+$/
      );
    });

    it('should return file:// URL for static strategy', () => {
      const dataSource: DataSource = {
        strategy: 'static',
        path: '/status-data/current.json',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBe('file:///status-data/current.json');
    });

    it('should return null for build-only strategy', () => {
      const dataSource: DataSource = {
        strategy: 'build-only',
      };

      const url = buildFetchUrl(dataSource);

      expect(url).toBeNull();
    });
  });

  describe('Module Isolation', () => {
    /**
     * This test verifies that the client-safe module doesn't pull in
     * Node.js dependencies. If this passes in Jest (which has Node.js),
     * we trust that the webpack build will also work.
     */
    it('should not import from @docusaurus/utils-validation', async () => {
      // Clear module cache to ensure fresh import
      jest.resetModules();

      // Mock the problematic module to detect if it's imported
      let joiWasImported = false;
      jest.doMock('@docusaurus/utils-validation', () => {
        joiWasImported = true;
        throw new Error('Should not import @docusaurus/utils-validation in client code');
      });

      // Re-import the client module
      const clientModule = await import('../src/data-source-resolver.client');

      // Verify the module loaded and works
      expect(clientModule.buildFetchUrl).toBeDefined();
      expect(joiWasImported).toBe(false);

      // Clean up
      jest.unmock('@docusaurus/utils-validation');
    });
  });
});
