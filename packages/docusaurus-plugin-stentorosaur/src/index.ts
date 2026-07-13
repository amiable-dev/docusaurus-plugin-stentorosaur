/**
 * docusaurus-plugin-stentorosaur — status dashboards for Docusaurus.
 *
 * v1.0 (ADR-005): ONE read path. The plugin reads `status/v1/summary.json`
 * — from `dataUrl` at build time, or from a local checkout under
 * `dataPath` — validates it against the versioned schema, and registers
 * the route. All monitoring, GitHub-issue sync, and data-branch writes
 * live in @stentorosaur/probe (the `stentorosaur` CLI); all transforms
 * live in @stentorosaur/core. loadContent is read + validate + register.
 */

import path from 'path';
import fs from 'fs-extra';
import {normalizeUrl} from '@docusaurus/utils';
import {parseSummary} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';
import type {LoadContext, Plugin} from '@docusaurus/types';
import type {PluginOptions, StatusData} from './types';
import {summaryToStatusData} from './v1/summary-adapter';

export {validateOptions} from './options';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PLUGIN_VERSION: string = require('../package.json').version;

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

async function loadV1Summary(
  siteDir: string,
  dataPath: string,
  dataUrl: string | undefined
): Promise<StatusSummary> {
  if (dataUrl && /^https?:\/\//.test(dataUrl)) {
    try {
      // Bounded: a hanging endpoint must not block the site build.
      const response = await fetch(dataUrl, {
        headers: {accept: 'application/json'},
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const summary = parseSummary(JSON.parse(await response.text()));
      console.log('[docusaurus-plugin-stentorosaur] Loaded status/v1 summary from dataUrl');
      return summary;
    } catch (error) {
      console.warn(
        '[docusaurus-plugin-stentorosaur] dataUrl fetch failed, trying local snapshot:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const localV1 = path.join(siteDir, dataPath, 'status', 'v1', 'summary.json');
  if (await fs.pathExists(localV1)) {
    const summary = parseSummary(await fs.readJson(localV1));
    console.log('[docusaurus-plugin-stentorosaur] Loaded local status/v1 summary');
    return summary;
  }

  throw new Error(
    '[docusaurus-plugin-stentorosaur] No status/v1 data found. Either set the ' +
      "plugin's `dataUrl` to your served summary.json (see the migration " +
      'guide), or check out the data branch so ' +
      `${dataPath}/status/v1/summary.json exists at build time. New site? ` +
      "Run `npx -p @stentorosaur/probe stentorosaur init`, then `probe`. " +
      'Upgrading from 0.x? Run `stentorosaur migrate`.'
  );
}

export default async function pluginStatus(
  context: LoadContext,
  options: PluginOptions
): Promise<Plugin<StatusData>> {
  const {siteConfig, generatedFilesDir, siteDir} = context;

  const owner = options.owner || siteConfig.organizationName;
  const repo = options.repo || siteConfig.projectName;

  const {
    dataPath = 'status-data',
    title = 'System Status',
    description = 'Current status of our systems and services',
    showServices = true,
    showIncidents = true,
    showPerformanceMetrics = true,
  } = options;

  const statusDataDir = path.join(generatedFilesDir, 'docusaurus-plugin-stentorosaur');

  return {
    name: 'docusaurus-plugin-stentorosaur',

    getThemePath() {
      return '../lib/theme';
    },

    getTypeScriptThemePath() {
      return '../src/theme';
    },

    async loadContent() {
      const summary = await loadV1Summary(siteDir, dataPath, options.dataUrl);
      const repoUrl = owner && repo ? `https://github.com/${owner}/${repo}` : '';
      const runtimeDataUrl = options.dataUrl
        ? /^https?:\/\//.test(options.dataUrl)
          ? options.dataUrl
          : normalizeUrl([siteConfig.baseUrl, options.dataUrl])
        : normalizeUrl([siteConfig.baseUrl, dataPath, 'status/v1/summary.json']);

      const statusData: StatusData = {
        ...summaryToStatusData(summary, {repoUrl, entityDisplay: options.entities}),
        title,
        description,
        showServices,
        showIncidents,
        showPerformanceMetrics,
        statusCardLayout: options.statusCardLayout,
        uptimeConfig: options.uptimeConfig,
        pluginVersion: PLUGIN_VERSION,
        v1Summary: summary,
        dataUrl: runtimeDataUrl,
        repoUrl,
      };

      await fs.ensureDir(statusDataDir);
      await fs.writeJson(path.join(statusDataDir, 'status.json'), statusData, {spaces: 2});
      return statusData;
    },

    async contentLoaded({content, actions}) {
      const {addRoute, createData} = actions;
      const {baseUrl} = siteConfig;

      const statusDataId = await createData(
        'status-data.json',
        JSON.stringify(content, null, 2)
      );

      const statusPageComponent =
        options.statusView === 'upptime' ? '@theme/UptimeStatusPage' : '@theme/StatusPage';

      addRoute({
        path: normalizeUrl([baseUrl, 'status']),
        component: statusPageComponent,
        exact: true,
        modules: {statusData: statusDataId},
        metadata: {lastUpdatedAt: new Date(content.lastUpdated).getTime()},
      });
    },

    async postBuild({outDir}) {
      // Publish the build-time snapshot of status/v1 with the site, so
      // clients on snapshot-only deployments (no dataUrl/Pages data
      // branch) can still fetch entity details and refresh the summary.
      const sourceV1 = path.join(siteDir, dataPath, 'status', 'v1');
      if (await fs.pathExists(sourceV1)) {
        await fs.copy(sourceV1, path.join(outDir, dataPath, 'status', 'v1'));
        console.log('[docusaurus-plugin-stentorosaur] Copied status/v1 snapshot to build output');
      }
    },
  };
}

export {type PluginOptions} from './types';
