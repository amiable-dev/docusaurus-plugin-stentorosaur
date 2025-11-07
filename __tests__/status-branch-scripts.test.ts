/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Status Branch Scripts', () => {
  let testDir: string;
  const originalCwd = process.cwd(); // Save at module load time

  beforeEach(async () => {
    // originalCwd is already set

    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'status-branch-test-'));

    // Change to test directory
    process.chdir(testDir);

    // Initialize git repo
    execSync('git init', { stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { stdio: 'pipe' });
    execSync('git config user.name "Test User"', { stdio: 'pipe' });

    // Create initial commit
    await fs.writeFile('README.md', '# Test Repo\n');
    execSync('git add README.md', { stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { stdio: 'pipe' });
  });

  afterEach(async () => {
    // Return to original directory
    process.chdir(originalCwd);

    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('setup-status-branch.js', () => {
    const setupScriptPath = path.join(originalCwd, 'scripts', 'setup-status-branch.js');

    it('should create orphaned status-data branch', async () => {
      // Run setup script
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });

      // Verify branch was created
      const branches = execSync('git branch --list', { encoding: 'utf8' });
      expect(branches).toContain('status-data');

      // Checkout status-data branch
      execSync('git checkout status-data', { stdio: 'pipe' });

      // Verify README.md exists
      expect(await fs.pathExists('README.md')).toBe(true);

      // Verify archives directory exists
      expect(await fs.pathExists('archives')).toBe(true);

      // Verify .gitignore exists
      expect(await fs.pathExists('.gitignore')).toBe(true);

      // Verify README content
      const readme = await fs.readFile('README.md', 'utf8');
      expect(readme).toContain('Status Data Branch');
      expect(readme).toContain('orphaned branch');
      expect(readme).toContain('status-data/');
    });

    it('should fail if branch already exists without --force', async () => {
      // Create branch first time
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });

      // Try to create again without --force
      expect(() => {
        execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should recreate branch with --force flag', async () => {
      // Create branch first time
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });

      // Modify the branch
      execSync('git checkout status-data', { stdio: 'pipe' });
      await fs.writeFile('test.txt', 'test content');
      execSync('git add test.txt', { stdio: 'pipe' });
      execSync('git commit -m "Add test file"', { stdio: 'pipe' });
      execSync('git checkout main', { stdio: 'pipe' });

      // Recreate with --force
      execSync(`node ${setupScriptPath} --force`, { stdio: 'pipe' });

      // Verify branch was recreated
      execSync('git checkout status-data', { stdio: 'pipe' });
      expect(await fs.pathExists('test.txt')).toBe(false);
      expect(await fs.pathExists('README.md')).toBe(true);
    });

    it('should create proper initial commit', async () => {
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });
      execSync('git checkout status-data', { stdio: 'pipe' });

      // Get commit message
      const commitMsg = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
      expect(commitMsg).toBe('Initialize status-data orphaned branch');

      // Verify files in commit
      const files = execSync('git ls-tree --name-only HEAD', { encoding: 'utf8' })
        .split('\n')
        .filter(f => f.trim());
      expect(files).toContain('README.md');
      expect(files).toContain('.gitignore');
      // Note: archives/ directory is created but not committed (Git doesn't track empty dirs)
    });

    it('should not have shared history with main', async () => {
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });

      // Get commit count on main
      const mainCommits = execSync('git rev-list --count main', { encoding: 'utf8' }).trim();

      // Get commit count on status-data
      execSync('git checkout status-data', { stdio: 'pipe' });
      const statusCommits = execSync('git rev-list --count status-data', { encoding: 'utf8' }).trim();

      // Status-data should have exactly 1 commit
      expect(statusCommits).toBe('1');

      // Main should have more commits (at least the initial commit)
      expect(parseInt(mainCommits, 10)).toBeGreaterThanOrEqual(1);

      // Check merge base (should not exist for orphaned branch)
      try {
        execSync('git merge-base main status-data', { stdio: 'pipe' });
        fail('Expected merge-base to fail for orphaned branch');
      } catch (error) {
        // Expected - orphaned branches have no common ancestor
        expect(error).toBeDefined();
      }
    });
  });

  describe('migrate-to-status-branch.js', () => {
    const migrateScriptPath = path.join(originalCwd, 'scripts', 'migrate-to-status-branch.js');
    const setupScriptPath = path.join(originalCwd, 'scripts', 'setup-status-branch.js');

    beforeEach(async () => {
      // Create status-data directory with sample data
      await fs.ensureDir('status-data');
      await fs.writeJson('status-data/current.json', [
        { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 150 },
      ]);
      await fs.writeJson('status-data/incidents.json', []);
      await fs.writeJson('status-data/maintenance.json', []);
      await fs.ensureDir('status-data/archives/2025/01');
      await fs.writeFile('status-data/archives/2025/01/history-2025-01-01.jsonl', '');

      // Commit to main
      execSync('git add status-data/', { stdio: 'pipe' });
      execSync('git commit -m "Add status data"', { stdio: 'pipe' });

      // Setup status-data branch
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });
    });

    it('should migrate data to status-data branch', async () => {
      // Run migration
      execSync(`node ${migrateScriptPath}`, { stdio: 'pipe' });

      // Verify data was copied to status-data branch
      execSync('git checkout status-data', { stdio: 'pipe' });

      expect(await fs.pathExists('current.json')).toBe(true);
      expect(await fs.pathExists('incidents.json')).toBe(true);
      expect(await fs.pathExists('maintenance.json')).toBe(true);
      expect(await fs.pathExists('archives/2025/01')).toBe(true);

      // Verify content
      const currentData = await fs.readJson('current.json');
      expect(currentData).toHaveLength(1);
      expect(currentData[0].svc).toBe('api');
    });

    it('should remove data from main branch by default', async () => {
      // Run migration
      execSync(`node ${migrateScriptPath}`, { stdio: 'pipe' });

      // Verify data was removed from main
      execSync('git checkout main', { stdio: 'pipe' });
      expect(await fs.pathExists('status-data')).toBe(false);
    });

    it('should keep data on main with --keep-on-main flag', async () => {
      // Run migration with --keep-on-main
      execSync(`node ${migrateScriptPath} --keep-on-main`, { stdio: 'pipe' });

      // Verify data still exists on main
      execSync('git checkout main', { stdio: 'pipe' });
      expect(await fs.pathExists('status-data')).toBe(true);
      expect(await fs.pathExists('status-data/current.json')).toBe(true);
    });

    it('should handle --dry-run without making changes', async () => {
      // Run migration in dry-run mode
      execSync(`node ${migrateScriptPath} --dry-run`, { stdio: 'pipe' });

      // Verify status-data branch has no new files
      execSync('git checkout status-data', { stdio: 'pipe' });
      expect(await fs.pathExists('current.json')).toBe(false);

      // Verify main still has data
      execSync('git checkout main', { stdio: 'pipe' });
      expect(await fs.pathExists('status-data')).toBe(true);
    });

    it('should handle custom data directory with --data-dir', async () => {
      // Create custom data directory
      await fs.ensureDir('custom-status');
      await fs.writeJson('custom-status/current.json', [
        { t: Date.now(), svc: 'web', state: 'up', code: 200, lat: 100 },
      ]);
      execSync('git add custom-status/', { stdio: 'pipe' });
      execSync('git commit -m "Add custom status data"', { stdio: 'pipe' });

      // Run migration with custom dir
      execSync(`node ${migrateScriptPath} --data-dir custom-status`, { stdio: 'pipe' });

      // Verify data was migrated
      execSync('git checkout status-data', { stdio: 'pipe' });
      expect(await fs.pathExists('current.json')).toBe(true);

      const currentData = await fs.readJson('current.json');
      expect(currentData[0].svc).toBe('web');
    });

    it('should fail if status-data branch does not exist', async () => {
      // Delete status-data branch
      execSync('git branch -D status-data', { stdio: 'pipe' });

      // Try to migrate
      expect(() => {
        execSync(`node ${migrateScriptPath}`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should handle no data to migrate gracefully', async () => {
      // Remove status-data directory
      await fs.remove('status-data');
      execSync('git add -A', { stdio: 'pipe' });
      execSync('git commit -m "Remove status data"', { stdio: 'pipe' });

      // Run migration (should not fail)
      const output = execSync(`node ${migrateScriptPath}`, { encoding: 'utf8', stdio: 'pipe' });
      expect(output).toContain('Nothing to migrate');
    });

    it('should create proper migration commit', async () => {
      execSync(`node ${migrateScriptPath} --keep-on-main`, { stdio: 'pipe' });

      // Check commit on status-data branch
      execSync('git checkout status-data', { stdio: 'pipe' });
      const log = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
      expect(log).toContain('Migrate status data from');
    });
  });

  describe('Integration: Setup + Migrate workflow', () => {
    const setupScriptPath = path.join(originalCwd, 'scripts', 'setup-status-branch.js');
    const migrateScriptPath = path.join(originalCwd, 'scripts', 'migrate-to-status-branch.js');

    it('should successfully setup and migrate in sequence', async () => {
      // Create status data on main
      await fs.ensureDir('status-data/archives');
      await fs.writeJson('status-data/current.json', [
        { t: Date.now(), svc: 'api', state: 'up', code: 200, lat: 150 },
        { t: Date.now(), svc: 'web', state: 'up', code: 200, lat: 80 },
      ]);
      await fs.writeJson('status-data/incidents.json', [
        { id: 1, title: 'Test Incident', status: 'closed' },
      ]);
      await fs.writeJson('status-data/maintenance.json', []);

      execSync('git add status-data/', { stdio: 'pipe' });
      execSync('git commit -m "Add comprehensive status data"', { stdio: 'pipe' });

      // Step 1: Setup orphaned branch
      execSync(`node ${setupScriptPath}`, { stdio: 'pipe' });

      // Step 2: Migrate data
      execSync(`node ${migrateScriptPath}`, { stdio: 'pipe' });

      // Verify end state
      execSync('git checkout status-data', { stdio: 'pipe' });

      // Check all files migrated
      expect(await fs.pathExists('current.json')).toBe(true);
      expect(await fs.pathExists('incidents.json')).toBe(true);
      expect(await fs.pathExists('maintenance.json')).toBe(true);
      expect(await fs.pathExists('archives')).toBe(true);

      // Verify content integrity
      const current = await fs.readJson('current.json');
      expect(current).toHaveLength(2);

      const incidents = await fs.readJson('incidents.json');
      expect(incidents).toHaveLength(1);
      expect(incidents[0].title).toBe('Test Incident');

      // Verify main is clean
      execSync('git checkout main', { stdio: 'pipe' });
      expect(await fs.pathExists('status-data')).toBe(false);

      // Verify history is isolated
      execSync('git checkout status-data', { stdio: 'pipe' });
      const commits = execSync('git rev-list --count status-data', { encoding: 'utf8' }).trim();
      expect(parseInt(commits, 10)).toBe(2); // Init + migration
    });
  });
});
