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
import type {PluginOptions, StatusData} from './types';
import {GitHubStatusService} from './github-service';
import {getDemoStatusData} from './demo-data';

export {validateOptions} from './options';

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
    },

    getPathsToWatch() {
      // Watch the status data directory
      return [path.join(dataPath, '**/*.{json,yml,yaml}')];
    },
  };
}

export {type PluginOptions} from './types';
