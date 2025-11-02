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
import type {PluginOptions, StatusData, StatusItem, SystemStatusFile} from './types';
import {GitHubStatusService} from './github-service';
import {getDemoStatusData} from './demo-data';

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

      // Use demo data if explicitly requested or no token provided
      if (shouldUseDemoData) {
        const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
        
        if (isCI && !token && useDemoData !== true) {
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
            incidents = showIncidents ? demoData.incidents : [];;
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

      const statusData: StatusData = {
        items,
        incidents: incidents.slice(0, 20), // Limit to most recent 20 incidents
        lastUpdated: new Date().toISOString(),
        showServices,
        showIncidents,
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
    },

    async postBuild({outDir}) {
      // Copy status data to build output for client-side access
      const buildStatusDir = path.join(outDir, dataPath);
      await fs.ensureDir(buildStatusDir);
      
      if (await fs.pathExists(statusDataPath)) {
        await fs.copy(
          statusDataPath,
          path.join(buildStatusDir, 'status.json')
        );
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
