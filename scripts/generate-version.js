#!/usr/bin/env node

/**
 * Generate src/version.ts from package.json version
 * This ensures the plugin version is always in sync with package.json
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const versionFilePath = path.join(__dirname, '../src/version.ts');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const versionFileContent = `/**
 * Plugin version - auto-generated during build
 * DO NOT EDIT MANUALLY - This file is generated from package.json
 */

export const PLUGIN_VERSION = '${version}';
`;

fs.writeFileSync(versionFilePath, versionFileContent, 'utf8');
console.log(`✓ Generated src/version.ts with version ${version}`);
