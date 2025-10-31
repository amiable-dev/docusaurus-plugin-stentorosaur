#!/usr/bin/env node

/**
 * Script to manually update status data from GitHub Issues
 * 
 * Usage:
 *   node scripts/update-status.js
 * 
 * Environment variables:
 *   GITHUB_TOKEN - GitHub personal access token
 *   GITHUB_OWNER - Repository owner (default: from config)
 *   GITHUB_REPO - Repository name (default: from config)
 */

const fs = require('fs-extra');
const path = require('path');
const {Octokit} = require('@octokit/rest');

async function updateStatus() {
  // Load configuration
  let config;
  try {
    // Try to load from Docusaurus config
    const configPath = path.join(process.cwd(), 'docusaurus.config.js');
    if (fs.existsSync(configPath)) {
      const docusaurusConfig = require(configPath);
      const pluginConfig = docusaurusConfig.plugins?.find(
        p => Array.isArray(p) && p[0] === 'docusaurus-plugin-status'
      );
      config = pluginConfig?.[1] || {};
    }
  } catch (error) {
    console.warn('Could not load Docusaurus config, using environment variables');
    config = {};
  }

  const owner = process.env.GITHUB_OWNER || config.owner;
  const repo = process.env.GITHUB_REPO || config.repo;
  const token = process.env.GITHUB_TOKEN || config.token;
  const statusLabel = config.statusLabel || 'status';
  const systemLabels = config.systemLabels || [];
  const dataPath = config.dataPath || 'status-data';

  if (!owner || !repo) {
    console.error('ERROR: GitHub owner and repo must be specified');
    console.error('Set GITHUB_OWNER and GITHUB_REPO environment variables');
    process.exit(1);
  }

  console.log(`Fetching status from ${owner}/${repo}...`);

  // Initialize GitHub client
  const octokit = new Octokit({auth: token});

  try {
    // Fetch status issues
    const {data: issues} = await octokit.issues.listForRepo({
      owner,
      repo,
      labels: statusLabel,
      state: 'all',
      per_page: 100,
    });

    console.log(`Found ${issues.length} status issues`);

    // Process incidents
    const incidents = issues.map(issue => {
      const labels = issue.labels.map(l => l.name);
      
      let severity = 'minor';
      if (labels.includes('critical')) severity = 'critical';
      else if (labels.includes('major')) severity = 'major';
      else if (labels.includes('maintenance')) severity = 'maintenance';

      const affectedSystems = labels.filter(label => 
        systemLabels.includes(label)
      );

      return {
        id: issue.number,
        title: issue.title,
        status: issue.state,
        severity,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at || undefined,
        url: issue.html_url,
        body: issue.body || undefined,
        labels,
        affectedSystems,
      };
    });

    // Generate status items
    const statusItems = new Map();
    
    for (const system of systemLabels) {
      statusItems.set(system, {
        name: system,
        status: 'up',
        incidentCount: 0,
      });
    }

    for (const incident of incidents) {
      if (incident.status === 'open') {
        for (const system of incident.affectedSystems) {
          const item = statusItems.get(system);
          if (item) {
            if (incident.severity === 'critical') {
              item.status = 'down';
            } else if (incident.severity === 'major' && item.status !== 'down') {
              item.status = 'degraded';
            } else if (incident.severity === 'maintenance' && item.status === 'up') {
              item.status = 'maintenance';
            }
            item.incidentCount = (item.incidentCount || 0) + 1;
          }
        }
      }
    }

    // Prepare status data
    const statusData = {
      items: Array.from(statusItems.values()),
      incidents: incidents.slice(0, 20),
      lastUpdated: new Date().toISOString(),
    };

    // Write to file
    const outputDir = path.join(process.cwd(), dataPath);
    await fs.ensureDir(outputDir);
    
    const outputFile = path.join(outputDir, 'status.json');
    await fs.writeJson(outputFile, statusData, {spaces: 2});

    console.log(`✅ Status data written to ${outputFile}`);
    console.log(`   Systems: ${statusData.items.length}`);
    console.log(`   Incidents: ${statusData.incidents.length}`);
    console.log(`   Open issues: ${incidents.filter(i => i.status === 'open').length}`);

  } catch (error) {
    console.error('ERROR: Failed to update status');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  updateStatus().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {updateStatus};
