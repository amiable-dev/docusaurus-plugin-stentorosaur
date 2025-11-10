#!/usr/bin/env node
/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Cleanup script to remove unwanted files from status-data branch
 *
 * This script removes any files that shouldn't be on the status-data branch,
 * keeping only status monitoring data files.
 *
 * Usage:
 *   node scripts/cleanup-status-branch.js [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be removed without making changes
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const BRANCH_NAME = 'status-data';

// Files and directories that SHOULD exist on status-data branch
const ALLOWED_FILES = new Set([
  'README.md',
  '.gitignore',
  'current.json',
  'incidents.json',
  'maintenance.json',
  'archives',
  'systems',  // Legacy format
  '.git'       // Git metadata (always keep)
]);

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (error) {
    if (options.ignoreError) {
      return '';
    }
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

function checkGitRepo() {
  try {
    exec('git rev-parse --is-inside-work-tree');
    return true;
  } catch (error) {
    return false;
  }
}

function branchExists(branchName) {
  try {
    exec(`git rev-parse --verify ${branchName}`);
    return true;
  } catch (error) {
    return false;
  }
}

function getCurrentBranch() {
  try {
    return exec('git branch --show-current').trim();
  } catch (error) {
    return null;
  }
}

function hasUncommittedChanges() {
  try {
    // Use git diff-index which doesn't buffer all output
    // Returns exit code 0 if no changes, 1 if changes exist
    exec('git diff-index --quiet HEAD --');
    return false; // No changes
  } catch (error) {
    return true; // Changes exist
  }
}

async function getAllFilesInWorkingDir() {
  const files = [];

  async function scan(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const name = entry.name;
      const fullPath = path.join(dir, name);
      const relativePath = prefix ? path.join(prefix, name) : name;

      // Skip .git directory
      if (name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(relativePath);
        await scan(fullPath, relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  await scan('.');
  return files;
}

function isAllowedPath(filePath) {
  // Split path into parts
  const parts = filePath.split(path.sep);
  const topLevel = parts[0];

  // Check if top-level path is allowed
  if (ALLOWED_FILES.has(topLevel)) {
    return true;
  }

  // Check if it's inside an allowed directory
  if (topLevel === 'archives' || topLevel === 'systems') {
    return true;
  }

  return false;
}

async function cleanupStatusBranch(options = {}) {
  const { dryRun = false } = options;

  console.log('🧹 Cleaning up status-data branch...\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Step 1: Check if we're in a git repository
  if (!checkGitRepo()) {
    throw new Error('Not in a git repository. Please run this script from your repository root.');
  }

  // Step 2: Check if status-data branch exists
  if (!branchExists(BRANCH_NAME)) {
    throw new Error(`Branch '${BRANCH_NAME}' does not exist. Nothing to clean up.`);
  }

  // Step 3: Save current branch
  const originalBranch = getCurrentBranch() || 'main';
  console.log(`📌 Current branch: ${originalBranch}\n`);

  // Step 4: Check if we're already on status-data branch
  if (originalBranch === BRANCH_NAME) {
    console.log(`✅ Already on '${BRANCH_NAME}' branch\n`);
  } else {
    // Check for uncommitted changes before switching
    if (hasUncommittedChanges()) {
      throw new Error('You have uncommitted changes on current branch. Please commit or stash them first.');
    }

    // Step 5: Checkout status-data branch
    console.log(`🔀 Switching to '${BRANCH_NAME}' branch...`);
    if (!dryRun) {
      // Use --quiet and --force to avoid buffer overflow with large file lists
      exec(`git checkout --quiet ${BRANCH_NAME}`);
    }
    console.log(`   ✅ Checked out ${BRANCH_NAME}\n`);
  }

  // Step 6: Scan for all files in working directory
  console.log(`📂 Scanning files on ${BRANCH_NAME} branch...`);
  const allFiles = await getAllFilesInWorkingDir();
  console.log(`   Found ${allFiles.length} file(s)/directory(ies)\n`);

  // Step 7: Identify files to remove
  const filesToRemove = allFiles.filter(file => !isAllowedPath(file));

  if (filesToRemove.length === 0) {
    console.log(`✅ No unwanted files found! Branch is already clean.\n`);

    // Return to original branch
    if (getCurrentBranch() !== originalBranch) {
      console.log(`🔙 Returning to ${originalBranch}...`);
      if (!dryRun) {
        exec(`git checkout ${originalBranch}`);
      }
      console.log(`   ✅ Checked out ${originalBranch}\n`);
    }

    return;
  }

  console.log(`🗑️  Found ${filesToRemove.length} file(s)/directory(ies) to remove:\n`);

  // Group by top-level directory for cleaner output
  const byTopLevel = {};
  filesToRemove.forEach(file => {
    const topLevel = file.split(path.sep)[0];
    if (!byTopLevel[topLevel]) {
      byTopLevel[topLevel] = [];
    }
    byTopLevel[topLevel].push(file);
  });

  Object.keys(byTopLevel).sort().forEach(topLevel => {
    const files = byTopLevel[topLevel];
    if (files.length === 1) {
      console.log(`   - ${files[0]}`);
    } else {
      console.log(`   - ${topLevel}/ (${files.length} items)`);
    }
  });
  console.log();

  // Step 8: Remove unwanted files
  if (!dryRun) {
    console.log(`🗑️  Removing unwanted files...`);

    // Get unique top-level paths to remove
    const topLevelToRemove = new Set();
    filesToRemove.forEach(file => {
      topLevelToRemove.add(file.split(path.sep)[0]);
    });

    for (const topLevel of topLevelToRemove) {
      try {
        await fs.remove(topLevel);
        console.log(`   ✅ Removed ${topLevel}`);
      } catch (error) {
        console.log(`   ⚠️  Could not remove ${topLevel}: ${error.message}`);
      }
    }
    console.log();
  } else {
    console.log(`   Would remove ${filesToRemove.length} file(s)/directory(ies)\n`);
  }

  // Step 9: Stage deletions and commit
  if (!dryRun && filesToRemove.length > 0) {
    console.log(`💾 Committing cleanup...`);

    // Stage deletions by explicitly removing from git index
    // This avoids buffer overflow with massive file lists
    const topLevelToRemove = new Set();
    filesToRemove.forEach(file => {
      topLevelToRemove.add(file.split(path.sep)[0]);
    });

    for (const topLevel of topLevelToRemove) {
      try {
        // Use git rm to stage deletions without buffering output
        exec(`git rm -rf ${topLevel}`, { stdio: 'inherit' });
      } catch (error) {
        // File may already be deleted, that's okay
        console.log(`   ℹ️  ${topLevel} already removed from git`);
      }
    }

    // Check if there are changes to commit (use --short to minimize output)
    let hasChanges = false;
    try {
      const status = exec('git diff --cached --quiet', { ignoreError: true });
      hasChanges = false; // Command succeeded = no changes
    } catch (error) {
      hasChanges = true; // Command failed = there are changes
    }

    if (hasChanges) {
      const timestamp = new Date().toISOString();
      const commitMsg = `🧹 Clean up status-data branch

Remove unwanted files that were accidentally committed.
Only status monitoring data should exist on this orphaned branch.

Cleaned at: ${timestamp}`;

      exec(`git commit -m "${commitMsg.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
      console.log(`   ✅ Committed cleanup\n`);

      // Step 10: Push to remote
      console.log(`☁️  Pushing cleanup to origin...`);
      try {
        exec(`git push origin ${BRANCH_NAME}`);
        console.log(`   ✅ Pushed to origin/${BRANCH_NAME}\n`);
      } catch (error) {
        console.log(`   ⚠️  Could not push to remote: ${error.message}`);
        console.log(`   You can push manually later with: git push origin ${BRANCH_NAME}\n`);
      }
    } else {
      console.log(`   ℹ️  No changes to commit (files may have been already removed)\n`);
    }
  }

  // Step 11: Return to original branch
  console.log(`🔙 Returning to ${originalBranch}...`);
  if (!dryRun) {
    exec(`git checkout ${originalBranch}`);
  }
  console.log(`   ✅ Checked out ${originalBranch}\n`);

  // Step 12: Success message
  console.log(`✨ Cleanup complete!\n`);

  if (filesToRemove.length > 0) {
    console.log(`Summary:`);
    console.log(`  - Removed ${filesToRemove.length} unwanted file(s)/directory(ies)`);
    console.log(`  - Kept only status monitoring data on ${BRANCH_NAME}\n`);
    console.log(`Allowed files on ${BRANCH_NAME} branch:`);
    console.log(`  - README.md, .gitignore`);
    console.log(`  - current.json, incidents.json, maintenance.json`);
    console.log(`  - archives/ (historical monitoring data)`);
    console.log(`  - systems/ (legacy format, if present)\n`);
  }

  console.log(`Next steps:`);
  console.log(`  1. Verify the cleanup: git checkout ${BRANCH_NAME}`);
  console.log(`  2. Check branch size has decreased`);
  console.log(`  3. Ensure monitoring workflows still work\n`);
}

// Main execution
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
};

cleanupStatusBranch(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  });
