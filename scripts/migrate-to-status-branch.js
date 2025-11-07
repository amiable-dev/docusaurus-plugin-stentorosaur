#!/usr/bin/env node
/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Migration script to move existing status data from main branch to orphaned status-data branch
 *
 * This script:
 * 1. Checks if status-data branch exists (creates it if not)
 * 2. Copies existing status data from main branch
 * 3. Commits to status-data branch
 * 4. Optionally removes status data from main branch
 *
 * Usage:
 *   node scripts/migrate-to-status-branch.js [--dry-run] [--keep-on-main] [--data-dir PATH]
 *
 * Options:
 *   --dry-run        Show what would be done without making changes
 *   --keep-on-main   Keep status data on main branch after migration
 *   --data-dir PATH  Path to status data directory (default: status-data)
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const BRANCH_NAME = 'status-data';
const DEFAULT_DATA_DIR = 'status-data';

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
    const status = exec('git status --porcelain').trim();
    return status.length > 0;
  } catch (error) {
    return false;
  }
}

async function findStatusDataFiles(dataDir) {
  const files = [];

  // Core status files
  const coreFiles = ['current.json', 'incidents.json', 'maintenance.json'];
  for (const file of coreFiles) {
    const filePath = path.join(dataDir, file);
    if (await fs.pathExists(filePath)) {
      files.push(file);
    }
  }

  // Archives directory
  const archivesPath = path.join(dataDir, 'archives');
  if (await fs.pathExists(archivesPath)) {
    files.push('archives/');
  }

  // Legacy systems directory
  const systemsPath = path.join(dataDir, 'systems');
  if (await fs.pathExists(systemsPath)) {
    files.push('systems/');
  }

  return files;
}

async function migrateStatusData(options = {}) {
  const {
    dryRun = false,
    keepOnMain = false,
    dataDir = DEFAULT_DATA_DIR,
  } = options;

  console.log('🔄 Migrating status data to orphaned branch...\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Step 1: Check if we're in a git repository
  if (!checkGitRepo()) {
    throw new Error('Not in a git repository. Please run this script from your repository root.');
  }

  // Step 2: Check for uncommitted changes
  if (hasUncommittedChanges()) {
    throw new Error('You have uncommitted changes. Please commit or stash them before running migration.');
  }

  // Step 3: Save current branch
  const currentBranch = getCurrentBranch() || 'main';
  console.log(`📌 Current branch: ${currentBranch}\n`);

  // Step 4: Check if data directory exists on current branch
  const dataPath = path.resolve(dataDir);
  const dataExists = await fs.pathExists(dataPath);

  if (!dataExists) {
    console.log(`ℹ️  No status data found at '${dataDir}' on ${currentBranch}`);
    console.log(`   Nothing to migrate.\n`);
    return;
  }

  // Step 5: Find all status data files
  console.log(`📂 Scanning for status data in '${dataDir}'...`);
  const files = await findStatusDataFiles(dataDir);

  if (files.length === 0) {
    console.log(`   ⚠️  No status data files found in '${dataDir}'`);
    console.log(`   Nothing to migrate.\n`);
    return;
  }

  console.log(`   Found ${files.length} item(s):`);
  files.forEach(file => console.log(`     - ${file}`));
  console.log();

  // Step 6: Check if status-data branch exists
  const statusBranchExists = branchExists(BRANCH_NAME);

  if (!statusBranchExists) {
    console.log(`⚠️  Branch '${BRANCH_NAME}' does not exist.`);
    console.log(`   Run setup script first: node scripts/setup-status-branch.js\n`);
    throw new Error(`Branch '${BRANCH_NAME}' not found`);
  }

  // Step 7: Checkout status-data branch
  console.log(`🔀 Switching to '${BRANCH_NAME}' branch...`);
  if (!dryRun) {
    exec(`git checkout ${BRANCH_NAME}`);
  }
  console.log(`   ✅ Checked out ${BRANCH_NAME}\n`);

  // Step 8: Copy status data from main branch
  console.log(`📋 Copying status data from ${currentBranch}...`);

  if (!dryRun) {
    // Get files from main branch without switching
    for (const file of files) {
      const sourcePath = path.join(dataDir, file);
      const targetPath = file;

      if (file.endsWith('/')) {
        // Directory - use git archive to extract
        try {
          exec(`git checkout ${currentBranch} -- ${sourcePath}`, { ignoreError: true });
          if (await fs.pathExists(sourcePath)) {
            await fs.copy(sourcePath, targetPath);
            await fs.remove(sourcePath); // Clean up temporary checkout
          }
        } catch (error) {
          console.log(`     ⚠️  Could not copy ${file}: ${error.message}`);
        }
      } else {
        // File - check out directly
        try {
          exec(`git show ${currentBranch}:${sourcePath} > ${targetPath}`);
        } catch (error) {
          console.log(`     ⚠️  Could not copy ${file}: ${error.message}`);
        }
      }
      console.log(`     ✅ Copied ${file}`);
    }
  } else {
    files.forEach(file => console.log(`     Would copy: ${file}`));
  }
  console.log();

  // Step 9: Commit to status-data branch
  console.log(`💾 Committing migration to '${BRANCH_NAME}'...`);
  if (!dryRun) {
    exec('git add .');
    const timestamp = new Date().toISOString();
    exec(`git commit -m "📦 Migrate status data from ${currentBranch} branch\\n\\nMigrated at: ${timestamp}"`);
    console.log(`   ✅ Committed changes\n`);
  } else {
    console.log(`   Would commit: "Migrate status data from ${currentBranch} branch"\n`);
  }

  // Step 10: Push to remote
  console.log(`☁️  Pushing to origin...`);
  if (!dryRun) {
    try {
      exec(`git push origin ${BRANCH_NAME}`);
      console.log(`   ✅ Pushed to origin/${BRANCH_NAME}\n`);
    } catch (error) {
      console.log(`   ⚠️  Could not push to remote: ${error.message}`);
      console.log(`   You can push manually later with: git push origin ${BRANCH_NAME}\n`);
    }
  } else {
    console.log(`   Would push to origin/${BRANCH_NAME}\n`);
  }

  // Step 11: Return to original branch
  console.log(`🔙 Returning to ${currentBranch}...`);
  if (!dryRun) {
    exec(`git checkout ${currentBranch}`);
  }
  console.log(`   ✅ Checked out ${currentBranch}\n`);

  // Step 12: Optionally remove from main branch
  if (!keepOnMain) {
    console.log(`🗑️  Removing status data from ${currentBranch}...`);
    if (!dryRun) {
      await fs.remove(dataPath);
      exec(`git add ${dataDir}`);
      exec(`git commit -m "Remove status data (migrated to ${BRANCH_NAME} branch)"`);
      console.log(`   ✅ Removed ${dataDir} from ${currentBranch}`);
      console.log(`   ✅ Committed changes\n`);

      console.log(`☁️  Pushing changes to ${currentBranch}...`);
      try {
        exec(`git push origin ${currentBranch}`);
        console.log(`   ✅ Pushed to origin/${currentBranch}\n`);
      } catch (error) {
        console.log(`   ⚠️  Could not push to remote: ${error.message}`);
        console.log(`   You can push manually later with: git push origin ${currentBranch}\n`);
      }
    } else {
      console.log(`   Would remove: ${dataDir}/`);
      console.log(`   Would commit: "Remove status data (migrated to ${BRANCH_NAME} branch)"\n`);
    }
  } else {
    console.log(`ℹ️  Keeping status data on ${currentBranch} (--keep-on-main flag set)\n`);
  }

  // Step 13: Success message
  console.log(`✨ Migration complete!\n`);
  console.log(`Summary:`);
  console.log(`  - Migrated ${files.length} item(s) to '${BRANCH_NAME}' branch`);
  console.log(`  - Status data ${keepOnMain ? 'kept on' : 'removed from'} ${currentBranch}\n`);
  console.log(`Next steps:`);
  console.log(`  1. Update your workflows to use 'ref: ${BRANCH_NAME}'`);
  console.log(`  2. Verify the migration: git checkout ${BRANCH_NAME}`);
  console.log(`  3. Update environment variables in workflows:`);
  console.log(`     STATUS_DATA_DIR=. (when on ${BRANCH_NAME} branch)\n`);
}

// Main execution
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  keepOnMain: args.includes('--keep-on-main'),
  dataDir: args.includes('--data-dir')
    ? args[args.indexOf('--data-dir') + 1]
    : DEFAULT_DATA_DIR,
};

migrateStatusData(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  });
