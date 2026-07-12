#!/usr/bin/env node

/**
 * Initialize Stentorosaur status monitoring in a consuming project
 * Creates .monitorrc.json and status-data directory
 */

const fs = require('fs-extra');
const path = require('path');

const CONFIG_FILE = '.monitorrc.json';
const STATUS_DATA_DIR = 'status-data';

const DEFAULT_CONFIG = {
  "$schema": "https://json-schema.org/draft-07/schema#",
  "description": "Configuration file for status monitoring script",
  "systems": []
};

async function init() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILE);
  const statusDataPath = path.join(cwd, STATUS_DATA_DIR);

  console.log('Initializing Stentorosaur status monitoring...\n');

  // Create .monitorrc.json if it doesn't exist
  if (await fs.pathExists(configPath)) {
    console.log(`\x1b[33mWarning:\x1b[0m ${CONFIG_FILE} already exists. Skipping...`);
  } else {
    await fs.writeJson(configPath, DEFAULT_CONFIG, { spaces: 2 });
    console.log(`\x1b[32mCreated:\x1b[0m ${CONFIG_FILE}`);
  }

  // Create status-data directory
  await fs.ensureDir(statusDataPath);
  console.log(`\x1b[32mCreated:\x1b[0m ${STATUS_DATA_DIR}/`);

  // Create .gitkeep in status-data
  const gitkeepPath = path.join(statusDataPath, '.gitkeep');
  if (!await fs.pathExists(gitkeepPath)) {
    await fs.writeFile(gitkeepPath, '');
  }

  console.log('\n\x1b[32mStatus monitoring initialized!\x1b[0m\n');
  console.log('Next steps:');
  console.log('  1. Add systems to monitor:');
  console.log('     make status-add-system name=api url=https://api.example.com/health\n');
  console.log('  2. Copy GitHub Actions workflows:');
  console.log('     make status-workflows\n');
  console.log('  3. Test your configuration:');
  console.log('     make status-test\n');
}

init().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
