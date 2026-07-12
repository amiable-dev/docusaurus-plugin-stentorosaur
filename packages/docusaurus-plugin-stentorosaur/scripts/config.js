#!/usr/bin/env node

/**
 * Stentorosaur configuration management CLI
 * Manages .monitorrc.json and docusaurus.config plugin options
 */

const fs = require('fs-extra');
const path = require('path');

const CONFIG_FILE = '.monitorrc.json';
const ENTITIES_FILE = '.stentorosaur-entities.json';

// Parse command line arguments
function parseArgs(args) {
  const result = { command: args[0], options: {} };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result.options[key] = nextArg;
        i++;
      } else {
        result.options[key] = true;
      }
    }
  }

  return result;
}

// Load monitor config
async function loadConfig() {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  if (!await fs.pathExists(configPath)) {
    return {
      "$schema": "https://json-schema.org/draft-07/schema#",
      "description": "Configuration file for status monitoring script",
      "systems": []
    };
  }

  return await fs.readJson(configPath);
}

// Save monitor config
async function saveConfig(config) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  await fs.writeJson(configPath, config, { spaces: 2 });
}

// Load entities config (for processes and additional metadata)
async function loadEntities() {
  const entitiesPath = path.join(process.cwd(), ENTITIES_FILE);

  if (!await fs.pathExists(entitiesPath)) {
    return { systems: [], processes: [] };
  }

  return await fs.readJson(entitiesPath);
}

// Save entities config
async function saveEntities(entities) {
  const entitiesPath = path.join(process.cwd(), ENTITIES_FILE);
  await fs.writeJson(entitiesPath, entities, { spaces: 2 });
}

// Add a system to monitor
async function addSystem(options) {
  const name = options.name;
  const url = options.url;
  const method = options.method || 'GET';
  const timeout = options.timeout || '10000';
  const expectedCodes = options['expected-codes'] || '200';
  const hidden = options.hidden === true || options.hidden === 'true';
  const displayName = options['display-name'];
  const description = options.description;

  if (!name || !url) {
    console.error('\x1b[31mError:\x1b[0m Both --name and --url are required');
    console.log('\nUsage: stentorosaur-config add-system --name api --url https://api.example.com/health');
    console.log('       stentorosaur-config add-system --name internal-api --url https://... --hidden');
    process.exit(1);
  }

  const config = await loadConfig();

  // Check if system already exists
  const existingIndex = config.systems.findIndex(s => s.system === name);

  const newSystem = {
    system: name,
    url: url,
    method: method.toUpperCase(),
    timeout: parseInt(timeout, 10),
    expectedCodes: expectedCodes.split(',').map(c => parseInt(c.trim(), 10)),
    maxResponseTime: 30000
  };

  // Add optional fields only if provided
  if (hidden) {
    newSystem.display = false;
  }
  if (displayName) {
    newSystem.displayName = displayName;
  }
  if (description) {
    newSystem.description = description;
  }

  if (existingIndex >= 0) {
    config.systems[existingIndex] = newSystem;
    console.log(`\x1b[33mUpdated:\x1b[0m System '${name}' configuration updated`);
  } else {
    config.systems.push(newSystem);
    console.log(`\x1b[32mAdded:\x1b[0m System '${name}' added to ${CONFIG_FILE}`);
  }

  await saveConfig(config);

  console.log(`\n  URL: ${url}`);
  console.log(`  Method: ${method.toUpperCase()}`);
  console.log(`  Timeout: ${timeout}ms`);
  console.log(`  Expected codes: ${expectedCodes}`);
  if (hidden) {
    console.log(`  Display: \x1b[33mhidden\x1b[0m (monitored but not shown on status page)`);
  }
  if (displayName) {
    console.log(`  Display Name: ${displayName}`);
  }
  if (description) {
    console.log(`  Description: ${description}`);
  }
}

// Update an existing system
async function updateSystem(options) {
  const name = options.name;

  if (!name) {
    console.error('\x1b[31mError:\x1b[0m --name is required');
    console.log('\nUsage: stentorosaur-config update-system --name api --url https://new-url.com');
    console.log('       stentorosaur-config update-system --name api --hidden');
    console.log('       stentorosaur-config update-system --name api --visible (unhide)');
    process.exit(1);
  }

  const config = await loadConfig();
  const existingIndex = config.systems.findIndex(s => s.system === name);

  if (existingIndex < 0) {
    console.error(`\x1b[31mError:\x1b[0m System '${name}' not found`);
    console.log(`\nAvailable systems: ${config.systems.map(s => s.system).join(', ')}`);
    process.exit(1);
  }

  const system = config.systems[existingIndex];
  let changed = false;

  // Update URL if provided
  if (options.url) {
    system.url = options.url;
    changed = true;
    console.log(`  URL: ${options.url}`);
  }

  // Update method if provided
  if (options.method) {
    system.method = options.method.toUpperCase();
    changed = true;
    console.log(`  Method: ${system.method}`);
  }

  // Update timeout if provided
  if (options.timeout) {
    system.timeout = parseInt(options.timeout, 10);
    changed = true;
    console.log(`  Timeout: ${system.timeout}ms`);
  }

  // Update expected codes if provided
  if (options['expected-codes']) {
    system.expectedCodes = options['expected-codes'].split(',').map(c => parseInt(c.trim(), 10));
    changed = true;
    console.log(`  Expected codes: ${system.expectedCodes.join(', ')}`);
  }

  // Update display if provided
  if (options.hidden === true || options.hidden === 'true') {
    system.display = false;
    changed = true;
    console.log(`  Display: \x1b[33mhidden\x1b[0m`);
  } else if (options.visible === true || options.visible === 'true') {
    delete system.display; // Remove display: false to show system
    changed = true;
    console.log(`  Display: \x1b[32mvisible\x1b[0m`);
  }

  // Update display name if provided
  if (options['display-name']) {
    system.displayName = options['display-name'];
    changed = true;
    console.log(`  Display Name: ${system.displayName}`);
  }

  // Update description if provided
  if (options.description) {
    system.description = options.description;
    changed = true;
    console.log(`  Description: ${system.description}`);
  }

  if (!changed) {
    console.log(`\x1b[33mWarning:\x1b[0m No changes specified for system '${name}'`);
    console.log('\nAvailable options:');
    console.log('  --url <url>            Update endpoint URL');
    console.log('  --method <GET|POST>    Update HTTP method');
    console.log('  --timeout <ms>         Update timeout');
    console.log('  --expected-codes <n>   Update expected HTTP codes');
    console.log('  --hidden               Hide from status page');
    console.log('  --visible              Show on status page');
    console.log('  --display-name <name>  Update display name');
    console.log('  --description <text>   Update description');
    return;
  }

  await saveConfig(config);
  console.log(`\n\x1b[32mUpdated:\x1b[0m System '${name}' has been updated`);
}

// Add a business process
async function addProcess(options) {
  const name = options.name;
  const description = options.description || '';

  if (!name) {
    console.error('\x1b[31mError:\x1b[0m --name is required');
    console.log('\nUsage: stentorosaur-config add-process --name deployments --description "Deployment pipeline"');
    process.exit(1);
  }

  const entities = await loadEntities();

  // Check if process already exists
  const existingIndex = entities.processes.findIndex(p => p.name === name);

  const newProcess = {
    name,
    type: 'process',
    description: description || `${name} process tracking`
  };

  if (existingIndex >= 0) {
    entities.processes[existingIndex] = newProcess;
    console.log(`\x1b[33mUpdated:\x1b[0m Process '${name}' configuration updated`);
  } else {
    entities.processes.push(newProcess);
    console.log(`\x1b[32mAdded:\x1b[0m Process '${name}' added to ${ENTITIES_FILE}`);
  }

  await saveEntities(entities);

  console.log(`\n  Description: ${newProcess.description}`);
  console.log(`\n\x1b[33mNote:\x1b[0m Add 'process:${name}' label to GitHub Issues to track this process.`);
}

// Remove a system
async function removeSystem(options) {
  const name = options.name;

  if (!name) {
    console.error('\x1b[31mError:\x1b[0m --name is required');
    console.log('\nUsage: stentorosaur-config remove-system --name api');
    process.exit(1);
  }

  const config = await loadConfig();
  const originalLength = config.systems.length;
  config.systems = config.systems.filter(s => s.system !== name);

  if (config.systems.length === originalLength) {
    console.log(`\x1b[33mWarning:\x1b[0m System '${name}' not found in ${CONFIG_FILE}`);
  } else {
    await saveConfig(config);
    console.log(`\x1b[32mRemoved:\x1b[0m System '${name}' from ${CONFIG_FILE}`);
  }

  // Also remove from entities
  const entities = await loadEntities();
  entities.systems = entities.systems.filter(s => s.name !== name);
  await saveEntities(entities);
}

// List all configured systems and processes
async function list() {
  const config = await loadConfig();
  const entities = await loadEntities();

  console.log('\n\x1b[32mMonitored Systems:\x1b[0m');
  console.log('─'.repeat(60));

  if (config.systems.length === 0) {
    console.log('  No systems configured');
    console.log('  Run: make status-add-system name=api url=https://...');
  } else {
    const visibleSystems = config.systems.filter(s => s.display !== false);
    const hiddenSystems = config.systems.filter(s => s.display === false);

    if (visibleSystems.length > 0) {
      for (const system of visibleSystems) {
        const displayName = system.displayName ? ` (${system.displayName})` : '';
        console.log(`\n  \x1b[36m${system.system}\x1b[0m${displayName}`);
        console.log(`    URL: ${system.url}`);
        console.log(`    Method: ${system.method}`);
        console.log(`    Timeout: ${system.timeout}ms`);
        console.log(`    Expected: ${system.expectedCodes.join(', ')}`);
        if (system.description) {
          console.log(`    Description: ${system.description}`);
        }
      }
    }

    if (hiddenSystems.length > 0) {
      console.log('\n  \x1b[33mHidden Systems (monitored but not displayed):\x1b[0m');
      for (const system of hiddenSystems) {
        console.log(`    - ${system.system}: ${system.url}`);
      }
    }
  }

  console.log('\n\n\x1b[32mBusiness Processes:\x1b[0m');
  console.log('─'.repeat(60));

  if (!entities.processes || entities.processes.length === 0) {
    console.log('  No processes configured');
    console.log('  Run: make status-add-process name=deployments');
  } else {
    for (const process of entities.processes) {
      console.log(`\n  \x1b[36m${process.name}\x1b[0m`);
      console.log(`    Label: process:${process.name}`);
      if (process.description) {
        console.log(`    Description: ${process.description}`);
      }
    }
  }

  console.log('\n');
}

// Validate configuration
async function validate() {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  if (!await fs.pathExists(configPath)) {
    console.error(`\x1b[31mError:\x1b[0m ${CONFIG_FILE} not found`);
    console.log('Run: make status-init');
    process.exit(1);
  }

  try {
    const config = await fs.readJson(configPath);

    const errors = [];
    const warnings = [];

    if (!config.systems || !Array.isArray(config.systems)) {
      errors.push('Missing or invalid "systems" array');
    } else {
      for (let i = 0; i < config.systems.length; i++) {
        const system = config.systems[i];

        if (!system.system) {
          errors.push(`System ${i + 1}: Missing "system" name`);
        }
        if (!system.url) {
          errors.push(`System ${i + 1}: Missing "url"`);
        } else {
          try {
            new URL(system.url);
          } catch {
            errors.push(`System ${i + 1}: Invalid URL "${system.url}"`);
          }
        }
        if (system.timeout && (typeof system.timeout !== 'number' || system.timeout < 0)) {
          warnings.push(`System ${i + 1}: Invalid timeout value`);
        }
      }
    }

    if (errors.length > 0) {
      console.log('\x1b[31mValidation failed:\x1b[0m\n');
      errors.forEach(e => console.log(`  - ${e}`));
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.log('\x1b[33mWarnings:\x1b[0m\n');
      warnings.forEach(w => console.log(`  - ${w}`));
    }

    console.log(`\x1b[32mConfiguration valid!\x1b[0m`);
    console.log(`  ${config.systems.length} system(s) configured`);

  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m Failed to parse ${CONFIG_FILE}`);
    console.error(err.message);
    process.exit(1);
  }
}

// Generate docusaurus config snippet
async function generateConfig() {
  const entities = await loadEntities();

  const allEntities = [
    ...entities.systems.map(s => ({ name: s.name, type: 'system' })),
    ...entities.processes.map(p => ({ name: p.name, type: 'process' }))
  ];

  console.log('\n\x1b[32mDocusaurus Config Snippet:\x1b[0m');
  console.log('─'.repeat(60));
  console.log(`
// Add to docusaurus.config.js plugins array:
[
  '@amiable-dev/docusaurus-plugin-stentorosaur',
  {
    owner: 'your-org',
    repo: 'your-repo',
    entities: ${JSON.stringify(allEntities, null, 6).replace(/\n/g, '\n    ')},
  },
],
`);
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Stentorosaur Configuration Manager\n');
    console.log('Commands:');
    console.log('  add-system     Add a system to monitor');
    console.log('  update-system  Update an existing system');
    console.log('  add-process    Add a business process');
    console.log('  remove-system  Remove a system');
    console.log('  list           List all configured systems and processes');
    console.log('  validate       Validate configuration files');
    console.log('  generate       Generate docusaurus.config.js snippet');
    console.log('\nOptions:');
    console.log('  --hidden       Hide system from status page (monitoring only)');
    console.log('  --visible      Show system on status page (remove hidden flag)');
    console.log('\nRun with --help for more info');
    process.exit(0);
  }

  const { command, options } = parseArgs(args);

  switch (command) {
    case 'add-system':
      await addSystem(options);
      break;
    case 'update-system':
      await updateSystem(options);
      break;
    case 'add-process':
      await addProcess(options);
      break;
    case 'remove-system':
      await removeSystem(options);
      break;
    case 'list':
      await list();
      break;
    case 'validate':
      await validate();
      break;
    case 'generate':
      await generateConfig();
      break;
    default:
      console.error(`\x1b[31mError:\x1b[0m Unknown command '${command}'`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
