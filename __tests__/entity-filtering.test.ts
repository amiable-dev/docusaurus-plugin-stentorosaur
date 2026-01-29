/**
 * Tests for entity filtering when processing status data from current.json
 *
 * Issue #62: Status page displays systems from current.json not filtered against .monitorrc.json entities
 *
 * When using entitiesSource: 'monitorrc', systems removed from .monitorrc.json should NOT appear
 * on the status page, even if historical data for those systems exists in current.json.
 */

import type {LoadContext} from '@docusaurus/types';
import type {PluginOptions} from '../src/types';
import pluginStatusPage from '../src/index';
import {GitHubStatusService} from '../src/github-service';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('../src/github-service');

const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedGitHubStatusService = GitHubStatusService as jest.MockedClass<typeof GitHubStatusService>;

describe('Entity filtering from current.json', () => {
  let mockContext: LoadContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      siteDir: '/test/site',
      generatedFilesDir: '/test/site/.docusaurus',
      outDir: '/test/site/build',
      baseUrl: '/',
      i18n: {
        currentLocale: 'en',
        defaultLocale: 'en',
        locales: ['en'],
        path: 'i18n',
        localeConfigs: {},
      },
      siteConfig: {
        baseUrl: '/',
      } as any,
    } as LoadContext;

    // Default mock implementations
    (mockedFs.ensureDir as any).mockResolvedValue(undefined);
    (mockedFs.writeJson as any).mockResolvedValue(undefined);
    (mockedFs.writeFile as any).mockResolvedValue(undefined);

    // Mock GitHub service to avoid API calls
    const mockServiceInstance = {
      fetchStatusData: jest.fn().mockResolvedValue({
        items: [],
        incidents: [],
      }),
    };
    MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);
  });

  describe('when entitiesSource is "config"', () => {
    it('should only display systems that are in the entities array', async () => {
      // current.json contains data for 3 systems: api, web, and "removed-system"
      // But entities only includes api and web
      const currentJsonData = [
        { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 100 },
        { t: Date.now(), svc: 'web', state: 'up', code: 200, lat: 150 },
        { t: Date.now(), svc: 'removed-system', state: 'down', code: 0, lat: 0 }, // This should be filtered out
      ];

      (mockedFs.pathExists as any).mockImplementation((path: string) => {
        if (path.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((path: string) => {
        if (path.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'config',
        entities: [
          { name: 'api', type: 'system' },
          { name: 'web', type: 'system' },
          // Note: 'removed-system' is NOT in the entities list
        ],
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should only have 2 items, not 3
      expect(content.items.length).toBe(2);
      expect(content.items.map(i => i.name)).toContain('api');
      expect(content.items.map(i => i.name)).toContain('web');
      expect(content.items.map(i => i.name)).not.toContain('removed-system');
    });
  });

  describe('when entitiesSource is "monitorrc"', () => {
    it('should only display systems that are in .monitorrc.json', async () => {
      // .monitorrc.json only has workflow and llm-council
      const monitorRcConfig = {
        systems: [
          { system: 'workflow', url: 'https://workflow.example.com/health' },
          { system: 'llm-council', url: 'https://llm-council.example.com' },
          // Note: 'website' is NOT configured
        ],
      };

      // But current.json has historical data for all 3, including removed 'website'
      const currentJsonData = [
        { t: Date.now(), svc: 'workflow', state: 'up', code: 200, lat: 260 },
        { t: Date.now(), svc: 'llm-council', state: 'up', code: 200, lat: 152 },
        { t: Date.now(), svc: 'website', state: 'down', code: 0, lat: 37 }, // Historical data for removed system
      ];

      (mockedFs.pathExists as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(true);
        if (filePath.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(monitorRcConfig);
        if (filePath.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'monitorrc',
        entities: [], // Empty since we're using monitorrc
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should only have 2 items (workflow, llm-council), NOT 3
      expect(content.items.length).toBe(2);
      expect(content.items.map(i => i.name)).toContain('workflow');
      expect(content.items.map(i => i.name)).toContain('llm-council');
      expect(content.items.map(i => i.name)).not.toContain('website');
    });

    it('should respect display: false in .monitorrc.json', async () => {
      // .monitorrc.json has a hidden system
      const monitorRcConfig = {
        systems: [
          { system: 'workflow', url: 'https://workflow.example.com/health' },
          { system: 'internal-api', url: 'https://internal.example.com', display: false },
        ],
      };

      const currentJsonData = [
        { t: Date.now(), svc: 'workflow', state: 'up', code: 200, lat: 260 },
        { t: Date.now(), svc: 'internal-api', state: 'up', code: 200, lat: 100 },
      ];

      (mockedFs.pathExists as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(true);
        if (filePath.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(monitorRcConfig);
        if (filePath.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'monitorrc',
        entities: [],
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should only show workflow, not internal-api (display: false)
      expect(content.items.length).toBe(1);
      expect(content.items[0].name).toBe('workflow');
    });

    it('should handle case-insensitive system name matching', async () => {
      const monitorRcConfig = {
        systems: [
          { system: 'API', url: 'https://api.example.com/health' },
        ],
      };

      // current.json has lowercase 'api'
      const currentJsonData = [
        { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 100 },
      ];

      (mockedFs.pathExists as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(true);
        if (filePath.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(monitorRcConfig);
        if (filePath.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'monitorrc',
        entities: [],
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should match despite case difference
      expect(content.items.length).toBe(1);
    });
  });

  describe('when entitiesSource is "hybrid"', () => {
    it('should include systems from both config and monitorrc', async () => {
      const monitorRcConfig = {
        systems: [
          { system: 'workflow', url: 'https://workflow.example.com/health' },
        ],
      };

      const currentJsonData = [
        { t: Date.now(), svc: 'workflow', state: 'up', code: 200, lat: 260 },
        { t: Date.now(), svc: 'legacy-api', state: 'up', code: 200, lat: 150 },
        { t: Date.now(), svc: 'unknown-system', state: 'down', code: 0, lat: 0 },
      ];

      (mockedFs.pathExists as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(true);
        if (filePath.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(monitorRcConfig);
        if (filePath.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'hybrid',
        entities: [
          { name: 'legacy-api', type: 'system' }, // From config
        ],
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should have workflow (from monitorrc) and legacy-api (from config)
      // Should NOT have unknown-system
      expect(content.items.length).toBe(2);
      expect(content.items.map(i => i.name)).toContain('workflow');
      expect(content.items.map(i => i.name)).toContain('legacy-api');
      expect(content.items.map(i => i.name)).not.toContain('unknown-system');
    });
  });

  describe('preserving historical data', () => {
    it('should filter display but preserve data for configured systems', async () => {
      const monitorRcConfig = {
        systems: [
          { system: 'workflow', url: 'https://workflow.example.com/health' },
        ],
      };

      // Historical data with multiple readings
      const currentJsonData = [
        { t: Date.now() - 60000, svc: 'workflow', state: 'up', code: 200, lat: 260 },
        { t: Date.now() - 30000, svc: 'workflow', state: 'up', code: 200, lat: 280 },
        { t: Date.now(), svc: 'workflow', state: 'up', code: 200, lat: 240 },
        // These should be filtered from items but the raw data remains in current.json
        { t: Date.now(), svc: 'removed-system', state: 'down', code: 0, lat: 0 },
      ];

      (mockedFs.pathExists as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(true);
        if (filePath.includes('current.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      (mockedFs.readJson as any).mockImplementation((filePath: string) => {
        if (filePath.includes('.monitorrc.json')) return Promise.resolve(monitorRcConfig);
        if (filePath.includes('current.json')) return Promise.resolve(currentJsonData);
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        entitiesSource: 'monitorrc',
        entities: [],
        useDemoData: false,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should only show configured system
      expect(content.items.length).toBe(1);
      expect(content.items[0].name).toBe('workflow');

      // The workflow item should have all its historical data
      expect(content.items[0].history?.length).toBe(3);
    });
  });
});
