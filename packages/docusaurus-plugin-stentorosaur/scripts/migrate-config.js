#!/usr/bin/env node

/**
 * One-time migration script for systemLabels → entities
 * Usage: node scripts/migrate-config.js <config-file-path>
 */

const fs = require('fs');
const path = require('path');

function migrateConfig(configPath) {
  console.log(`Reading config from: ${configPath}`);

  const content = fs.readFileSync(configPath, 'utf8');

  // Find systemLabels array
  const systemLabelsMatch = content.match(/systemLabels:\s*\[(.*?)\]/s);

  if (!systemLabelsMatch) {
    console.log('❌ No systemLabels found in config');
    return;
  }

  const labelsStr = systemLabelsMatch[1];
  const labels = labelsStr
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(s => s.length > 0);

  console.log(`Found ${labels.length} system labels:`, labels);

  // Generate entities config
  const entities = labels.map(label =>
    `        { name: '${label}', type: 'system' }`
  ).join(',\n');

  const entitiesConfig = `entities: [\n${entities},\n      ]`;

  // Replace systemLabels with entities
  const newContent = content.replace(
    /systemLabels:\s*\[.*?\]/s,
    entitiesConfig
  );

  // Write backup
  const backupPath = configPath + '.backup';
  fs.writeFileSync(backupPath, content, 'utf8');
  console.log(`✓ Backup saved to: ${backupPath}`);

  // Write updated config
  fs.writeFileSync(configPath, newContent, 'utf8');
  console.log(`✓ Config updated: ${configPath}`);

  console.log('\nMigration complete! Next steps:');
  console.log('1. Review the updated config file');
  console.log('2. Add displayName, description, or other Entity fields as desired');
  console.log('3. Run your build to verify everything works');
  console.log('4. Delete the .backup file once confirmed');
}

// Run migration
const configPath = process.argv[2];

if (!configPath) {
  console.error('Usage: node scripts/migrate-config.js <config-file-path>');
  console.error('Example: node scripts/migrate-config.js ../amiable-docusaurus/docusaurus.config.ts');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error(`❌ File not found: ${configPath}`);
  process.exit(1);
}

migrateConfig(configPath);
