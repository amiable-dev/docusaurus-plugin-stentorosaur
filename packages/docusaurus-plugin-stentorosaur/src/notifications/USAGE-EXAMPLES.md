# Notification System - Usage Examples

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Configuration Patterns](#configuration-patterns)
3. [Sending Notifications](#sending-notifications)
4. [Custom Providers](#custom-providers)
5. [Error Handling](#error-handling)
6. [Testing](#testing)
7. [Integration with Stentorosaur](#integration-with-stentorosaur)

---

## Basic Setup

### Simple Configuration

```typescript
import { createNotificationService, createProvider } from './notifications';

const service = await createNotificationService(
  {
    providers: [
      {
        id: 'slack-alerts',
        type: 'slack',
        webhookUrl: 'env:SLACK_WEBHOOK',
        eventFilter: ['incident.opened', 'incident.closed'],
        minSeverity: 'major',
      },
    ],
  },
  createProvider
);

// Send notification
const event = {
  type: 'incident.opened',
  timestamp: new Date().toISOString(),
  incident: {
    id: 123,
    title: 'API Service Down',
    severity: 'critical',
    affectedEntities: ['api'],
    url: 'https://github.com/org/repo/issues/123',
    body: 'API service is not responding',
  },
};

const results = await service.notify(event);

for (const [providerId, result] of results) {
  if (result.success) {
    console.log(`✓ Notification sent via ${providerId}`);
  } else {
    console.error(`✗ ${providerId} failed: ${result.error.message}`);
  }
}
```

### Multiple Providers

```typescript
const service = await createNotificationService(
  {
    providers: [
      // Slack for all incidents
      {
        id: 'slack-incidents',
        type: 'slack',
        webhookUrl: 'env:SLACK_WEBHOOK',
        channel: '#incidents',
        eventFilter: [
          'incident.opened',
          'incident.updated',
          'incident.closed',
        ],
        mentionUsers: {
          critical: ['U12345', 'U67890'], // @mention on critical
        },
      },

      // Email for critical incidents only
      {
        id: 'email-critical',
        type: 'email',
        smtp: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: 'env:SMTP_USER',
            pass: 'env:SMTP_PASS',
          },
        },
        from: 'status@example.com',
        to: ['oncall@example.com', 'engineering@example.com'],
        eventFilter: ['incident.opened'],
        minSeverity: 'critical',
      },

      // PagerDuty for critical system failures
      {
        id: 'pagerduty',
        type: 'pagerduty',
        integrationKey: 'env:PAGERDUTY_KEY',
        eventFilter: ['incident.opened', 'system.down'],
        minSeverity: 'critical',
      },

      // Webhook to custom monitoring system
      {
        id: 'monitoring-webhook',
        type: 'webhook',
        url: 'https://monitoring.example.com/webhook',
        method: 'POST',
        authentication: {
          type: 'bearer',
          token: 'env:MONITORING_TOKEN',
        },
      },
    ],
    defaultContext: {
      statusPageUrl: 'https://status.example.com',
      organizationName: 'Acme Corp',
      environment: 'production',
    },
    maxConcurrency: 5,
    continueOnError: true,
  },
  createProvider
);
```

---

## Configuration Patterns

### Environment Variable Resolution

```typescript
// Configuration supports env: prefix for secrets
{
  providers: [
    {
      id: 'slack',
      type: 'slack',
      webhookUrl: 'env:SLACK_WEBHOOK', // Reads process.env.SLACK_WEBHOOK
    },
    {
      id: 'email',
      type: 'email',
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        auth: {
          user: 'env:SMTP_USER',
          pass: 'env:SMTP_PASS',
        },
      },
      from: 'status@example.com',
      to: ['team@example.com'],
    },
  ],
}

// Environment variables:
// SLACK_WEBHOOK=https://hooks.slack.com/services/...
// SMTP_USER=alerts@example.com
// SMTP_PASS=secretpassword
```

### Event Filtering

```typescript
// Only notify for specific event types
{
  id: 'slack-incidents',
  type: 'slack',
  webhookUrl: 'env:SLACK_WEBHOOK',
  eventFilter: [
    'incident.opened',
    'incident.closed',
    // Excludes: incident.updated, maintenance.*, system.*, slo.*
  ],
}

// Notify for all events (default)
{
  id: 'webhook-all',
  type: 'webhook',
  url: 'https://example.com/webhook',
  eventFilter: [], // Empty = all events
}
```

### Entity Filtering

```typescript
// Only notify for specific entities
{
  id: 'api-alerts',
  type: 'slack',
  webhookUrl: 'env:SLACK_WEBHOOK',
  entityFilter: ['api', 'database'],
  // Will only notify for incidents/events affecting api or database
}

// Notify for all entities (default)
{
  id: 'all-systems',
  type: 'email',
  entityFilter: [], // Empty = all entities
}
```

### Severity Filtering

```typescript
// Only notify for major and critical incidents
{
  id: 'pagerduty',
  type: 'pagerduty',
  integrationKey: 'env:PAGERDUTY_KEY',
  minSeverity: 'major',
  // Will notify for: critical, major
  // Will skip: minor
}

// Notify for all severities (default)
{
  id: 'slack',
  type: 'slack',
  webhookUrl: 'env:SLACK_WEBHOOK',
  minSeverity: 'minor', // Default
}
```

### Retry Configuration

```typescript
{
  id: 'flaky-service',
  type: 'webhook',
  url: 'https://flaky.example.com/webhook',
  retry: {
    maxAttempts: 5,          // Try up to 5 times
    initialDelay: 2000,      // Start with 2s delay
    backoffMultiplier: 2,    // Double delay each time
    maxDelay: 60000,         // Max 60s between retries
  },
}

// Retry sequence: 2s, 4s, 8s, 16s, 32s
```

### Rate Limiting

```typescript
{
  id: 'rate-limited-api',
  type: 'webhook',
  url: 'https://api.example.com/alerts',
  rateLimit: {
    maxNotifications: 10,  // Max 10 notifications
    periodMs: 60000,       // Per 60 seconds (1 minute)
  },
}

// If 11th notification arrives within 1 minute, it will be rejected
```

---

## Sending Notifications

### Single Event

```typescript
const event = {
  type: 'incident.opened',
  timestamp: new Date().toISOString(),
  incident: {
    id: 123,
    title: 'Database Connection Failed',
    severity: 'critical',
    affectedEntities: ['database', 'api'],
    url: 'https://github.com/org/repo/issues/123',
    body: 'Unable to connect to primary database',
  },
};

const results = await service.notify(event);

// Check results
for (const [providerId, result] of results) {
  if (result.success) {
    console.log(`Notification sent via ${providerId}`);
  } else {
    console.error(
      `${providerId} failed: ${result.error.code} - ${result.error.message}`
    );
    console.error(`Retryable: ${result.error.retryable}`);
  }
}
```

### Batch Events

```typescript
const events = [
  {
    type: 'incident.opened',
    timestamp: '2025-01-01T10:00:00Z',
    incident: { /* ... */ },
  },
  {
    type: 'system.down',
    timestamp: '2025-01-01T10:05:00Z',
    system: { /* ... */ },
  },
  {
    type: 'maintenance.scheduled',
    timestamp: '2025-01-01T10:10:00Z',
    maintenance: { /* ... */ },
  },
];

const batchResult = await service.notifyBatch({
  events,
  context: {
    statusPageUrl: 'https://status.example.com',
    organizationName: 'Acme Corp',
  },
});

console.log(`Total: ${batchResult.totalEvents}`);
console.log(`Successful: ${batchResult.successfulEvents}`);
console.log(`Failed: ${batchResult.failedEvents}`);

// Check individual event results
for (const { event, providerResults } of batchResult.results) {
  console.log(`Event ${event.type}:`);
  for (const [providerId, result] of providerResults) {
    console.log(`  ${providerId}: ${result.success ? '✓' : '✗'}`);
  }
}
```

### With Context

```typescript
const results = await service.notify(event, {
  statusPageUrl: 'https://status.example.com',
  organizationName: 'Acme Corp',
  environment: 'production',
  metadata: {
    runbookUrl: 'https://wiki.example.com/runbooks/api-down',
    escalationPolicy: 'tier1',
  },
});
```

---

## Custom Providers

### Simple Custom Provider

```typescript
import {
  BaseNotificationProvider,
  type ProviderLogger,
} from './notifications/providers/base-provider';
import type {
  BaseProviderConfig,
  NotificationContext,
  NotificationResult,
} from './notifications/types';
import { registerCustomProvider } from './notifications/provider-factory';

// 1. Define configuration type
interface CustomProviderConfig extends BaseProviderConfig {
  type: 'custom';
  apiKey: string;
  endpoint: string;
  customField?: string;
}

// 2. Implement provider class
class CustomProvider extends BaseNotificationProvider<CustomProviderConfig> {
  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    try {
      const message = this.formatMessage(context);

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          event: context.event.type,
          timestamp: context.event.timestamp,
        }),
      });

      if (!response.ok) {
        return this.createError(
          'API_ERROR',
          `HTTP ${response.status}`,
          response.status >= 500 // Retry on server errors
        );
      }

      return this.createSuccess();
    } catch (error) {
      return this.createError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        true // Network errors are retryable
      );
    }
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    if (!this.config.apiKey) {
      return this.createError('INVALID_CONFIG', 'API key required', false);
    }

    if (!this.config.endpoint) {
      return this.createError('INVALID_CONFIG', 'Endpoint required', false);
    }

    return this.createSuccess();
  }
}

// 3. Register provider
registerCustomProvider('custom', CustomProvider);

// 4. Use in configuration
const service = await createNotificationService(
  {
    providers: [
      {
        id: 'my-custom',
        type: 'custom',
        apiKey: 'env:CUSTOM_API_KEY',
        endpoint: 'https://api.custom.com/alerts',
        customField: 'some-value',
      },
    ],
  },
  createProvider
);
```

### Advanced Custom Provider with Rich Formatting

```typescript
class AdvancedCustomProvider extends BaseNotificationProvider<CustomProviderConfig> {
  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    const payload = this.buildRichPayload(context);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`API error: ${body}`);
        return this.createError('API_ERROR', body, response.status >= 500);
      }

      return this.createSuccess();
    } catch (error) {
      return this.createError('NETWORK_ERROR', String(error), true);
    }
  }

  private buildRichPayload(context: NotificationContext) {
    const event = context.event;

    // Build provider-specific payload
    switch (event.type) {
      case 'incident.opened':
        return {
          type: 'incident',
          action: 'opened',
          severity: event.incident.severity,
          title: event.incident.title,
          affectedSystems: event.incident.affectedEntities,
          url: event.incident.url,
          description: event.incident.body,
          timestamp: event.timestamp,
          metadata: {
            organization: context.organizationName,
            statusPage: context.statusPageUrl,
            environment: context.environment,
          },
        };

      case 'incident.closed':
        return {
          type: 'incident',
          action: 'closed',
          title: event.incident.title,
          duration: event.incident.duration,
          affectedSystems: event.incident.affectedEntities,
          url: event.incident.url,
          timestamp: event.timestamp,
        };

      case 'system.down':
        return {
          type: 'system',
          action: 'down',
          system: event.system.name,
          systemType: event.system.type,
          error: event.system.error,
          lastCheck: event.system.lastCheck,
          timestamp: event.timestamp,
        };

      default:
        return {
          type: 'generic',
          event: event.type,
          timestamp: event.timestamp,
          data: event,
        };
    }
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    // Validate configuration
    if (!this.config.apiKey) {
      return this.createError('INVALID_CONFIG', 'API key required', false);
    }

    // Test connection (optional)
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });

      if (!response.ok) {
        return this.createError(
          'CONNECTION_ERROR',
          'Unable to connect to endpoint',
          false
        );
      }
    } catch {
      this.logger.warn('Could not verify endpoint connectivity');
    }

    return this.createSuccess();
  }
}
```

---

## Error Handling

### Handling Failed Notifications

```typescript
const results = await service.notify(event);

for (const [providerId, result] of results) {
  if (!result.success) {
    const error = result.error;

    console.error(`Provider ${providerId} failed:`);
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    console.error(`  Retryable: ${error.retryable}`);
    console.error(`  Timestamp: ${error.timestamp}`);

    // Send to error tracking
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error.originalError, {
        tags: {
          provider: error.provider,
          errorCode: error.code,
        },
      });
    }

    // Trigger fallback notification
    if (!error.retryable) {
      await sendFallbackNotification(event);
    }
  }
}
```

### Retry Logic

```typescript
// Built-in retry with exponential backoff
{
  id: 'webhook',
  type: 'webhook',
  url: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000,
  },
}

// Manual retry for entire batch
async function notifyWithRetry(
  service: NotificationService,
  event: NotificationEvent,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const results = await service.notify(event);

    const allSuccess = Array.from(results.values()).every(r => r.success);
    if (allSuccess) {
      return results;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }

  throw new Error('All retry attempts failed');
}
```

---

## Testing

### Mocking Providers

```typescript
import { BaseNotificationProvider } from './providers/base-provider';

class MockProvider extends BaseNotificationProvider {
  public sendCalled = 0;
  public lastContext?: NotificationContext;

  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    this.sendCalled++;
    this.lastContext = context;
    return this.createSuccess();
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    return this.createSuccess();
  }
}

// Use in tests
const mockProvider = new MockProvider({
  id: 'test',
  type: 'mock',
});

const factory = jest.fn().mockReturnValue(mockProvider);

const service = new NotificationService(
  {
    providers: [{ id: 'test', type: 'mock' }],
  },
  factory
);

await service.initialize();
await service.notify(testEvent);

expect(mockProvider.sendCalled).toBe(1);
expect(mockProvider.lastContext?.event.type).toBe('incident.opened');
```

### Testing Custom Providers

```typescript
describe('CustomProvider', () => {
  let provider: CustomProvider;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    provider = new CustomProvider({
      id: 'test',
      type: 'custom',
      apiKey: 'test-key',
      endpoint: 'https://api.example.com',
    });
  });

  it('should send notification successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const context: NotificationContext = {
      event: {
        type: 'incident.opened',
        timestamp: '2025-01-01T00:00:00Z',
        incident: {
          id: 123,
          title: 'Test Incident',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://example.com',
          body: 'Test body',
        },
      },
    };

    const result = await provider.send(context);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      })
    );
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await provider.send(testContext);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NETWORK_ERROR');
    expect(result.error.retryable).toBe(true);
  });
});
```

---

## Integration with Stentorosaur

### In GitHub Actions Workflow

```yaml
# .github/workflows/status-update.yml
name: Update Status

on:
  issues:
    types: [opened, closed, labeled, unlabeled]
  schedule:
    - cron: '0 * * * *' # Hourly

jobs:
  update-status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update status and send notifications
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
          PAGERDUTY_KEY: ${{ secrets.PAGERDUTY_KEY }}
        run: |
          npx stentorosaur-update-status \
            --write-incidents \
            --write-maintenance \
            --notify \
            --verbose
```

### In Docusaurus Plugin

```typescript
// src/index.ts
import { createNotificationService, createProvider } from './notifications';

export default function pluginStatus(context, options) {
  let notificationService: NotificationService | null = null;

  return {
    name: 'docusaurus-plugin-stentorosaur',

    async loadContent() {
      // Initialize notification service if configured
      if (options.notifications?.enabled) {
        notificationService = await createNotificationService(
          {
            providers: options.notifications.providers,
            defaultContext: {
              statusPageUrl: `${context.siteConfig.url}/status`,
              organizationName: context.siteConfig.organizationName,
            },
          },
          createProvider
        );
      }

      // Fetch status data
      const statusData = await fetchStatusData(options);

      // Send notifications for new incidents
      if (notificationService) {
        await notifyNewIncidents(notificationService, statusData);
      }

      return statusData;
    },

    async postBuild() {
      // Cleanup
      if (notificationService) {
        await notificationService.shutdown();
      }
    },
  };
}

async function notifyNewIncidents(
  service: NotificationService,
  statusData: StatusData
) {
  for (const incident of statusData.incidents) {
    if (incident.state === 'open' && !incident.notified) {
      await service.notify({
        type: 'incident.opened',
        timestamp: incident.created_at,
        incident: {
          id: incident.number,
          title: incident.title,
          severity: incident.severity,
          affectedEntities: incident.affectedEntities,
          url: incident.html_url,
          body: incident.body,
        },
      });

      // Mark as notified (persist to file)
      incident.notified = true;
    }
  }
}
```

### Configuration in docusaurus.config.js

```javascript
module.exports = {
  plugins: [
    [
      '@amiable-dev/docusaurus-plugin-stentorosaur',
      {
        owner: 'myorg',
        repo: 'status',
        notifications: {
          enabled: true,
          providers: [
            {
              id: 'slack-incidents',
              type: 'slack',
              webhookUrl: 'env:SLACK_WEBHOOK',
              channel: '#incidents',
              eventFilter: ['incident.opened', 'incident.closed'],
              minSeverity: 'major',
            },
            {
              id: 'pagerduty-critical',
              type: 'pagerduty',
              integrationKey: 'env:PAGERDUTY_KEY',
              eventFilter: ['incident.opened'],
              minSeverity: 'critical',
            },
          ],
        },
      },
    ],
  ],
};
```
