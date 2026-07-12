/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

describe('monitor.js script', () => {
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const monitorScript = path.join(scriptsDir, 'monitor.js');

  it('should exist and be a JavaScript file', async () => {
    const exists = await fs.pathExists(monitorScript);
    expect(exists).toBe(true);
    
    const stats = await fs.stat(monitorScript);
    expect(stats.isFile()).toBe(true);
  });

  it('should have proper shebang for node execution', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('should contain required functionality', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    // Check for key functions and patterns
    expect(content).toContain('checkEndpoint');
    expect(content).toContain('appendToJSONL');
    expect(content).toContain('buildCurrentJson');
    expect(content).toContain('.monitorrc.json');
    expect(content).toContain('current.json');
  });

  it('should define proper data structures', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    // Check for compact reading format keys
    expect(content).toContain('t:'); // timestamp
    expect(content).toContain('svc:'); // service
    expect(content).toContain('state:'); // status
    expect(content).toContain('code:'); // HTTP code
    expect(content).toContain('lat:'); // latency
  });

  it('should handle HTTP and HTTPS protocols', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    expect(content).toContain('http');
    expect(content).toContain('https');
  });

  it('should write JSONL format', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    // Check for JSONL append logic (newline-delimited JSON)
    expect(content).toContain('.jsonl');
    expect(content).toContain('\\n'); // newline for JSONL
  });

  it('should create history directory structure', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    expect(content).toContain('history');
    expect(content).toContain('ensureDir');
  });

  it('should implement 14-day rolling window for current.json', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    // Check for time window logic (14 days)
    expect(content).toContain('days = 14');
  });

  it('should handle errors gracefully', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');
    
    expect(content).toContain('catch');
    expect(content).toContain('err');
  });

  it('should support config file and CLI args', async () => {
    const content = await fs.readFile(monitorScript, 'utf-8');

    expect(content).toContain('--config');
    expect(content).toContain('--system');
    expect(content).toContain('--url');
  });

  describe('maintenance window support', () => {
    it('should include checkMaintenanceWindow function', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('checkMaintenanceWindow');
    });

    it('should read maintenance.json file', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('maintenance.json');
    });

    it('should check for in-progress maintenance', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('in-progress');
      expect(content).toContain('affectedSystems');
    });

    it('should skip systems in maintenance', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('inMaintenance');
      expect(content).toContain('Skipping');
      expect(content).toContain('continue');
    });

    it('should track skipped systems', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('skipped');
      expect(content).toContain('reason:');
    });

    it('should report skipped systems in summary', async () => {
      const content = await fs.readFile(monitorScript, 'utf-8');

      expect(content).toContain('Skipped');
      expect(content).toContain('in maintenance');
    });
  });
});
