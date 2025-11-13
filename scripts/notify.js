#!/usr/bin/env node

/**
 * CLI tool for sending status notifications to configured channels
 * Usage: stentorosaur-notify --config .notifyrc.json --events events.json
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  config: null,
  events: 'events.json',
  verbose: false,
  dryRun: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--config':
      options.config = args[++i];
      break;
    case '--events':
      options.events = args[++i];
      break;
    case '--verbose':
      options.verbose = true;
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Usage: stentorosaur-notify [options]

Options:
  --config <path>     Path to .notifyrc.json configuration file (required)
  --events <path>     Path to events.json file (default: events.json)
  --verbose           Enable verbose logging
  --dry-run           Simulate notifications without sending
  --help, -h          Show this help message

Examples:
  stentorosaur-notify --config .notifyrc.json
  stentorosaur-notify --config .notifyrc.json --events custom-events.json --verbose
  stentorosaur-notify --config .notifyrc.json --dry-run
`);
      process.exit(0);
  }
}

if (!options.config) {
  console.error('Error: --config is required');
  process.exit(1);
}

async function main() {
  try {
    // Load configuration
    const configPath = path.resolve(options.config);
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Config file not found: ${configPath}`);
      process.exit(1);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    let config = JSON.parse(configContent);

    // Resolve environment variables
    config = resolveEnvVars(config);

    if (options.verbose) {
      console.log('[notify] Loaded configuration from:', configPath);
      console.log('[notify] Enabled channels:', Object.keys(config.channels || {}).filter(k => config.channels[k]?.enabled));
    }

    // Load events
    const eventsPath = path.resolve(options.events);
    let events = [];

    if (fs.existsSync(eventsPath)) {
      const eventsContent = fs.readFileSync(eventsPath, 'utf-8');
      const parsed = JSON.parse(eventsContent);
      events = Array.isArray(parsed) ? parsed : [parsed];

      if (options.verbose) {
        console.log(`[notify] Loaded ${events.length} event(s) from:`, eventsPath);
      }
    } else {
      if (options.verbose) {
        console.log('[notify] No events file found, skipping notifications');
      }
      process.exit(0);
    }

    if (events.length === 0) {
      if (options.verbose) {
        console.log('[notify] No events to process');
      }
      process.exit(0);
    }

    // Import and initialize notification service
    const { SimpleNotificationService } = require('../lib/notifications/simple-notification-service');

    if (options.dryRun) {
      console.log('[notify] DRY RUN MODE - No notifications will be sent');
      console.log('[notify] Events:', JSON.stringify(events, null, 2));
      console.log('[notify] Configuration:', JSON.stringify(sanitizeConfig(config), null, 2));
      process.exit(0);
    }

    const service = new SimpleNotificationService(config);

    // Send notifications
    const results = await service.sendNotifications(events);

    // Report results
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[notify] Sent ${successCount} notification(s) successfully`);

    if (failureCount > 0) {
      console.warn(`[notify] ${failureCount} notification(s) failed`);

      if (options.verbose) {
        const failures = results.filter(r => !r.success);
        failures.forEach(f => {
          console.error(`[notify] Failed: ${f.provider} - ${f.error?.message}`);
        });
      }
    }

    // Exit with error code if any notifications failed (non-blocking in workflow)
    process.exit(failureCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('[notify] Fatal error:', error.message);
    if (options.verbose && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Resolve environment variables in configuration
 * Replaces "env:VAR_NAME" with process.env.VAR_NAME
 */
function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    if (obj.startsWith('env:')) {
      const varName = obj.slice(4);
      const value = process.env[varName];

      if (!value) {
        throw new Error(`Missing environment variable: ${varName}`);
      }

      return value;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => resolveEnvVars(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVars(value);
    }
    return resolved;
  }

  return obj;
}

/**
 * Remove sensitive data for logging
 */
function sanitizeConfig(config) {
  const sanitized = JSON.parse(JSON.stringify(config));

  if (sanitized.channels) {
    for (const channel of Object.values(sanitized.channels)) {
      if (channel.webhookUrl) channel.webhookUrl = '[REDACTED]';
      if (channel.botToken) channel.botToken = '[REDACTED]';
      if (channel.smtp?.auth?.pass) channel.smtp.auth.pass = '[REDACTED]';
    }
  }

  return sanitized;
}

main();
