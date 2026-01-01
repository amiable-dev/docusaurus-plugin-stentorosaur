#!/usr/bin/env node

/**
 * Bootstrap script to generate initial daily-summary.json from existing archives
 *
 * This script is typically run once when upgrading to a version that supports
 * historical data aggregation (ADR-002). It reads all existing archive files
 * and generates the initial daily-summary.json.
 *
 * Usage:
 *   node scripts/bootstrap-summary.js --output-dir status-data
 *   node scripts/bootstrap-summary.js --output-dir status-data --window 90
 *
 * Options:
 *   --output-dir <path>  Output directory containing archives/ (default: status-data)
 *   --window <days>      Number of days to aggregate (default: 90)
 *   --verbose            Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  outputDir: 'status-data',
  windowDays: 90,
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--output-dir':
      options.outputDir = args[++i];
      break;
    case '--window':
      options.windowDays = parseInt(args[++i]);
      break;
    case '--verbose':
      options.verbose = true;
      break;
  }
}

function log(...msg) {
  console.log('[bootstrap-summary]', ...msg);
}

function verbose(...msg) {
  if (options.verbose) {
    console.log('[bootstrap-summary:verbose]', ...msg);
  }
}

/**
 * Calculate p95 latency from an array of latency values
 */
function calculateP95(latencies) {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Aggregate readings for a specific day into a DailySummaryEntry
 */
function aggregateDayReadings(date, readings) {
  const checksTotal = readings.length;
  const checksPassed = readings.filter(r => r.state === 'up' || r.state === 'maintenance').length;
  const uptimePct = checksTotal > 0 ? checksPassed / checksTotal : 0;

  const latencies = readings
    .filter(r => r.state === 'up')
    .map(r => r.lat);

  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length)
    : null;

  const p95LatencyMs = calculateP95(latencies);

  // Count incidents (transitions from up to down)
  let incidentCount = 0;
  for (let i = 1; i < readings.length; i++) {
    if (readings[i - 1].state === 'up' && readings[i].state === 'down') {
      incidentCount++;
    }
  }

  return {
    date,
    uptimePct,
    avgLatencyMs,
    p95LatencyMs,
    checksTotal,
    checksPassed,
    incidentCount,
  };
}

/**
 * Generate daily-summary.json from existing archives
 */
function generateDailySummary(archivesDir, outputDir, windowDays) {
  const now = new Date();

  // Group all readings by service and date
  const serviceReadings = new Map();

  // Collect from last N days
  for (let d = 0; d < windowDays; d++) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const dir = path.join(archivesDir, String(year), month);
    const plainFile = path.join(dir, `history-${year}-${month}-${day}.jsonl`);
    const gzFile = path.join(dir, `history-${year}-${month}-${day}.jsonl.gz`);

    let content = null;

    // Try plain file first
    if (fs.existsSync(plainFile)) {
      try {
        content = fs.readFileSync(plainFile, 'utf8');
        verbose(`Read ${plainFile}`);
      } catch (err) {
        verbose(`Failed to read ${plainFile}:`, err.message);
      }
    }
    // Try gzipped file
    else if (fs.existsSync(gzFile)) {
      try {
        const compressed = fs.readFileSync(gzFile);
        content = zlib.gunzipSync(compressed).toString('utf8');
        verbose(`Read ${gzFile}`);
      } catch (err) {
        verbose(`Failed to decompress ${gzFile}:`, err.message);
      }
    }

    // Parse and group by service
    if (content) {
      const lines = content.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const svc = obj.svc;

          if (!serviceReadings.has(svc)) {
            serviceReadings.set(svc, new Map());
          }

          const svcMap = serviceReadings.get(svc);
          if (!svcMap.has(dateKey)) {
            svcMap.set(dateKey, []);
          }
          svcMap.get(dateKey).push(obj);
        } catch (err) {
          verbose('Failed to parse line:', line);
        }
      }
    }
  }

  // Aggregate each service's daily data
  const services = {};
  let totalDays = 0;

  for (const [svc, dateMap] of serviceReadings.entries()) {
    const entries = [];

    // Sort dates in reverse chronological order (most recent first)
    const sortedDates = [...dateMap.keys()].sort().reverse();
    totalDays = Math.max(totalDays, sortedDates.length);

    for (const dateKey of sortedDates) {
      const readings = dateMap.get(dateKey);
      // Sort readings by timestamp for accurate incident counting
      readings.sort((a, b) => a.t - b.t);

      const entry = aggregateDayReadings(dateKey, readings);
      entries.push(entry);
    }

    services[svc] = entries;
  }

  // Build the daily summary file (ADR-002 schema v1)
  const summary = {
    version: 1,
    lastUpdated: now.toISOString(),
    windowDays,
    services,
  };

  // Atomic write: temp file → rename
  const summaryPath = path.join(outputDir, 'daily-summary.json');
  const tempPath = path.join(outputDir, 'daily-summary.tmp');

  fs.writeFileSync(tempPath, JSON.stringify(summary, null, 2));
  fs.renameSync(tempPath, summaryPath);

  return { summary, totalDays };
}

// Main execution
function main() {
  try {
    const archivesDir = path.join(options.outputDir, 'archives');

    if (!fs.existsSync(archivesDir)) {
      console.error(`Error: Archives directory not found: ${archivesDir}`);
      console.error('Make sure --output-dir points to the correct status data directory.');
      process.exit(1);
    }

    log(`Generating daily-summary.json from ${archivesDir}...`);
    log(`Window: ${options.windowDays} days`);

    const { summary, totalDays } = generateDailySummary(
      archivesDir,
      options.outputDir,
      options.windowDays
    );

    const serviceCount = Object.keys(summary.services).length;
    log(`\nGenerated daily-summary.json:`);
    log(`  Services: ${serviceCount}`);
    log(`  Days with data: ${totalDays}`);
    log(`  Window: ${options.windowDays} days`);
    log(`  Output: ${path.join(options.outputDir, 'daily-summary.json')}`);

    if (serviceCount === 0) {
      log('\nWarning: No data found. Make sure archives contain JSONL files.');
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
