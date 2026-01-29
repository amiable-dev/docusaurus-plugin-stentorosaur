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
import type {PluginOptions, StatusData, StatusItem, SystemStatusFile, StatusIncident, ScheduledMaintenance, Entity} from './types';
import {GitHubStatusService} from './github-service';
import {getDemoStatusData, getDemoSystemFiles, getDemoCurrentJson} from './demo-data';

export {validateOptions} from './options';

/**
 * System entry in .monitorrc.json
 */
interface MonitorRcSystem {
  system: string;
  url: string;
  method?: string;
  timeout?: number;
  expectedCodes?: number[];
  maxResponseTime?: number;
  /** If false, system is monitored but not displayed on status page */
  display?: boolean;
  /** Optional display name */
  displayName?: string;
  /** Optional description */
  description?: string;
}

/**
 * .monitorrc.json schema
 */
interface MonitorRcConfig {
  systems: MonitorRcSystem[];
}

/**
 * Load entities from .monitorrc.json (ADR-003: Single Source of Truth)
 *
 * When entitiesSource is 'monitorrc' or 'hybrid', we auto-discover entities
 * from the monitoring config rather than requiring manual docusaurus.config.js updates.
 *
 * @param siteDir - Docusaurus site directory
 * @returns Array of Entity objects discovered from .monitorrc.json
 */
async function loadEntitiesFromMonitorRc(siteDir: string): Promise<Entity[]> {
  const configPath = path.join(siteDir, '.monitorrc.json');

  if (!(await fs.pathExists(configPath))) {
    console.log('[docusaurus-plugin-stentorosaur] No .monitorrc.json found, skipping auto-discovery');
    return [];
  }

  try {
    const config: MonitorRcConfig = await fs.readJson(configPath);

    if (!config.systems || !Array.isArray(config.systems)) {
      console.warn('[docusaurus-plugin-stentorosaur] .monitorrc.json has no systems array');
      return [];
    }

    // Filter out hidden systems and convert to Entity format
    const entities: Entity[] = config.systems
      .filter(sys => sys.display !== false) // Only include visible systems
      .map(sys => ({
        name: sys.system,
        displayName: sys.displayName || sys.system,
        type: 'system' as const,
        description: sys.description,
        monitoring: {
          enabled: true,
          url: sys.url,
          method: (sys.method || 'GET') as 'GET' | 'POST' | 'HEAD',
          timeout: sys.timeout,
          expectedCodes: sys.expectedCodes,
          maxResponseTime: sys.maxResponseTime,
        },
      }));

    console.log(
      `[docusaurus-plugin-stentorosaur] Auto-discovered ${entities.length} entities from .monitorrc.json`
    );

    // Log hidden systems for transparency
    const hiddenCount = config.systems.filter(sys => sys.display === false).length;
    if (hiddenCount > 0) {
      console.log(
        `[docusaurus-plugin-stentorosaur] ${hiddenCount} hidden system(s) excluded from display`
      );
    }

    return entities;
  } catch (error) {
    console.warn(
      '[docusaurus-plugin-stentorosaur] Failed to read .monitorrc.json:',
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

/**
 * Merge entities from different sources based on entitiesSource setting
 *
 * @param configEntities - Entities from docusaurus.config.js
 * @param monitorRcEntities - Entities auto-discovered from .monitorrc.json
 * @param entitiesSource - Source preference: 'config' | 'monitorrc' | 'hybrid'
 * @returns Merged entity list
 */
function mergeEntities(
  configEntities: Entity[],
  monitorRcEntities: Entity[],
  entitiesSource: 'config' | 'monitorrc' | 'hybrid'
): Entity[] {
  switch (entitiesSource) {
    case 'config':
      // Traditional mode: only use docusaurus.config.js entities
      return configEntities;

    case 'monitorrc':
      // Single source of truth: only use .monitorrc.json entities
      return monitorRcEntities;

    case 'hybrid':
      // Merge both, with config taking precedence for duplicates
      const mergedMap = new Map<string, Entity>();

      // Add monitorrc entities first
      for (const entity of monitorRcEntities) {
        mergedMap.set(entity.name, entity);
      }

      // Override with config entities (they take precedence)
      for (const entity of configEntities) {
        const existing = mergedMap.get(entity.name);
        if (existing) {
          // Deep merge: config overrides monitorrc
          mergedMap.set(entity.name, { ...existing, ...entity });
        } else {
          mergedMap.set(entity.name, entity);
        }
      }

      return Array.from(mergedMap.values());

    default:
      return configEntities;
  }
}

/**
 * Check for entity mismatches and warn (ADR-003)
 */
function checkEntityMismatches(
  configEntities: Entity[],
  monitorRcEntities: Entity[],
  entitiesSource: 'config' | 'monitorrc' | 'hybrid'
): void {
  // Only warn in config mode when there are monitorrc entities not in config
  if (entitiesSource === 'config' && monitorRcEntities.length > 0) {
    const configNames = new Set(configEntities.map(e => e.name));
    const missingInConfig = monitorRcEntities.filter(e => !configNames.has(e.name));

    if (missingInConfig.length > 0) {
      console.warn(
        `\n⚠️  [docusaurus-plugin-stentorosaur] Entity mismatch detected!`
      );
      console.warn(
        `   Found ${missingInConfig.length} system(s) in .monitorrc.json not in docusaurus.config.js:`
      );
      for (const entity of missingInConfig) {
        console.warn(`     - ${entity.name}`);
      }
      console.warn(
        `\n   These systems will be monitored but NOT displayed on the status page.`
      );
      console.warn(
        `   To fix, either:`
      );
      console.warn(
        `     1. Add these to docusaurus.config.js entities array`
      );
      console.warn(
        `     2. Use entitiesSource: 'monitorrc' for auto-discovery`
      );
      console.warn(
        `     3. Add display: false to hide them intentionally\n`
      );
    }
  }
}

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
          history: data.history, // Include history for mini heatmap
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
 * Convert compact readings from current.json to SystemStatusFile format
 */
function convertReadingsToSystemFiles(readings: any[]): SystemStatusFile[] {
  // Group readings by system
  const systemMap = new Map<string, any[]>();
  for (const reading of readings) {
    if (!systemMap.has(reading.svc)) {
      systemMap.set(reading.svc, []);
    }
    systemMap.get(reading.svc)!.push(reading);
  }
  
  const systemFiles: SystemStatusFile[] = [];
  
  for (const [systemName, systemReadings] of systemMap.entries()) {
    // Sort by timestamp (most recent first)
    systemReadings.sort((a, b) => b.t - a.t);
    
    const latest = systemReadings[0];
    
    // Convert to StatusCheckHistory format
    const history = systemReadings.map(r => ({
      timestamp: new Date(r.t).toISOString(),
      status: r.state,
      responseTime: r.state === 'up' && r.code >= 200 && r.code < 300 ? r.lat : 0,
      code: r.code,
    }));
    
    // Calculate uptime percentage
    const upReadings = systemReadings.filter(r => r.state === 'up').length;
    const uptime = systemReadings.length > 0 ? (upReadings / systemReadings.length) * 100 : 0;
    
    // Calculate average response time from successful readings only
    const successfulReadings = systemReadings.filter(r => r.state === 'up' && r.code >= 200 && r.code < 300);
    const avgResponseTime = successfulReadings.length > 0
      ? Math.round(successfulReadings.reduce((sum: number, r: any) => sum + r.lat, 0) / successfulReadings.length)
      : undefined;
    
    systemFiles.push({
      name: systemName,
      url: '', // URL not stored in compact format
      currentStatus: latest.state,
      lastChecked: new Date(latest.t).toISOString(),
      history,
      uptime: `${(Math.round(uptime * 100) / 100).toFixed(2)}%`,
      uptimeDay: `${(Math.round(uptime * 100) / 100).toFixed(2)}%`,
      timeDay: avgResponseTime,
    });
  }
  
  return systemFiles;
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
  const {siteConfig, generatedFilesDir, siteDir} = context;
  
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
    entities: configEntities = [],
    entitiesSource = 'config',
    labelScheme,
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
    scheduledMaintenance = { enabled: true, label: 'maintenance' },
  } = options;

  // Build maintenance labels array from config
  const maintenanceLabels = scheduledMaintenance.labels ||
    (scheduledMaintenance.label ? [scheduledMaintenance.label] : ['maintenance']);

  // Load entities based on entitiesSource setting (ADR-003)
  let entities: Entity[] = configEntities;
  if (entitiesSource === 'monitorrc' || entitiesSource === 'hybrid') {
    const monitorRcEntities = await loadEntitiesFromMonitorRc(siteDir);
    entities = mergeEntities(configEntities, monitorRcEntities, entitiesSource);

    // Check for mismatches and warn
    checkEntityMismatches(configEntities, monitorRcEntities, entitiesSource);
  } else if (entitiesSource === 'config') {
    // Even in config mode, check for mismatches to warn users
    const monitorRcEntities = await loadEntitiesFromMonitorRc(siteDir);
    if (monitorRcEntities.length > 0) {
      checkEntityMismatches(configEntities, monitorRcEntities, entitiesSource);
    }
  }

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
      let items: StatusItem[] = [];
      let incidents: StatusIncident[] = [];
      let maintenance: ScheduledMaintenance[] = [];
      let shouldUseDemoData = useDemoData ?? !token;

      // If useDemoData is explicitly true, skip committed data and use demo data
      if (useDemoData === true) {
        console.log('[docusaurus-plugin-stentorosaur] Using demo data (useDemoData=true)');
        const demoData = getDemoStatusData();
        items = showServices ? demoData.items : [];
        incidents = showIncidents ? demoData.incidents : [];
        maintenance = (scheduledMaintenance.enabled !== false) ? (demoData.maintenance || []) : [];
        
        const statusData: StatusData = {
          items,
          incidents: incidents.slice(0, 20), // Limit to most recent 20 incidents
          maintenance,
          lastUpdated: new Date().toISOString(),
          showServices,
          showIncidents,
          showPerformanceMetrics,
          useDemoData: true,
          fetchUrl: options.fetchUrl,
          statusCardLayout: options.statusCardLayout,
        };

        // Ensure directory exists
        await fs.ensureDir(statusDataDir);
        
        // Write status data to file
        await fs.writeJson(statusDataPath, statusData, {spaces: 2});

        return statusData;
      }

      // First, try to read committed status data (new format: current.json with time-series)
      const committedCurrentFile = path.join(context.siteDir, 'status-data', 'current.json');
      let useCommittedData = false;
      
      if (await fs.pathExists(committedCurrentFile)) {
        try {
          const currentData = await fs.readJson(committedCurrentFile);
          
          // Validate it's an array of readings
          if (Array.isArray(currentData) && currentData.length > 0) {
            console.log(
              `[docusaurus-plugin-stentorosaur] Found current.json with ${currentData.length} readings, aggregating...`
            );
            
            // Group readings by system
            const systemMap = new Map<string, any[]>();
            for (const reading of currentData) {
              if (!systemMap.has(reading.svc)) {
                systemMap.set(reading.svc, []);
              }
              systemMap.get(reading.svc)!.push(reading);
            }
            
            // Calculate stats for each system
            // Filter to only include systems that are in the entities configuration (Issue #62)
            const configuredSystemNames = new Set(
              entities.map(e => e.name.toLowerCase())
            );

            items = [];
            for (const [systemName, readings] of systemMap.entries()) {
              // Skip systems not in the entities configuration
              if (configuredSystemNames.size > 0 && !configuredSystemNames.has(systemName.toLowerCase())) {
                continue;
              }

              // Sort by timestamp (most recent first)
              readings.sort((a, b) => b.t - a.t);
              
              const latest = readings[0];
              
              // Calculate uptime (percentage of 'up' readings)
              const upReadings = readings.filter(r => r.state === 'up').length;
              const uptime = readings.length > 0 ? (upReadings / readings.length) * 100 : 0;
              
              // Calculate average response time (ONLY from successful 'up' readings)
              const successfulReadings = readings.filter(r => r.state === 'up' && r.code >= 200 && r.code < 300);
              const avgResponseTime = successfulReadings.length > 0
                ? Math.round(successfulReadings.reduce((sum: number, r: any) => sum + r.lat, 0) / successfulReadings.length)
                : undefined;
              
              items.push({
                name: systemName,
                status: latest.state,
                lastChecked: new Date(latest.t).toISOString(),
                responseTime: avgResponseTime,
                uptime: `${(Math.round(uptime * 100) / 100).toFixed(2)}%`,
                incidentCount: 0,
                history: readings.map(r => ({
                  timestamp: new Date(r.t).toISOString(),
                  status: r.state,
                  code: r.code,
                  responseTime: r.lat,
                  latency: r.lat,
                  error: r.err,
                })),
              });
            }
            
            useCommittedData = true;
            
            // Try to read committed incidents.json (written by status-update.yml)
            const committedIncidentsFile = path.join(context.siteDir, 'status-data', 'incidents.json');
            if (await fs.pathExists(committedIncidentsFile)) {
              try {
                const committedIncidents = await fs.readJson(committedIncidentsFile);
                if (Array.isArray(committedIncidents)) {
                  incidents = showIncidents ? committedIncidents : [];
                  console.log(`[docusaurus-plugin-stentorosaur] Loaded ${incidents.length} incidents from incidents.json`);
                }
              } catch (error) {
                console.warn(
                  '[docusaurus-plugin-stentorosaur] Failed to read incidents.json:',
                  error instanceof Error ? error.message : String(error)
                );
              }
            }
            
            // Try to read committed maintenance.json (written by status-update.yml)
            // Only load if scheduledMaintenance is enabled
            if (scheduledMaintenance.enabled !== false) {
              const committedMaintenanceFile = path.join(context.siteDir, 'status-data', 'maintenance.json');
              if (await fs.pathExists(committedMaintenanceFile)) {
                try {
                  const committedMaintenance = await fs.readJson(committedMaintenanceFile);
                  if (Array.isArray(committedMaintenance)) {
                    maintenance = committedMaintenance;
                    console.log(`[docusaurus-plugin-stentorosaur] Loaded ${maintenance.length} maintenance windows from maintenance.json`);
                  }
                } catch (error) {
                  console.warn(
                    '[docusaurus-plugin-stentorosaur] Failed to read maintenance.json:',
                    error instanceof Error ? error.message : String(error)
                  );
                }
              }
            } else {
              console.log('[docusaurus-plugin-stentorosaur] Scheduled maintenance disabled (scheduledMaintenance.enabled=false)');
            }
            
            // Only fetch from GitHub API if we don't have incidents/maintenance from files
            if (token && !shouldUseDemoData && incidents.length === 0) {
              try {
                const service = new GitHubStatusService(
                  token,
                  owner,
                  repo,
                  statusLabel,
                  entities,
                  labelScheme,
                  maintenanceLabels
                );
                const result = await service.fetchStatusData();
                incidents = showIncidents ? result.incidents : [];
                console.log(`[docusaurus-plugin-stentorosaur] Fetched ${incidents.length} incidents from GitHub`);
              } catch (error) {
                console.warn(
                  '[docusaurus-plugin-stentorosaur] Failed to fetch incidents from GitHub:',
                  error instanceof Error ? error.message : String(error)
                );
              }
            }
          }
        } catch (error) {
          console.warn(
            '[docusaurus-plugin-stentorosaur] Failed to read current.json:',
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
          maintenance = (scheduledMaintenance.enabled !== false) ? (demoData.maintenance || []) : [];
        } else {
          try {
            console.log('[docusaurus-plugin-stentorosaur] Fetching fresh status data from GitHub API');
            const service = new GitHubStatusService(
              token,
              owner,
              repo,
              statusLabel,
              entities,
              labelScheme,
              maintenanceLabels
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
                    uptime: systemData.uptime,
                    history: systemData.history, // Include history for mini heatmap
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
                    uptime: systemData.uptime,
                    history: systemData.history, // Include history for mini heatmap
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
              maintenance = (scheduledMaintenance.enabled !== false) ? (demoData.maintenance || []) : [];
            }
          } catch (error) {
            console.warn(
              '[docusaurus-plugin-stentorosaur] Failed to fetch from GitHub, using demo data:',
              error instanceof Error ? error.message : String(error)
            );
            const demoData = getDemoStatusData();
            items = showServices ? demoData.items : [];
            incidents = showIncidents ? demoData.incidents : [];
            maintenance = (scheduledMaintenance.enabled !== false) ? (demoData.maintenance || []) : [];
          }
        }
      }

      // Apply displayDuration filter to maintenance if configured
      if (scheduledMaintenance.displayDuration && maintenance.length > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - scheduledMaintenance.displayDuration);
        const cutoffTime = cutoffDate.getTime();

        const originalCount = maintenance.length;
        maintenance = maintenance.filter(m => {
          // Keep all upcoming and in-progress maintenance
          if (m.status === 'upcoming' || m.status === 'in-progress') {
            return true;
          }
          // For completed maintenance, check if within displayDuration
          if (m.status === 'completed') {
            const endTime = new Date(m.end).getTime();
            return endTime >= cutoffTime;
          }
          return true;
        });

        const filteredCount = originalCount - maintenance.length;
        if (filteredCount > 0) {
          console.log(
            `[docusaurus-plugin-stentorosaur] Filtered ${filteredCount} completed maintenance window(s) older than ${scheduledMaintenance.displayDuration} days`
          );
        }
      }

      const statusData: StatusData = {
        items,
        incidents: incidents.slice(0, 20), // Limit to most recent 20 incidents
        maintenance,
        lastUpdated: new Date().toISOString(),
        showServices,
        showIncidents,
        showPerformanceMetrics,
        useDemoData: shouldUseDemoData,
        fetchUrl: options.fetchUrl,
        statusCardLayout: options.statusCardLayout,
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

      // Determine which status page component to use
      const statusView = options.statusView || 'default';
      const statusPageComponent = statusView === 'upptime' 
        ? '@theme/UptimeStatusPage' 
        : '@theme/StatusPage';

      // Add status page route
      addRoute({
        path: normalizeUrl([baseUrl, 'status']),
        component: statusPageComponent,
        exact: true,
        modules: {
          statusData: statusDataId,
        },
        // Metadata for better route management (e.g., sitemap lastmod)
        metadata: {
          lastUpdatedAt: new Date(content.lastUpdated).getTime(),
        },
      });

      // Add StatusHistory routes for each system
      const systemsToRoute = content.items.map(item => ({
        name: item.name,
        slug: item.name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-'),
      }));
      
      systemsToRoute.forEach(({name, slug}) => {
        addRoute({
          path: normalizeUrl([baseUrl, 'status', 'history', slug]),
          component: '@theme/StatusHistory',
          exact: true,
        });
      });
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
      
      // Copy current.json and archives if they exist (from monitoring workflow)
      const sourceDataDir = path.join(siteDir, dataPath);
      const sourceCurrentJson = path.join(sourceDataDir, 'current.json');
      const sourceArchives = path.join(sourceDataDir, 'archives');
      
      if (await fs.pathExists(sourceCurrentJson)) {
        console.log('[docusaurus-plugin-stentorosaur] Copying current.json from monitoring data');
        await fs.copy(
          sourceCurrentJson,
          path.join(buildStatusDir, 'current.json')
        );
        
        // Generate system/*.json files from current.json for StatusHistory pages
        try {
          const currentData = await fs.readJson(sourceCurrentJson);
          if (Array.isArray(currentData) && currentData.length > 0) {
            console.log('[docusaurus-plugin-stentorosaur] Generating system files from current.json');
            const systemFiles = convertReadingsToSystemFiles(currentData);
            
            for (const systemFile of systemFiles) {
              const fileName = systemFile.name
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                + '.json';
              const filePath = path.join(buildSystemsDir, fileName);
              await fs.writeJson(filePath, systemFile, {spaces: 2});
            }
            console.log(`[docusaurus-plugin-stentorosaur] Generated ${systemFiles.length} system files`);
          }
        } catch (error) {
          console.warn('[docusaurus-plugin-stentorosaur] Failed to generate system files from current.json:', error);
        }
      }
      
      if (await fs.pathExists(sourceArchives)) {
        console.log('[docusaurus-plugin-stentorosaur] Copying archives from monitoring data');
        await fs.copy(
          sourceArchives,
          path.join(buildStatusDir, 'archives')
        );
      }

      // Copy daily-summary.json if it exists (needed for minimal layout UptimeBar)
      const sourceDailySummary = path.join(sourceDataDir, 'daily-summary.json');
      if (await fs.pathExists(sourceDailySummary)) {
        console.log('[docusaurus-plugin-stentorosaur] Copying daily-summary.json for minimal layout');
        await fs.copy(
          sourceDailySummary,
          path.join(buildStatusDir, 'daily-summary.json')
        );
      }

      // Copy incidents.json if it exists
      const sourceIncidents = path.join(sourceDataDir, 'incidents.json');
      if (await fs.pathExists(sourceIncidents)) {
        console.log('[docusaurus-plugin-stentorosaur] Copying incidents.json');
        await fs.copy(
          sourceIncidents,
          path.join(buildStatusDir, 'incidents.json')
        );
      }

      // Copy maintenance.json if it exists
      const sourceMaintenance = path.join(sourceDataDir, 'maintenance.json');
      if (await fs.pathExists(sourceMaintenance)) {
        console.log('[docusaurus-plugin-stentorosaur] Copying maintenance.json');
        await fs.copy(
          sourceMaintenance,
          path.join(buildStatusDir, 'maintenance.json')
        );
      }

      // If using demo data, write demo system files with historical data for charts
      let shouldUseDemoData = useDemoData ?? !token;
      if (shouldUseDemoData) {
        console.log('[docusaurus-plugin-stentorosaur] Writing demo system files with historical data');
        const demoSystemFiles = getDemoSystemFiles();
        
        // Write current.json (new format) - only if not already copied from monitoring
        if (!(await fs.pathExists(path.join(buildStatusDir, 'current.json')))) {
          const currentJsonData = getDemoCurrentJson();
          await fs.writeJson(
            path.join(buildStatusDir, 'current.json'),
            currentJsonData,
            {spaces: 2}
          );
        }
        
        // Write legacy systems/*.json files for backward compatibility
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
