#!/usr/bin/env node

/**
 * Standalone script to update status data without rebuilding the entire site.
 * This is useful for CI/CD workflows that want to update status data independently.
 * 
 * Usage:
 *   npx stentorosaur-update-status
 *   npx stentorosaur-update-status --output-dir ./build/status-data
 *   npx stentorosaur-update-status --verbose --commit
 * 
 * Environment variables:
 *   GITHUB_TOKEN - GitHub personal access token (required)
 *   GITHUB_OWNER - Repository owner (defaults to docusaurus.config.js)
 *   GITHUB_REPO - Repository name (defaults to docusaurus.config.js)
 *   STATUS_LABEL - Label to filter issues (default: 'status')
 *   SYSTEM_LABELS - Comma-separated list of system labels (default: from config)
 * 
 * Options:
 *   --output-dir <path>  Output directory for status data (default: build/status-data)
 *   --verbose            Enable verbose logging
 *   --commit             Auto-commit changes with git
 *   --help               Show this help message
 */

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  outputDir: null,
  verbose: args.includes('--verbose'),
  commit: args.includes('--commit'),
  help: args.includes('--help') || args.includes('-h'),
  owner: null,
  repo: null,
  statusLabel: null,
  systemLabels: null,
};

// Extract --output-dir value
const outputDirIndex = args.indexOf('--output-dir');
if (outputDirIndex !== -1 && args[outputDirIndex + 1]) {
  options.outputDir = args[outputDirIndex + 1];
}

// Extract --owner value
const ownerIndex = args.indexOf('--owner');
if (ownerIndex !== -1 && args[ownerIndex + 1]) {
  options.owner = args[ownerIndex + 1];
}

// Extract --repo value
const repoIndex = args.indexOf('--repo');
if (repoIndex !== -1 && args[repoIndex + 1]) {
  options.repo = args[repoIndex + 1];
}

// Extract --status-label value
const statusLabelIndex = args.indexOf('--status-label');
if (statusLabelIndex !== -1 && args[statusLabelIndex + 1]) {
  options.statusLabel = args[statusLabelIndex + 1];
}

// Extract --system-labels value
const systemLabelsIndex = args.indexOf('--system-labels');
if (systemLabelsIndex !== -1 && args[systemLabelsIndex + 1]) {
  options.systemLabels = args[systemLabelsIndex + 1].split(',').map(s => s.trim());
}

function log(...args) {
  console.log('[stentorosaur]', ...args);
}

function verbose(...args) {
  if (options.verbose) {
    console.log('[stentorosaur:verbose]', ...args);
  }
}

function showHelp() {
  console.log(`
stentorosaur-update-status - Update status data from GitHub Issues

Usage:
  npx stentorosaur-update-status [options]

Options:
  --output-dir <path>  Output directory for status data (default: build/status-data)
  --verbose            Enable verbose logging
  --commit             Auto-commit changes with git
  --help, -h           Show this help message

Environment Variables:
  GITHUB_TOKEN        GitHub personal access token (required)
  GITHUB_OWNER        Repository owner (defaults to docusaurus.config.js)
  GITHUB_REPO         Repository name (defaults to docusaurus.config.js)
  STATUS_LABEL        Label to filter issues (default: 'status')
  SYSTEM_LABELS       Comma-separated list of system labels

Examples:
  # Basic usage (updates build/status-data if exists)
  npx stentorosaur-update-status

  # Custom output directory
  npx stentorosaur-update-status --output-dir ./public/status

  # Verbose mode with auto-commit
  npx stentorosaur-update-status --verbose --commit

For more information, visit:
https://github.com/amiable-dev/docusaurus-plugin-stentorosaur
  `);
}

async function updateStatus() {
  try {
    if (options.help) {
      showHelp();
      process.exit(0);
    }

    verbose('Starting status update...');
    verbose('Options:', options);

    // Find docusaurus.config.js in current working directory
    const configPath = path.join(process.cwd(), 'docusaurus.config.js');
    
    if (!await fs.pathExists(configPath)) {
      console.error('Error: docusaurus.config.js not found in current directory.');
      console.error('This script must be run from the root of a Docusaurus project.');
      console.error(`Current directory: ${process.cwd()}`);
      process.exit(1);
    }

    verbose('Loading Docusaurus config from:', configPath);

    // Load Docusaurus config using dynamic import (works for both CJS and ESM)
    // Convert to file:// URL for cross-platform compatibility
    const { pathToFileURL } = require('url');
    const configModule = await import(pathToFileURL(configPath).href);
    const config = configModule.default || configModule;
    const actualConfig = typeof config === 'function' ? await config() : config;

    // Find the plugin configuration
    const plugins = actualConfig.plugins || [];
    let pluginConfig = null;

    verbose('Searching for plugin in', plugins.length, 'plugins');

    for (const plugin of plugins) {
      // Handle array format: ['plugin-name', options]
      if (Array.isArray(plugin)) {
        const [pluginPath, options] = plugin;
        verbose('Checking array plugin:', pluginPath);
        if (pluginPath === '@amiable-dev/docusaurus-plugin-stentorosaur' || 
            pluginPath === 'docusaurus-plugin-stentorosaur') {
          pluginConfig = options || {};
          verbose('Found plugin config:', pluginConfig);
          break;
        }
      }
      // Handle string format: 'plugin-name' (no options)
      else if (typeof plugin === 'string') {
        verbose('Checking string plugin:', plugin);
        if (plugin === '@amiable-dev/docusaurus-plugin-stentorosaur' || 
            plugin === 'docusaurus-plugin-stentorosaur') {
          pluginConfig = {};
          verbose('Found plugin (no options)');
          break;
        }
      }
    }

    if (!pluginConfig) {
      console.error('Error: docusaurus-plugin-stentorosaur not found in docusaurus.config.js');
      console.error('Please add the plugin to your docusaurus.config.js plugins array.');
      process.exit(1);
    }

    // Get configuration from environment or plugin config
    const token = process.env.GITHUB_TOKEN || pluginConfig.token;
    const owner = process.env.GITHUB_OWNER || pluginConfig.owner || actualConfig.organizationName;
    const repo = process.env.GITHUB_REPO || pluginConfig.repo || actualConfig.projectName;
    const statusLabel = process.env.STATUS_LABEL || pluginConfig.statusLabel || 'status';
    const systemLabels = process.env.SYSTEM_LABELS 
      ? process.env.SYSTEM_LABELS.split(',').map(s => s.trim())
      : pluginConfig.systemLabels || [];

    if (!token) {
      console.error('Error: GITHUB_TOKEN not provided.');
      console.error('Set it via environment variable or in docusaurus.config.js plugin options.');
      console.error('\nExample:');
      console.error('  export GITHUB_TOKEN=your_token_here');
      console.error('  npx stentorosaur-update-status');
      process.exit(1);
    }

    if (!owner || !repo) {
      console.error('Error: Repository owner/name not configured.');
      console.error('Set via GITHUB_OWNER/GITHUB_REPO environment variables or docusaurus.config.js');
      process.exit(1);
    }

    log(`Fetching status data from ${owner}/${repo}...`);
    verbose('Status label:', statusLabel);
    verbose('System labels:', systemLabels);

    // Import the GitHubStatusService (use dynamic import for ESM compatibility)
    const {GitHubStatusService} = require('../lib/github-service.js');

    const service = new GitHubStatusService(token, owner, repo, statusLabel, systemLabels);
    const result = await service.fetchStatusData();

    const statusData = {
      items: result.items,
      incidents: result.incidents.slice(0, 20),
      lastUpdated: new Date().toISOString(),
      showServices: pluginConfig.showServices !== false,
      showIncidents: pluginConfig.showIncidents !== false,
    };

    verbose('Fetched data:', {
      items: statusData.items.length,
      incidents: statusData.incidents.length,
    });

    // Write to .docusaurus directory (always write for build process)
    const docusaurusDir = path.join(process.cwd(), '.docusaurus', 'docusaurus-plugin-stentorosaur');
    await fs.ensureDir(docusaurusDir);
    const docusaurusPath = path.join(docusaurusDir, 'status.json');
    await fs.writeJson(docusaurusPath, statusData, {spaces: 2});
    verbose('Wrote status data to:', docusaurusPath);

    // Determine output directory for build files
    const dataPath = pluginConfig.dataPath || 'status-data';
    const defaultBuildDir = path.join(process.cwd(), 'build', dataPath);
    const buildStatusDir = options.outputDir 
      ? path.resolve(process.cwd(), options.outputDir)
      : defaultBuildDir;

    // Write to build directory if:
    // 1. --output-dir is explicitly specified, OR
    // 2. build/ directory exists, OR
    // 3. Running in CI environment (GITHUB_ACTIONS, CI, etc.)
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const shouldWriteBuild = options.outputDir || await fs.pathExists(path.join(process.cwd(), 'build')) || isCI;
    
    if (shouldWriteBuild) {
      await fs.ensureDir(buildStatusDir);
      
      // Write summary.json
      const summaryPath = path.join(buildStatusDir, 'summary.json');
      await fs.writeJson(summaryPath, statusData.items, {spaces: 2});
      verbose('Wrote summary to:', summaryPath);

      // Write full status.json
      const statusPath = path.join(buildStatusDir, 'status.json');
      await fs.writeJson(statusPath, statusData, {spaces: 2});
      verbose('Wrote status data to:', statusPath);

      // Write .gitkeep to ensure directory is tracked by git
      const gitkeepPath = path.join(buildStatusDir, '.gitkeep');
      await fs.writeFile(gitkeepPath, '');
      verbose('Wrote .gitkeep to:', gitkeepPath);

      log(`✓ Status data updated in ${path.relative(process.cwd(), buildStatusDir)}/`);
    } else {
      verbose('Skipped build directory write (build/ does not exist)');
    }

    log(`✓ Status data updated in .docusaurus/docusaurus-plugin-stentorosaur/`);
    log(`  - ${result.items.length} system(s)`);
    log(`  - ${result.incidents.length} incident(s)`);
    log(`  - Last updated: ${statusData.lastUpdated}`);

    // Auto-commit if requested
    if (options.commit && shouldWriteBuild) {
      verbose('Auto-committing changes...');
      
      try {
        // Check if there are changes
        const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' });
        
        if (statusOutput.trim()) {
          // Generate commit message based on status
          let commitMessage = '📊 Update status data';
          
          const downSystems = statusData.items.filter(item => item.status === 'down');
          const degradedSystems = statusData.items.filter(item => item.status === 'degraded');
          
          if (downSystems.length > 0) {
            const names = downSystems.map(s => s.name).join(', ');
            commitMessage = `🟥 Systems down: ${names}`;
          } else if (degradedSystems.length > 0) {
            const names = degradedSystems.map(s => s.name).join(', ');
            commitMessage = `🟨 Systems degraded: ${names}`;
          } else if (statusData.items.length > 0) {
            commitMessage = '🟩 All systems operational';
          }

          execSync('git add build/status-data/', { stdio: 'inherit' });
          execSync(`git commit -m "${commitMessage} [skip ci]"`, { stdio: 'inherit' });
          log('✓ Changes committed:', commitMessage);
        } else {
          verbose('No changes to commit');
        }
      } catch (error) {
        console.error('Warning: Failed to commit changes:', error.message);
        if (options.verbose) {
          console.error(error);
        }
      }
    }

    process.exit(0);

  } catch (error) {
    console.error('Error updating status:', error.message);
    if (options.verbose || process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

updateStatus();
