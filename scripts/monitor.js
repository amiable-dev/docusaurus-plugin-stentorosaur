#!/usr/bin/env node

/**
 * Status monitoring script with append-only data storage
 * Based on Issue #19 design: hot file + daily JSONL archives
 * 
 * Data structure:
 * - current.json: Rolling window of last 14 days (small, for fast site loads)
 * - archives/YYYY/MM/history-YYYY-MM-DD.jsonl: One JSONL file per day
 * - Today's file stays uncompressed for easy appends
 * - Yesterday's file gets gzipped once per day (handled by separate workflow)
 * 
 * Usage:
 *   node scripts/monitor.js --system api --url https://api.example.com/health
 *   node scripts/monitor.js --system website --url https://example.com
 *   node scripts/monitor.js --config .monitorrc.json
 * 
 * Options:
 *   --system <name>     System name (e.g., 'api', 'website')
 *   --url <url>         URL to monitor
 *   --method <method>   HTTP method (default: GET)
 *   --timeout <ms>      Request timeout in ms (default: 10000)
 *   --expected-codes    Comma-separated expected status codes (default: 200,301,302)
 *   --max-response-time Maximum response time before degraded (default: 30000)
 *   --output-dir <path> Output directory (default: status-data)
 *   --config <file>     JSON config file with system definitions
 *   --verbose           Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  system: null,
  url: null,
  method: 'GET',
  timeout: 10000,
  expectedCodes: [200, 301, 302],
  maxResponseTime: 30000,
  outputDir: 'status-data',
  config: null,
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--system':
      options.system = args[++i];
      break;
    case '--url':
      options.url = args[++i];
      break;
    case '--method':
      options.method = args[++i].toUpperCase();
      break;
    case '--timeout':
      options.timeout = parseInt(args[++i]);
      break;
    case '--expected-codes':
      options.expectedCodes = args[++i].split(',').map(c => parseInt(c.trim()));
      break;
    case '--max-response-time':
      options.maxResponseTime = parseInt(args[++i]);
      break;
    case '--output-dir':
      options.outputDir = args[++i];
      break;
    case '--config':
      options.config = args[++i];
      break;
    case '--verbose':
      options.verbose = true;
      break;
  }
}

function log(...msg) {
  console.log('[monitor]', ...msg);
}

function verbose(...msg) {
  if (options.verbose) {
    console.log('[monitor:verbose]', ...msg);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Make HTTP(S) request and measure response time
 */
function checkEndpoint(url, method = 'GET', timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        timeout,
        headers: {
          'User-Agent': 'docusaurus-plugin-stentorosaur-monitor/1.0',
        },
      },
      (res) => {
        const responseTime = Date.now() - startTime;
        
        // Consume response body to free up socket
        res.on('data', () => {});
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            responseTime,
            error: null,
          });
        });
      }
    );
    
    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      resolve({
        statusCode: 0,
        responseTime,
        error: error.message,
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        statusCode: 0,
        responseTime,
        error: 'Timeout',
      });
    });
    
    req.end();
  });
}

/**
 * Determine status from response
 */
function determineStatus(statusCode, responseTime, expectedCodes, maxResponseTime) {
  if (statusCode === 0 || !expectedCodes.includes(statusCode)) {
    return 'down';
  }
  if (responseTime > maxResponseTime) {
    return 'degraded';
  }
  return 'up';
}

/**
 * Append reading to today's JSONL file
 */
function appendToJSONL(file, data) {
  const line = JSON.stringify(data) + '\n';
  fs.appendFileSync(file, line);
}

/**
 * Build current.json from last N days of JSONL files
 */
function buildCurrentJson(archivesDir, days = 14) {
  const now = new Date();
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const readings = [];
  
  // Collect from last N days
  for (let d = 0; d < days; d++) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const dir = path.join(archivesDir, String(year), month);
    const plainFile = path.join(dir, `history-${year}-${month}-${day}.jsonl`);
    
    if (fs.existsSync(plainFile)) {
      const content = fs.readFileSync(plainFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.t >= cutoff) {
            readings.push(obj);
          }
        } catch (err) {
          verbose('Failed to parse line:', line, err.message);
        }
      }
    }
  }
  
  // Sort by timestamp
  readings.sort((a, b) => a.t - b.t);
  
  return readings;
}

/**
 * Generate status.json from current.json for plugin consumption
 * Aggregates time-series data into status items
 */
function generateStatusJson(currentJsonPath, outputDir) {
  const currentData = JSON.parse(fs.readFileSync(currentJsonPath, 'utf8'));
  
  // Group readings by system
  const systemMap = new Map();
  
  for (const reading of currentData) {
    if (!systemMap.has(reading.svc)) {
      systemMap.set(reading.svc, []);
    }
    systemMap.get(reading.svc).push(reading);
  }
  
  // Calculate stats for each system
  const items = [];
  
  for (const [systemName, readings] of systemMap.entries()) {
    // Sort by timestamp (most recent first)
    readings.sort((a, b) => b.t - a.t);
    
    const latest = readings[0];
    
    // Calculate uptime (percentage of 'up' readings)
    const upReadings = readings.filter(r => r.state === 'up').length;
    const uptime = readings.length > 0 ? (upReadings / readings.length) * 100 : 0;
    
    // Calculate average response time (only from 'up' readings)
    const upTimes = readings.filter(r => r.state === 'up').map(r => r.lat);
    const avgResponseTime = upTimes.length > 0
      ? Math.round(upTimes.reduce((sum, lat) => sum + lat, 0) / upTimes.length)
      : undefined;
    
    items.push({
      name: systemName,
      status: latest.state,
      lastChecked: new Date(latest.t).toISOString(),
      responseTime: avgResponseTime,
      uptime: Math.round(uptime * 100) / 100,
      incidentCount: 0, // TODO: Could calculate from state changes
    });
  }
  
  const statusData = {
    items,
    incidents: [],
    maintenance: [],
    lastUpdated: new Date().toISOString(),
    showServices: true,
    showIncidents: true,
    showPerformanceMetrics: true,
    useDemoData: false,
  };
  
  const statusPath = path.join(outputDir, 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
  verbose(`Generated ${statusPath}`);
  
  return statusData;
}

/**
 * Monitor a single system
 */
async function monitorSystem(systemConfig) {
  const { system, url, method, timeout, expectedCodes, maxResponseTime, outputDir } = systemConfig;
  
  log(`Checking ${system} at ${url}...`);
  
  const result = await checkEndpoint(url, method, timeout);
  const status = determineStatus(result.statusCode, result.responseTime, expectedCodes, maxResponseTime);
  
  const reading = {
    t: Date.now(),
    svc: system,
    state: status,
    code: result.statusCode,
    lat: result.responseTime,
    err: result.error || undefined,
  };
  
  verbose('Reading:', reading);
  
  // Determine file paths
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  const archivesDir = path.join(outputDir, 'archives');
  const dayDir = path.join(archivesDir, String(year), month);
  const todayFile = path.join(dayDir, `history-${year}-${month}-${day}.jsonl`);
  
  // Ensure directory exists
  ensureDir(dayDir);
  
  // Append to today's JSONL file
  appendToJSONL(todayFile, reading);
  verbose(`Appended to ${todayFile}`);
  
  // Rebuild current.json (rolling 14-day window)
  const currentJson = buildCurrentJson(archivesDir, 14);
  const currentPath = path.join(outputDir, 'current.json');
  fs.writeFileSync(currentPath, JSON.stringify(currentJson));
  verbose(`Updated ${currentPath} (${currentJson.length} readings)`);
  
  // Generate commit message
  const emoji = status === 'up' ? '🟩' : status === 'degraded' ? '🟨' : '🟥';
  const message = status === 'up'
    ? `${emoji} ${system} is up (${result.statusCode} in ${result.responseTime} ms)`
    : status === 'degraded'
    ? `${emoji} ${system} degraded (${result.statusCode} in ${result.responseTime} ms)`
    : `${emoji} ${system} is down (${result.statusCode})`;
  
  log(message);
  
  // Write commit message to output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit_message=${message}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `status_code=${result.statusCode}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `response_time=${result.responseTime}\n`);
  }
  
  return {
    system,
    status,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    commitMessage: message,
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    let systems = [];
    
    // Load from config file if provided
    if (options.config) {
      verbose('Loading config from:', options.config);
      const configContent = fs.readFileSync(options.config, 'utf8');
      const config = JSON.parse(configContent);
      systems = config.systems || [];
    }
    // Or use command line arguments
    else if (options.system && options.url) {
      systems = [{
        system: options.system,
        url: options.url,
        method: options.method,
        timeout: options.timeout,
        expectedCodes: options.expectedCodes,
        maxResponseTime: options.maxResponseTime,
        outputDir: options.outputDir,
      }];
    } else {
      console.error('Error: Must provide either --config or both --system and --url');
      process.exit(1);
    }
    
    if (systems.length === 0) {
      console.error('Error: No systems to monitor');
      process.exit(1);
    }
    
    // Monitor all systems
    const results = [];
    for (const systemConfig of systems) {
      // Merge with defaults
      const config = {
        ...options,
        ...systemConfig,
      };
      
      const result = await monitorSystem(config);
      results.push(result);
    }
    
    // Generate status.json from current.json for plugin consumption
    const currentPath = path.join(options.outputDir, 'current.json');
    if (fs.existsSync(currentPath)) {
      generateStatusJson(currentPath, options.outputDir);
      log('Generated status.json for plugin');
    }
    
    // Summary
    log(`\nMonitored ${results.length} system(s):`);
    for (const result of results) {
      const emoji = result.status === 'up' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
      log(`  ${emoji} ${result.system}: ${result.status} (${result.statusCode} in ${result.responseTime}ms)`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
