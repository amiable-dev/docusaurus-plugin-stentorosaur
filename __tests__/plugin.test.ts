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
        ['api', 'web', 'database']
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
});
