/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import {normalizeUrl} from '@docusaurus/utils';
import type {LoadContext, Plugin} from '@docusaurus/types';
import type{PluginOptions, StatusData, StatusItem, SystemStatusFile} from './types';
import {GitHubStatusService} from './github-service';
import {getDemoStatusData, getDemoSystemFiles} from './demo-data';

export {validateOptions} from './options';

/**
 * Read system status files and calculate metrics
 */
async function readSystemFiles(systemsDir: string): Promise<Partial<StatusItem>[]> {
  try {
    if (!(await fs.pathExists(systemsDir))) {
      return [];
    }

    const files = await fs.readdir(systemsDir);
    if (!files || !Array.isArray(files)) {
      return [];
    }
    
    const systemFiles = files.filter(f => f.endsWith('.json') && f !== 'example-api.json');
    
    const systemData: Partial<StatusItem>[] = [];
    
    for (const file of systemFiles) {
      try {
        const filePath = path.join(systemsDir, file);
        const data: SystemStatusFile = await fs.readJson(filePath);
        
        // Calculate average response time from recent history (fallback if timeDay not set)
        let avgResponseTime: number | undefined;
        
        // Prefer calculated time-window averages
        if (data.timeDay !== undefined && data.timeDay > 0) {
          avgResponseTime = data.timeDay;
        } else if (data.history && data.history.length > 0) {
          // Fallback: calculate from recent history
          const recentChecks = data.history.slice(0, 10); // Last 10 checks
          const sum = recentChecks.reduce((acc, check) => acc + check.responseTime, 0);
          avgResponseTime = Math.round(sum / recentChecks.length);
        }
        
        systemData.push({
          name: data.name,
          status: data.currentStatus,
          lastChecked: data.lastChecked,
          responseTime: avgResponseTime,
          uptime: data.uptime || data.uptimeDay, // Prefer all-time, fallback to 24h
        });
      } catch (error) {
        console.warn(`Failed to read system file ${file}:`, error);
      }
    }
    
    return systemData;
  } catch (error) {
    console.warn('Failed to read system files:', error);
    return [];
  }
}

/**
 * Returns a list of components that can be swizzled/ejected for customization.
 * Docusaurus uses this to provide better swizzle command support.
 */
export function getSwizzleComponentList(): string[] {
  return [
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
  ];
}

export default async function pluginStatus(
  context: LoadContext,
  options: PluginOptions
): Promise<Plugin<StatusData>> {
  const {siteConfig, generatedFilesDir} = context;
  
  // Use site config values as defaults
  const owner = options.owner || siteConfig.organizationName;
  const repo = options.repo || siteConfig.projectName;

  if (!owner || !repo) {
    throw new Error(
      'docusaurus-plugin-stentorosaur requires either plugin options (owner, repo) or ' +
        'site config (organizationName, projectName) to be set'
    );
  }

  const {
    statusLabel = 'status',
    systemLabels = [],
    token,
    dataPath = 'status-data',
    title = 'System Status',
    description = 'Current status of our systems and services',
    showResponseTimes = true,
    showUptime = true,
    useDemoData,
    showServices = true,
    showIncidents = true,
    showPerformanceMetrics = true,
  } = options;

  const statusDataDir = path.join(generatedFilesDir, 'docusaurus-plugin-stentorosaur');
  const statusDataPath = path.join(statusDataDir, 'status.json');

  return {
    name: 'docusaurus-plugin-stentorosaur',

    getThemePath() {
      return '../lib/theme';
    },

    getTypeScriptThemePath() {
      return '../src/theme';
    },

    async loadContent() {
      let items;
      let incidents;
      let shouldUseDemoData = useDemoData ?? !token;

      // If useDemoData is explicitly true, skip committed data and use demo data
      if (useDemoData === true) {
        console.log('[docusaurus-plugin-stentorosaur] Using demo data (useDemoData=true)');
        const demoData = getDemoStatusData();
        items = showServices ? demoData.items : [];
        incidents = showIncidents ? demoData.incidents : [];
        
        const statusData: StatusData = {
          items,
          incidents: incidents.slice(0, 20), // Limit to most recent 20 incidents
          lastUpdated: new Date().toISOString(),
          showServices,
          showIncidents,
          showPerformanceMetrics,
        };

        // Ensure directory exists
        await fs.ensureDir(statusDataDir);
        
        // Write status data to file
        await fs.writeJson(statusDataPath, statusData, {spaces: 2});

        return statusData;
      }

      // First, try to read committed status data (Upptime-style)
      const committedStatusFile = path.join(context.siteDir, 'build', 'status-data', 'status.json');
      let useCommittedData = false;
      
      if (await fs.pathExists(committedStatusFile)) {
        try {
          const committedData = await fs.readJson(committedStatusFile);
          const dataAge = Date.now() - new Date(committedData.lastUpdated).getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
          
          if (dataAge < maxAge) {
            console.log(
              `[docusaurus-plugin-stentorosaur] Using committed status data (age: ${Math.round(dataAge / 1000 / 60)} minutes)`
            );
            items = showServices ? committedData.items : [];
            incidents = showIncidents ? committedData.incidents : [];
            useCommittedData = true;
          } else {
            console.log(
              `[docusaurus-plugin-stentorosaur] Committed status data is stale (age: ${Math.round(dataAge / 1000 / 60 / 60)} hours), fetching fresh data`
            );
          }
        } catch (error) {
          console.warn(
            '[docusaurus-plugin-stentorosaur] Failed to read committed status data:',
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      // If we didn't use committed data, fetch from GitHub or use demo data
      if (!useCommittedData) {
        // Use demo data if explicitly requested or no token provided
        if (shouldUseDemoData) {
          const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
          
          if (isCI && !token && (useDemoData === undefined || useDemoData === false)) {
            console.warn(
              '\n⚠️  [docusaurus-plugin-stentorosaur] GITHUB_TOKEN not found in CI environment.\n' +
              '   Your production site will show DEMO DATA instead of real status.\n' +
              '   \n' +
              '   Fix: Add this to your build step in .github/workflows/deploy.yml:\n' +
              '   \n' +
              '   - name: Build website\n' +
              '     env:\n' +
              '       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n' +
              '     run: npm run build\n'
            );
          }
          
          console.log(
            useDemoData 
              ? '[docusaurus-plugin-stentorosaur] Using demo data (useDemoData=true)'
              : '[docusaurus-plugin-stentorosaur] No GitHub token provided, using demo data'
          );
          const demoData = getDemoStatusData();
          items = showServices ? demoData.items : [];
          incidents = showIncidents ? demoData.incidents : [];
        } else {
          try {
            console.log('[docusaurus-plugin-stentorosaur] Fetching fresh status data from GitHub API');
            const service = new GitHubStatusService(
              token,
              owner,
              repo,
              statusLabel,
              systemLabels
            );

            const result = await service.fetchStatusData();
            items = showServices ? result.items : [];
            incidents = showIncidents ? result.incidents : [];
            
            // Enhance items with data from system files
            const systemsDir = path.join(context.siteDir, dataPath, 'systems');
            const systemFileData = await readSystemFiles(systemsDir);
            
            if (systemFileData.length > 0) {
              // Merge system file data with GitHub issue data
              const systemDataMap = new Map(
                systemFileData.map(s => [s.name, s])
              );
              
              items = items.map(item => {
                const systemData = systemDataMap.get(item.name);
                if (systemData) {
                  return {
                    ...item,
                    responseTime: systemData.responseTime,
                    lastChecked: systemData.lastChecked,
                  };
                }
                return item;
              });
              
              // Add systems that are only in files (not in GitHub issues)
              for (const systemData of systemFileData) {
                if (!items.some(item => item.name === systemData.name)) {
                  items.push({
                    name: systemData.name || 'Unknown',
                    status: systemData.status || 'up',
                    lastChecked: systemData.lastChecked,
                    responseTime: systemData.responseTime,
                    incidentCount: 0,
                  });
                }
              }
            }
            
            // If no real data found and demo data not explicitly disabled, use demo data
            if (items.length === 0 && incidents.length === 0 && useDemoData !== false) {
              console.log('[docusaurus-plugin-stentorosaur] No GitHub issues found, using demo data');
              const demoData = getDemoStatusData();
              items = showServices ? demoData.items : [];
              incidents = showIncidents ? demoData.incidents : [];
            }
          } catch (error) {
            console.warn(
              '[docusaurus-plugin-stentorosaur] Failed to fetch from GitHub, using demo data:',
              error instanceof Error ? error.message : String(error)
            );
            const demoData = getDemoStatusData();
            items = showServices ? demoData.items : [];
            incidents = showIncidents ? demoData.incidents : [];
          }
        }
      }

      const statusData: StatusData = {
        items,
        incidents: incidents.slice(0, 20), // Limit to most recent 20 incidents
        lastUpdated: new Date().toISOString(),
        showServices,
        showIncidents,
        showPerformanceMetrics,
        useDemoData: shouldUseDemoData,
      };

      // Ensure directory exists
      await fs.ensureDir(statusDataDir);
      
      // Write status data to file
      await fs.writeJson(statusDataPath, statusData, {spaces: 2});

      return statusData;
    },

    async contentLoaded({content, actions}) {
      const {addRoute, createData} = actions;
      const {baseUrl} = siteConfig;

      // Create data file for the status page
      const statusDataId = await createData(
        'status-data.json',
        JSON.stringify(content, null, 2)
      );

      // Add status page route
      addRoute({
        path: normalizeUrl([baseUrl, 'status']),
        component: '@theme/StatusPage',
        exact: true,
        modules: {
          statusData: statusDataId,
        },
        // Metadata for better route management (e.g., sitemap lastmod)
        metadata: {
          lastUpdatedAt: new Date(content.lastUpdated).getTime(),
        },
      });

      // Add StatusHistory routes for each system (if demo data)
      let shouldUseDemoData = useDemoData ?? !token;
      if (shouldUseDemoData) {
        const demoSystemFiles = getDemoSystemFiles();
        demoSystemFiles.forEach(systemFile => {
          const systemSlug = systemFile.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
          
          addRoute({
            path: normalizeUrl([baseUrl, 'status', 'history', systemSlug]),
            component: '@theme/StatusHistory',
            exact: true,
          });
        });
      }
    },

    async postBuild({outDir}) {
      // Copy status data to build output for client-side access
      const buildStatusDir = path.join(outDir, dataPath);
      const buildSystemsDir = path.join(buildStatusDir, 'systems');
      await fs.ensureDir(buildStatusDir);
      await fs.ensureDir(buildSystemsDir);
      
      if (await fs.pathExists(statusDataPath)) {
        await fs.copy(
          statusDataPath,
          path.join(buildStatusDir, 'status.json')
        );
      }
      
      // If using demo data, write demo system files with historical data for charts
      let shouldUseDemoData = useDemoData ?? !token;
      if (shouldUseDemoData) {
        console.log('[docusaurus-plugin-stentorosaur] Writing demo system files with historical data');
        const demoSystemFiles = getDemoSystemFiles();
        
        for (const systemFile of demoSystemFiles) {
          // Sanitize filename: remove special chars, replace spaces with hyphens
          const fileName = systemFile.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            + '.json';
          const filePath = path.join(buildSystemsDir, fileName);
          await fs.writeJson(filePath, systemFile, {spaces: 2});
        }
      }
      
      // Always write .gitkeep to ensure directory is tracked by git
      await fs.writeFile(path.join(buildStatusDir, '.gitkeep'), '');
    },

    getPathsToWatch() {
      // Watch the status data directory
      return [path.join(dataPath, '**/*.{json,yml,yaml}')];
    },
  };
}

export {type PluginOptions} from './types';
