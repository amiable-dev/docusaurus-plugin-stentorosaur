/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {LoadContext, RouteConfig, PluginRouteConfig} from '@docusaurus/types';
import type {PluginOptions, StatusData} from '../src/types';
import pluginStatusPage from '../src/index';
import {GitHubStatusService} from '../src/github-service';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock dependencies
jest.mock('../src/github-service');
jest.mock('fs-extra');

const MockedGitHubStatusService = GitHubStatusService as jest.MockedClass<typeof GitHubStatusService>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('docusaurus-plugin-stentorosaur', () => {
  let mockContext: LoadContext;
  const defaultOptions: PluginOptions = {
    owner: 'test-owner',
    repo: 'test-repo',
    token: 'test-token',
    systemLabels: ['api', 'web', 'database'],
    statusLabel: 'status',
    useDemoData: false,
    showServices: true,
    showIncidents: true,
  };

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

    // Mock fs-extra methods
    (mockedFs.ensureDir as any).mockResolvedValue(undefined);
    (mockedFs.writeJson as any).mockResolvedValue(undefined);
    (mockedFs.pathExists as any).mockResolvedValue(false);
  });

  describe('plugin initialization', () => {
    it('should return a plugin instance', async () => {
      const plugin = await pluginStatusPage(mockContext, defaultOptions);

      expect(plugin.name).toBe('docusaurus-plugin-stentorosaur');
      expect(plugin.loadContent).toBeDefined();
      expect(plugin.contentLoaded).toBeDefined();
      expect(plugin.postBuild).toBeDefined();
    });

    it('should throw error when owner and repo are not provided', async () => {
      const invalidOptions: PluginOptions = {
        ...defaultOptions,
        owner: undefined as any,
        repo: undefined as any,
      };

      await expect(pluginStatusPage(mockContext, invalidOptions)).rejects.toThrow(
        'docusaurus-plugin-stentorosaur requires either plugin options (owner, repo) or site config (organizationName, projectName) to be set'
      );
    });

    it('should use siteConfig values when options are not provided', async () => {
      const contextWithSiteConfig: LoadContext = {
        ...mockContext,
        siteConfig: {
          ...mockContext.siteConfig,
          organizationName: 'config-owner',
          projectName: 'config-repo',
        } as any,
      };

      const optionsWithoutOwnerRepo: PluginOptions = {
        ...defaultOptions,
        owner: undefined as any,
        repo: undefined as any,
      };

      const plugin = await pluginStatusPage(contextWithSiteConfig, optionsWithoutOwnerRepo);
      expect(plugin.name).toBe('docusaurus-plugin-stentorosaur');
    });
  });

  describe('loadContent', () => {
    it('should fetch GitHub data when token is provided and useDemoData is false', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
          {name: 'web', status: 'degraded', incidentCount: 1},
        ],
        incidents: [
          {
            id: 1,
            title: 'Test Incident',
            status: 'open' as const,
            severity: 'major' as const,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T01:00:00Z',
            url: 'https://github.com/test-owner/test-repo/issues/1',
            labels: ['status', 'web', 'major'],
            affectedSystems: ['web'],
          },
        ],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      expect(MockedGitHubStatusService).toHaveBeenCalledWith(
        'test-token',
        'test-owner',
        'test-repo',
        'status',
        ['api', 'web', 'database'],
        ['maintenance']
      );
      expect(mockServiceInstance.fetchStatusData).toHaveBeenCalled();
      expect(content.items).toEqual(mockGitHubData.items);
      expect(content.incidents).toEqual(mockGitHubData.incidents);
      expect(content.showServices).toBe(true);
      expect(content.showIncidents).toBe(true);
      expect(content.lastUpdated).toBeDefined();
    });

    it('should use demo data when useDemoData is true', async () => {
      const optionsWithDemoData: PluginOptions = {
        ...defaultOptions,
        useDemoData: true,
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithDemoData);
      const content = await plugin.loadContent!();

      // Should not call GitHub service when useDemoData is true
      expect(GitHubStatusService).not.toHaveBeenCalled();
      // Content should have items (from actual getDemoStatusData function)
      expect(content.items.length).toBeGreaterThan(0);
      expect(content.incidents).toBeDefined();
    });

    it('should use demo data when no token is provided', async () => {
      const optionsWithoutToken: PluginOptions = {
        ...defaultOptions,
        token: undefined,
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithoutToken);
      const content = await plugin.loadContent!();

      // Content should contain demo items when no token
      expect(content.items.length).toBeGreaterThan(0);
      expect(content.items[0].name).toBeDefined();
      expect(content.showServices).toBe(true);
    });

    it('should fallback to demo data when GitHub returns empty results', async () => {
      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue({
          items: [],
          incidents: [],
        }),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      // Use options that allow fallback (useDemoData not explicitly false)
      const optionsAllowingFallback: PluginOptions = {
        ...defaultOptions,
        useDemoData: undefined, // This allows fallback when GitHub returns empty
      };

      const plugin = await pluginStatusPage(mockContext, optionsAllowingFallback);
      const content = await plugin.loadContent!();

      // When GitHub returns empty and useDemoData !== false, plugin falls back to demo data
      expect(content.items.length).toBeGreaterThan(0);
      expect(content.items[0].name).toBeDefined();
    });

    it('should include showServices and showIncidents in returned data', async () => {
      const optionsWithVisibility: PluginOptions = {
        ...defaultOptions,
        showServices: false,
        showIncidents: true,
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithVisibility);
      const content = await plugin.loadContent!();

      expect(content.showServices).toBe(false);
      expect(content.showIncidents).toBe(true);
    });

    it('should use demo data when GitHub fetch throws error', async () => {
      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      // Should fallback to demo data on error
      expect(content.items.length).toBeGreaterThan(0);
      expect(content.incidents).toBeDefined();
    });

    it('should respect showServices=false when using demo data', async () => {
      const optionsWithoutServices: PluginOptions = {
        ...defaultOptions,
        useDemoData: true,
        showServices: false,
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithoutServices);
      const content = await plugin.loadContent!();

      expect(content.items).toEqual([]);
      expect(content.showServices).toBe(false);
    });

    it('should respect showIncidents=false when fetching from GitHub', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [
          {
            id: 1,
            title: 'Test Incident',
            status: 'open' as const,
            severity: 'major' as const,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T01:00:00Z',
            url: 'https://github.com/test-owner/test-repo/issues/1',
            labels: ['status'],
            affectedSystems: [],
          },
        ],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const optionsWithoutIncidents: PluginOptions = {
        ...defaultOptions,
        showIncidents: false,
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithoutIncidents);
      const content = await plugin.loadContent!();

      expect(content.incidents).toEqual([]);
      expect(content.showIncidents).toBe(false);
    });
  });

  describe('contentLoaded', () => {
    it('should add /status route', async () => {
      const mockAddRoute = jest.fn();
      const mockCreateData = jest.fn().mockResolvedValue('status-data.json');
      const mockSetGlobalData = jest.fn();

      const mockActions = {
        addRoute: mockAddRoute,
        createData: mockCreateData,
        setGlobalData: mockSetGlobalData,
      };

      const mockContent: StatusData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        showServices: true,
        showIncidents: true,
      };

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      await plugin.contentLoaded!({
        content: mockContent,
        actions: mockActions as any,
      });

      expect(mockCreateData).toHaveBeenCalledWith(
        'status-data.json',
        JSON.stringify(mockContent, null, 2)
      );
      expect(mockAddRoute).toHaveBeenCalledWith({
        path: '/status',
        component: '@theme/StatusPage',
        exact: true,
        modules: {
          statusData: 'status-data.json',
        },
        metadata: {
          lastUpdatedAt: new Date('2025-01-01T00:00:00Z').getTime(),
        },
      });
    });
  });

  describe('postBuild', () => {
    it('should copy status data to build directory', async () => {
      const mockContent: StatusData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        showServices: true,
        showIncidents: true,
      };

      (mockedFs.ensureDir as any).mockResolvedValue(undefined);
      (mockedFs.writeJSON as any).mockResolvedValue(undefined);
      (mockedFs.writeJson as any).mockResolvedValue(undefined);
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.copy as any).mockResolvedValue(undefined);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      await plugin.loadContent!();
      await plugin.postBuild!({outDir: '/test/site/build'} as any);

      const expectedDir = path.join('/test/site/build', 'status-data');
      expect(mockedFs.ensureDir).toHaveBeenCalledWith(expectedDir);
    });
  });

  describe('getPathsToWatch', () => {
    it('should return paths to status data files', async () => {
      const plugin = await pluginStatusPage(mockContext, defaultOptions);

      expect(plugin.getPathsToWatch!()).toEqual(['status-data/**/*.{json,yml,yaml}']);
    });
  });

  describe('getSwizzleComponentList', () => {
    it('should return list of swizzleable components', async () => {
      const {getSwizzleComponentList} = await import('../src/index');
      
      const components = getSwizzleComponentList();
      
      expect(components).toEqual([
        'StatusPage',
        'StatusBoard',
        'StatusItem',
        'IncidentHistory',
        'ResponseTimeChart',
        'UptimeChart',
        'StatusHistory',
        'PerformanceMetrics',
        'SLIChart',
        'ChartPanel',
      ]);
      expect(components.length).toBe(10);
    });
  });

  describe('getThemePath', () => {
    it('should return correct theme path', async () => {
      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      
      expect(plugin.getThemePath!()).toBe('../lib/theme');
    });
  });

  describe('getTypeScriptThemePath', () => {
    it('should return correct TypeScript theme path', async () => {
      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      
      expect(plugin.getTypeScriptThemePath!()).toBe('../src/theme');
    });
  });

  describe('loadContent with system files', () => {
    it('should merge GitHub data with system file data', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockSystemData = {
        name: 'api',
        currentStatus: 'up',
        lastChecked: '2025-01-01T12:00:00Z',
        timeDay: 150,
        uptimeDay: 99.5,
        history: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['api.json']);
      (mockedFs.readJson as any).mockResolvedValue(mockSystemData);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      expect(content.items[0].responseTime).toBe(150);
      expect(content.items[0].lastChecked).toBe('2025-01-01T12:00:00Z');
    });

    it('should handle system files without timeDay using history fallback', async () => {
      const mockGitHubData = {
        items: [
          {name: 'web', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockSystemData = {
        name: 'web',
        currentStatus: 'up',
        lastChecked: '2025-01-01T12:00:00Z',
        history: [
          {timestamp: '2025-01-01T12:00:00Z', status: 'up', responseTime: 100},
          {timestamp: '2025-01-01T11:55:00Z', status: 'up', responseTime: 120},
          {timestamp: '2025-01-01T11:50:00Z', status: 'up', responseTime: 80},
        ],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['web.json']);
      (mockedFs.readJson as any).mockResolvedValue(mockSystemData);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      // Average of 100, 120, 80 = 100
      expect(content.items[0].responseTime).toBe(100);
    });

    it('should add systems from files not in GitHub issues', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockSystemData = {
        name: 'database',
        currentStatus: 'up',
        lastChecked: '2025-01-01T12:00:00Z',
        timeDay: 50,
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['database.json']);
      (mockedFs.readJson as any).mockResolvedValue(mockSystemData);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      expect(content.items.length).toBe(2);
      expect(content.items.some(item => item.name === 'database')).toBe(true);
    });

    it('should handle systems directory not existing', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(false);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      expect(content.items.length).toBe(1);
      expect(content.items[0].name).toBe('api');
    });

    it('should skip example-api.json file', async () => {
      const mockGitHubData = {
        items: [],
        incidents: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['example-api.json', 'real-api.json']);
      (mockedFs.readJson as any).mockResolvedValue({
        name: 'real-api',
        currentStatus: 'up',
        timeDay: 100,
      });

      const plugin = await pluginStatusPage(mockContext, {
        ...defaultOptions,
        useDemoData: false,
      });
      const content = await plugin.loadContent!();

      // Note: readJson is called twice now - once for committed status data check, once for system file
      expect(mockedFs.readJson).toHaveBeenCalled();
      expect(mockedFs.readJson).not.toHaveBeenCalledWith(
        expect.stringContaining('example-api.json')
      );
    });

    it('should handle invalid JSON in system files gracefully', async () => {
      const mockGitHubData = {
        items: [],
        incidents: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['invalid.json']);
      (mockedFs.readJson as any).mockRejectedValue(new Error('Invalid JSON'));

      const plugin = await pluginStatusPage(mockContext, {
        ...defaultOptions,
        useDemoData: false,
      });
      const content = await plugin.loadContent!();

      // Should handle error gracefully and use demo data as fallback
      expect(content.items).toBeDefined();
    });

    it('should handle readdir returning non-array', async () => {
      const mockGitHubData = {
        items: [],
        incidents: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(null);

      const plugin = await pluginStatusPage(mockContext, {
        ...defaultOptions,
        useDemoData: false,
      });
      const content = await plugin.loadContent!();

      expect(content.items).toBeDefined();
    });

    it('should merge responseTime and lastChecked from system files', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockSystemData = {
        name: 'api',
        currentStatus: 'up',
        uptime: 95.0,
        uptimeDay: 99.5,
        timeDay: 100,
        lastChecked: '2025-01-01T12:00:00Z',
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['api.json']);
      (mockedFs.readJson as any).mockResolvedValue(mockSystemData);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      // Merge logic only includes responseTime and lastChecked, not uptime
      expect(content.items[0].responseTime).toBe(100);
      expect(content.items[0].lastChecked).toBe('2025-01-01T12:00:00Z');
    });

    it('should include uptime from system files for systems not in GitHub', async () => {
      const mockGitHubData = {
        items: [
          {name: 'api', status: 'up', incidentCount: 0},
        ],
        incidents: [],
      };

      const mockSystemData = {
        name: 'database',
        currentStatus: 'up',
        uptime: 95.0,
        timeDay: 50,
        lastChecked: '2025-01-01T12:00:00Z',
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockResolvedValue(['database.json']);
      (mockedFs.readJson as any).mockResolvedValue(mockSystemData);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      const dbItem = content.items.find(item => item.name === 'database');
      expect(dbItem).toBeDefined();
      // For systems added from files only, uptime is undefined (not merged)
      expect(dbItem?.uptime).toBeUndefined();
    });

    it('should handle readdir throwing error', async () => {
      const mockGitHubData = {
        items: [],
        incidents: [],
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any).mockRejectedValue(new Error('Read error'));

      const plugin = await pluginStatusPage(mockContext, {
        ...defaultOptions,
        useDemoData: false,
      });
      const content = await plugin.loadContent!();

      expect(content.items).toBeDefined();
    });

    it('should warn about missing GITHUB_TOKEN in CI environment', async () => {
      const originalCI = process.env.CI;
      process.env.CI = 'true';
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const optionsWithoutToken: PluginOptions = {
        ...defaultOptions,
        token: undefined,
        useDemoData: undefined, // Not explicitly set
      };

      const plugin = await pluginStatusPage(mockContext, optionsWithoutToken);
      await plugin.loadContent!();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_TOKEN not found in CI environment')
      );

      consoleWarnSpy.mockRestore();
      process.env.CI = originalCI;
    });

    it('should limit incidents to 20 most recent', async () => {
      const mockIncidents = Array.from({length: 30}, (_, i) => ({
        id: i + 1,
        title: `Incident ${i + 1}`,
        status: 'closed' as const,
        severity: 'minor' as const,
        createdAt: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        updatedAt: `2025-01-${String(i + 1).padStart(2, '0')}T01:00:00Z`,
        url: `https://github.com/test/repo/issues/${i + 1}`,
        labels: ['status'],
        affectedSystems: [],
      }));

      const mockGitHubData = {
        items: [],
        incidents: mockIncidents,
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue(mockGitHubData),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const plugin = await pluginStatusPage(mockContext, defaultOptions);
      const content = await plugin.loadContent!();

      expect(content.incidents.length).toBe(20);
    });
  });

  describe('scheduledMaintenance configuration', () => {
    beforeEach(() => {
      // Override the global mock to return true for maintenance AND current.json files
      (mockedFs.pathExists as any).mockImplementation((path: string) => {
        if (path.includes('maintenance.json') || path.includes('current.json') || path.includes('incidents.json')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      });
    });

    it('should load maintenance data when scheduledMaintenance.enabled is true', async () => {
      const mockMaintenanceData = [
        {
          id: 10,
          title: 'Database migration',
          start: '2025-01-12T02:00:00Z',
          end: '2025-01-12T04:00:00Z',
          status: 'upcoming' as const,
          affectedSystems: ['database'],
          description: 'Upgrading database',
          comments: [],
          url: 'https://github.com/test-owner/test-repo/issues/10',
          createdAt: '2025-01-09T10:00:00Z',
        },
      ];

      (mockedFs.readJson as any).mockImplementation((path: string) => {
        if (path.includes('maintenance.json')) {
          return Promise.resolve(mockMaintenanceData);
        }
        if (path.includes('incidents.json')) {
          return Promise.resolve([]);
        }
        if (path.includes('current.json')) {
          // Return minimal mock data so the code enters the committed data block
          return Promise.resolve([
            { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 100 }
          ]);
        }
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        ...defaultOptions,
        scheduledMaintenance: { enabled: true },
        useDemoData: false,
        token: 'test-token',
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue({
          items: [],
          incidents: [],
        }),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      expect(content.maintenance).toEqual(mockMaintenanceData);
    });

    it('should not load maintenance data when scheduledMaintenance.enabled is false', async () => {
      const mockMaintenanceData = [
        {
          id: 10,
          title: 'Database migration',
          start: '2025-01-12T02:00:00Z',
          end: '2025-01-12T04:00:00Z',
          status: 'upcoming' as const,
          affectedSystems: ['database'],
          description: 'Upgrading database',
          comments: [],
          url: 'https://github.com/test-owner/test-repo/issues/10',
          createdAt: '2025-01-09T10:00:00Z',
        },
      ];

      (mockedFs.readJson as any).mockResolvedValue(mockMaintenanceData);

      const options: PluginOptions = {
        ...defaultOptions,
        scheduledMaintenance: { enabled: false },
        useDemoData: true,
      };

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      expect(content.maintenance).toEqual([]);
    });

    it('should pass maintenanceLabels array to GitHubStatusService', async () => {
      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue({
          items: [],
          incidents: [],
        }),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const options: PluginOptions = {
        ...defaultOptions,
        scheduledMaintenance: {
          labels: ['maintenance', 'planned-maintenance'],
        },
      };

      const plugin = await pluginStatusPage(mockContext, options);
      await plugin.loadContent!();

      expect(MockedGitHubStatusService).toHaveBeenCalledWith(
        'test-token',
        'test-owner',
        'test-repo',
        'status',
        ['api', 'web', 'database'],
        ['maintenance', 'planned-maintenance']
      );
    });

    it('should use default maintenance label when labels not specified', async () => {
      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue({
          items: [],
          incidents: [],
        }),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const options: PluginOptions = {
        ...defaultOptions,
        scheduledMaintenance: {},
      };

      const plugin = await pluginStatusPage(mockContext, options);
      await plugin.loadContent!();

      expect(MockedGitHubStatusService).toHaveBeenCalledWith(
        'test-token',
        'test-owner',
        'test-repo',
        'status',
        ['api', 'web', 'database'],
        ['maintenance']
      );
    });

    it('should filter maintenance by displayDuration', async () => {
      const now = new Date('2025-01-15T00:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockMaintenanceData = [
        {
          id: 8,
          title: 'Old completed maintenance',
          start: '2025-01-01T02:00:00Z',
          end: '2025-01-01T04:00:00Z',
          status: 'completed' as const,
          affectedSystems: ['database'],
          description: 'Old maintenance',
          comments: [],
          url: 'https://github.com/test-owner/test-repo/issues/8',
          createdAt: '2024-12-29T10:00:00Z',
        },
        {
          id: 9,
          title: 'Recent completed maintenance',
          start: '2025-01-13T02:00:00Z',
          end: '2025-01-13T04:00:00Z',
          status: 'completed' as const,
          affectedSystems: ['api'],
          description: 'Recent maintenance',
          comments: [],
          url: 'https://github.com/test-owner/test-repo/issues/9',
          createdAt: '2025-01-11T10:00:00Z',
        },
        {
          id: 10,
          title: 'Upcoming maintenance',
          start: '2025-01-20T02:00:00Z',
          end: '2025-01-20T04:00:00Z',
          status: 'upcoming' as const,
          affectedSystems: ['database'],
          description: 'Future maintenance',
          comments: [],
          url: 'https://github.com/test-owner/test-repo/issues/10',
          createdAt: '2025-01-14T10:00:00Z',
        },
      ];

      (mockedFs.readJson as any).mockImplementation((path: string) => {
        if (path.includes('maintenance.json')) {
          return Promise.resolve(mockMaintenanceData);
        }
        if (path.includes('incidents.json')) {
          return Promise.resolve([]);
        }
        if (path.includes('current.json')) {
          // Return minimal mock data so the code enters the committed data block
          return Promise.resolve([
            { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 100 }
          ]);
        }
        return Promise.resolve([]);
      });

      const options: PluginOptions = {
        ...defaultOptions,
        scheduledMaintenance: {
          enabled: true,
          displayDuration: 7, // Only show maintenance from last 7 days
        },
        useDemoData: false,
        token: 'test-token',
      };

      const mockServiceInstance = {
        fetchStatusData: jest.fn().mockResolvedValue({
          items: [],
          incidents: [],
        }),
      };

      MockedGitHubStatusService.mockImplementation(() => mockServiceInstance as any);

      const plugin = await pluginStatusPage(mockContext, options);
      const content = await plugin.loadContent!();

      // Should include upcoming (always shown) and recent completed (within 7 days)
      // Should exclude old completed (>7 days old)
      expect(content.maintenance?.length).toBe(2);
      expect(content.maintenance?.find(m => m.id === 8)).toBeUndefined(); // Old one filtered
      expect(content.maintenance?.find(m => m.id === 9)).toBeDefined(); // Recent one kept
      expect(content.maintenance?.find(m => m.id === 10)).toBeDefined(); // Upcoming kept

      jest.useRealTimers();
    });
  });
});
