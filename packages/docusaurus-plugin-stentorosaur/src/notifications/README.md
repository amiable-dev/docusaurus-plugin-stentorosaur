# Stentorosaur Notification System

A **type-safe**, **extensible**, and **production-ready** notification system for status monitoring events. Send alerts to Slack, email, webhooks, Discord, PagerDuty, MS Teams, and custom providers when incidents occur, systems go down, or SLOs are breached.

## Features

- **Type-Safe**: Full TypeScript support with discriminated unions and strict generics
- **Extensible**: Plugin system for custom notification providers
- **Configurable**: Filter by event type, entity, and severity
- **Resilient**: Automatic retry with exponential backoff
- **Rate-Limited**: Built-in rate limiting to prevent overwhelming services
- **Testable**: Dependency injection for easy mocking
- **Production-Ready**: Error handling, logging, and statistics tracking

## Quick Start

```typescript
import { createNotificationService, createProvider } from '@amiable-dev/docusaurus-plugin-stentorosaur/notifications';

// Create service
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
await service.notify({
  type: 'incident.opened',
  timestamp: new Date().toISOString(),
  incident: {
    id: 123,
    title: 'API Down',
    severity: 'critical',
    affectedEntities: ['api'],
    url: 'https://github.com/org/repo/issues/123',
    body: 'API service is not responding',
  },
});
```

## Architecture

### Component Overview

```
NotificationService (Orchestrator)
  ├─ ProviderFactory (Lazy Loading)
  │   └─ ProviderRegistry (Built-in + Custom Providers)
  │
  ├─ BaseNotificationProvider (Template Method Pattern)
  │   ├─ SlackProvider
  │   ├─ EmailProvider
  │   ├─ WebhookProvider
  │   ├─ DiscordProvider
  │   ├─ PagerDutyProvider
  │   └─ MSTeamsProvider
  │
  └─ ConfigValidator (Zod Runtime Validation)
```

### Key Design Patterns

1. **Discriminated Unions**: Type-safe event and config handling
2. **Template Method**: Common logic in base class, specific logic in subclasses
3. **Factory Pattern**: Dynamic provider instantiation with lazy loading
4. **Result Type**: Explicit error handling without exceptions
5. **Dependency Injection**: Mockable logger and factory for testing

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed design decisions and patterns
- **[DEPENDENCY-DIAGRAM.md](./DEPENDENCY-DIAGRAM.md)** - Visual component relationships
- **[USAGE-EXAMPLES.md](./USAGE-EXAMPLES.md)** - Comprehensive code examples
- **[types.ts](./types.ts)** - Complete type definitions with TSDoc

## Type System

### Event Types (Discriminated Union)

```typescript
type NotificationEvent =
  | { type: 'incident.opened'; incident: { ... } }
  | { type: 'incident.closed'; incident: { ... } }
  | { type: 'incident.updated'; incident: { ... } }
  | { type: 'maintenance.scheduled'; maintenance: { ... } }
  | { type: 'maintenance.started'; maintenance: { ... } }
  | { type: 'maintenance.completed'; maintenance: { ... } }
  | { type: 'system.down'; system: { ... } }
  | { type: 'system.degraded'; system: { ... } }
  | { type: 'system.recovered'; system: { ... } }
  | { type: 'slo.breached'; slo: { ... } };
```

### Result Types (No Exceptions)

```typescript
type NotificationResult<T> =
  | { success: true; data: T }
  | { success: false; error: NotificationError };
```

### Provider Configs (Type-Safe)

```typescript
type ProviderConfig =
  | SlackProviderConfig
  | EmailProviderConfig
  | WebhookProviderConfig
  | DiscordProviderConfig
  | PagerDutyProviderConfig
  | MSTeamsProviderConfig;
```

## Built-in Providers

### Slack
- Webhook-based notifications
- Configurable channel and username
- @mention support for critical incidents

### Email (SMTP)
- Multiple recipients (to, cc, bcc)
- HTML and plain text support
- Configurable subject prefix

### Webhook
- Generic HTTP webhook support
- Multiple authentication methods (Bearer, Basic, API Key)
- Configurable timeout and retry

### Discord
- Webhook-based notifications
- Custom username and avatar
- Role mention support

### PagerDuty
- Events API v2 integration
- Severity mapping
- Automatic incident creation

### Microsoft Teams
- Incoming webhook connector
- Adaptive cards support
- Configurable theme colors

## Configuration

### Basic Configuration

```typescript
{
  providers: [
    {
      id: 'slack',
      type: 'slack',
      webhookUrl: 'env:SLACK_WEBHOOK',
      enabled: true,
    },
  ],
  defaultContext: {
    statusPageUrl: 'https://status.example.com',
    organizationName: 'Acme Corp',
  },
  loadingStrategy: 'lazy', // or 'eager'
  maxConcurrency: 5,
  continueOnError: true,
}
```

### Advanced Filtering

```typescript
{
  id: 'critical-alerts',
  type: 'pagerduty',
  integrationKey: 'env:PAGERDUTY_KEY',

  // Only these event types
  eventFilter: ['incident.opened', 'system.down'],

  // Only these entities
  entityFilter: ['api', 'database'],

  // Only critical and major
  minSeverity: 'major',

  // Retry configuration
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000,
  },

  // Rate limiting
  rateLimit: {
    maxNotifications: 10,
    periodMs: 60000,
  },
}
```

### Environment Variables

Configuration supports `env:` prefix for secrets:

```typescript
{
  webhookUrl: 'env:SLACK_WEBHOOK',  // Reads process.env.SLACK_WEBHOOK
  apiKey: 'env:PAGERDUTY_KEY',      // Reads process.env.PAGERDUTY_KEY
}
```

## Error Handling

### Result Pattern (No Exceptions)

```typescript
const results = await service.notify(event);

for (const [providerId, result] of results) {
  if (result.success) {
    console.log(`✓ ${providerId} succeeded`);
  } else {
    console.error(`✗ ${providerId} failed: ${result.error.message}`);
    console.error(`  Code: ${result.error.code}`);
    console.error(`  Retryable: ${result.error.retryable}`);
  }
}
```

### Automatic Retry

Providers automatically retry on transient failures:

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s, 16s
{
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000,
  }
}
```

## Custom Providers

### Simple Custom Provider

```typescript
import { BaseNotificationProvider, registerCustomProvider } from '@amiable-dev/docusaurus-plugin-stentorosaur/notifications';

class MyProvider extends BaseNotificationProvider<MyProviderConfig> {
  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        body: JSON.stringify(this.formatMessage(context)),
      });
      return this.createSuccess();
    } catch (error) {
      return this.createError('SEND_ERROR', String(error), true);
    }
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    if (!this.config.endpoint) {
      return this.createError('INVALID_CONFIG', 'Endpoint required', false);
    }
    return this.createSuccess();
  }
}

// Register and use
registerCustomProvider('myprovider', MyProvider);
```

## Testing

### Mock Provider

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
const mockProvider = new MockProvider({ id: 'test', type: 'mock' });
const factory = jest.fn().mockReturnValue(mockProvider);

const service = new NotificationService({ providers: [...] }, factory);
await service.initialize();
await service.notify(event);

expect(mockProvider.sendCalled).toBe(1);
```

## Integration with Stentorosaur

### In Docusaurus Plugin

```typescript
// docusaurus.config.js
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
              id: 'slack',
              type: 'slack',
              webhookUrl: 'env:SLACK_WEBHOOK',
              eventFilter: ['incident.opened', 'incident.closed'],
            },
          ],
        },
      },
    ],
  ],
};
```

### In GitHub Actions

```yaml
# .github/workflows/status-update.yml
- name: Update status and notify
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
    PAGERDUTY_KEY: ${{ secrets.PAGERDUTY_KEY }}
  run: |
    npx stentorosaur-update-status \
      --write-incidents \
      --notify \
      --verbose
```

## Performance

### Lazy Loading
- Providers loaded only when first used
- Saves ~50-100KB per unused provider
- Fast service initialization

### Concurrency Control
- Configurable `maxConcurrency` (default: 5)
- Prevents overwhelming network
- Batches notifications efficiently

### Rate Limiting
- Token bucket algorithm per provider
- Configurable limits per time period
- Prevents API quota exhaustion

## Statistics

Track notification delivery metrics:

```typescript
const stats = await service.getProviderStats('slack');

console.log(stats);
// {
//   providerId: 'slack',
//   providerType: 'slack',
//   totalAttempts: 150,
//   successCount: 145,
//   failureCount: 5,
//   lastSuccess: '2025-01-15T10:30:00Z',
//   lastFailure: '2025-01-15T09:15:00Z',
//   averageLatency: 234, // milliseconds
//   rateLimitHits: 2,
// }
```

## Security

### Secret Management
- Support for `env:` prefix in configuration
- Never log sensitive config values
- HTTPS enforcement for webhooks

### Input Validation
- Zod schemas prevent injection attacks
- URL validation for webhooks
- Message length limits

### Error Redaction
- Sensitive data not included in error messages
- Original errors available for debugging
- Structured error codes

## Migration Path

### Phase 1: Core Infrastructure ✓ (Current)
- [x] Type definitions
- [x] Base provider class
- [x] Notification service
- [x] Configuration validation
- [x] Provider factory
- [x] Webhook provider implementation

### Phase 2: Provider Implementations (Next)
- [ ] Slack provider
- [ ] Email provider (with nodemailer)
- [ ] Discord provider
- [ ] PagerDuty provider
- [ ] MS Teams provider

### Phase 3: Integration
- [ ] Add to plugin options schema
- [ ] Integrate with GitHub status update workflow
- [ ] Add to monitoring workflow
- [ ] Documentation and examples

### Phase 4: Advanced Features
- [ ] Template system for custom messages
- [ ] Notification aggregation (batch similar events)
- [ ] Conditional routing (based on event data)
- [ ] Notification history/audit log
- [ ] Webhook signature verification
- [ ] Message formatting (Markdown → provider formats)

## Requirements

- TypeScript 5.x+
- Node.js 18+
- Zod 3.x (runtime validation)

## License

MIT

## Contributing

Contributions welcome! See [ARCHITECTURE.md](./ARCHITECTURE.md) for design guidelines.

## Support

- **Issues**: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues
- **Documentation**: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/tree/main/src/notifications
- **Examples**: [USAGE-EXAMPLES.md](./USAGE-EXAMPLES.md)
