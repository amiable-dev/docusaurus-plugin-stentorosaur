# Notification System Architecture

## Overview

The Stentorosaur notification system provides a **type-safe**, **extensible**, and **testable** infrastructure for sending status notifications through multiple channels (Slack, email, webhooks, Discord, PagerDuty, MS Teams).

## Design Principles

### 1. Type Safety First
- **Discriminated unions** for event types - compiler enforces exhaustive handling
- **Generic provider configs** - provider-specific fields are type-checked
- **Result types** - no throwing exceptions, explicit error handling via `NotificationResult<T>`
- **Zod runtime validation** - configuration errors caught at startup, not runtime

### 2. Dependency Injection
- **Provider factory pattern** - providers are created via factory functions
- **Logger injection** - easy to mock in tests, no console.log pollution
- **Configuration separation** - config validation separated from business logic

### 3. Lazy Loading
- **Dynamic imports** - provider implementations loaded only when needed
- **Memory efficient** - only active providers consume memory
- **Fast startup** - service initializes without loading all provider code

### 4. Error Handling
- **Non-throwing APIs** - all operations return `NotificationResult<T>`
- **Structured errors** - `NotificationError` with code, message, retryability
- **Error propagation** - failures don't crash the system, logged and collected

### 5. Testability
- **Pure functions** where possible
- **Mockable dependencies** - logger, HTTP clients, etc.
- **No singleton state** - multiple service instances can coexist (useful for tests)
- **Validation separate from runtime** - Zod schemas can be tested independently

## Core Components

### 1. Type System (`types.ts`)

```typescript
// Discriminated union - compiler knows which fields exist
type NotificationEvent =
  | { type: 'incident.opened'; incident: { ... } }
  | { type: 'system.down'; system: { ... } }
  | ...

// Type-safe event extraction
type EventDataForType<T extends NotificationEventType> = Extract<
  NotificationEvent,
  { type: T }
>;

// Result type - no exceptions thrown
type NotificationResult<T> =
  | { success: true; data: T }
  | { success: false; error: NotificationError };

// Provider configs with discriminated union on 'type' field
type ProviderConfig =
  | SlackProviderConfig
  | EmailProviderConfig
  | ...;
```

**Key Design Decisions:**

- **Discriminated unions** enable exhaustive pattern matching in TypeScript
- **Result types** force callers to handle errors explicitly
- **Generic provider configs** allow type-safe access to provider-specific fields

### 2. Base Provider (`providers/base-provider.ts`)

```typescript
abstract class BaseNotificationProvider<TConfig extends BaseProviderConfig> {
  // Template method pattern
  public async send(context: NotificationContext): Promise<NotificationResult> {
    // 1. Rate limiting
    // 2. Event filtering
    // 3. Retry logic with exponential backoff
    // 4. Statistics tracking
    return await this.sendNotification(context); // Abstract method
  }

  // Subclasses implement this
  protected abstract sendNotification(context: NotificationContext): Promise<NotificationResult>;

  // Filtering logic (reusable across all providers)
  public shouldHandle(event: NotificationEvent, context: NotificationContext): boolean {
    // Check eventFilter, entityFilter, minSeverity
  }
}
```

**Key Design Decisions:**

- **Template method pattern** - common logic in base class, specific logic in subclasses
- **Retry logic** - exponential backoff with configurable limits
- **Rate limiting** - token bucket algorithm prevents overwhelming services
- **Statistics tracking** - success/failure counts, average latency, last attempt times

### 3. Configuration Validation (`config-validator.ts`)

```typescript
// Zod schemas provide runtime validation + TypeScript inference
const slackProviderSchema = baseProviderSchema.extend({
  type: z.literal('slack'),
  webhookUrl: envString.url('Invalid Slack webhook URL'),
  // ... more fields
});

// Environment variable resolution
const envString = z.string().transform(resolveEnvVariable);
// "env:SLACK_WEBHOOK" → process.env.SLACK_WEBHOOK

// Type guards for narrowing
function isSlackProvider(config: ProviderConfig): config is SlackProviderConfig {
  return config.type === 'slack';
}
```

**Key Design Decisions:**

- **Zod for validation** - runtime safety + automatic TypeScript type inference
- **Environment variable resolution** - support `env:VAR_NAME` syntax for secrets
- **Discriminated unions** - `z.discriminatedUnion('type', [...])` for fast parsing
- **Type guards** - enable type narrowing without type assertions

### 4. Notification Service (`notification-service.ts`)

```typescript
class NotificationService {
  private providerRegistry: Map<string, ProviderEntry>;

  public async notify(
    event: NotificationEvent,
    context?: Partial<Omit<NotificationContext, 'event'>>
  ): Promise<Map<string, NotificationResult>> {
    // 1. Load providers (lazy or eager)
    // 2. Filter enabled providers
    // 3. Send with concurrency control
    // 4. Collect results from all providers
  }
}
```

**Key Design Decisions:**

- **Provider registry** - Map<providerId, ProviderEntry> for O(1) lookups
- **Lazy vs eager loading** - configurable strategy (lazy = less memory, eager = faster sends)
- **Concurrency control** - batch sends to avoid overwhelming network
- **Continue on error** - one provider failure doesn't stop others

### 5. Provider Factory (`provider-factory.ts`)

```typescript
// Global registry with lazy loading
class ProviderRegistry {
  private registry = new Map<string, ProviderRegistryEntry>();

  public register(type: string, loader: ProviderLoader): void {
    this.registry.set(type, { loader });
  }

  public async getConstructor(type: string): Promise<ProviderConstructor | null> {
    // Load on first use, cache for subsequent uses
  }
}

// Built-in providers registered with dynamic imports
registerBuiltInProviders(): void {
  registry.register('slack', () =>
    import('./providers/slack-provider').then(m => ({ default: m.SlackProvider }))
  );
  // ... more providers
}
```

**Key Design Decisions:**

- **Dynamic imports** - code splitting, providers loaded on-demand
- **Plugin system** - `registerCustomProvider()` allows user extensions
- **Constructor caching** - load once, reuse many times
- **Type safety** - factory returns correctly typed provider instances

## Data Flow

### Notification Send Flow

```
User Code
  ↓
NotificationService.notify(event, context)
  ↓
[Provider Selection]
  ├─ Load providers (lazy loading if needed)
  ├─ Filter by enabled status
  ├─ Filter by event/entity/severity
  └─ Group into chunks (concurrency control)
  ↓
[Concurrent Sends] (chunked by maxConcurrency)
  ├─ Provider 1: BaseProvider.send()
  │    ├─ Rate limit check
  │    ├─ Event filter check
  │    ├─ Retry loop (exponential backoff)
  │    │    └─ sendNotification() [provider-specific]
  │    └─ Statistics update
  │
  ├─ Provider 2: ...
  └─ Provider N: ...
  ↓
[Result Collection]
  └─ Map<providerId, NotificationResult>
```

### Provider Loading Flow

```
NotificationService.initialize()
  ↓
[Eager Loading Strategy?]
  ├─ YES: Load all providers immediately
  │        ├─ ProviderFactory.createProvider(config)
  │        │    ├─ Registry.getConstructor(type)
  │        │    │    └─ Lazy loader (dynamic import)
  │        │    └─ new ProviderConstructor(config, logger)
  │        └─ Provider.validate()
  │
  └─ NO: Register configs, load on first use
       └─ Providers loaded during first notify() call
```

## Extensibility

### Adding a Custom Provider

```typescript
// 1. Define configuration type
interface MyProviderConfig extends BaseProviderConfig {
  type: 'myprovider';
  apiKey: string;
  endpoint: string;
}

// 2. Create provider class
class MyProvider extends BaseNotificationProvider<MyProviderConfig> {
  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(this.formatMessage(context)),
      });

      if (!response.ok) {
        return this.createError('API_ERROR', response.statusText, true);
      }

      return this.createSuccess();
    } catch (error) {
      return this.createError('NETWORK_ERROR', String(error), true);
    }
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    if (!this.config.apiKey) {
      return this.createError('INVALID_CONFIG', 'API key required', false);
    }
    return this.createSuccess();
  }
}

// 3. Register provider
registerCustomProvider('myprovider', MyProvider);

// 4. Use in configuration
const service = new NotificationService({
  providers: [
    {
      id: 'my-alerts',
      type: 'myprovider',
      apiKey: 'env:MY_API_KEY',
      endpoint: 'https://api.example.com/alerts',
    },
  ],
}, createProvider);
```

### Validation Schema Extension

```typescript
// Add Zod schema for custom provider
const myProviderSchema = baseProviderSchema.extend({
  type: z.literal('myprovider'),
  apiKey: envString.min(1, 'API key is required'),
  endpoint: z.string().url('Invalid endpoint URL'),
});

// Update discriminated union
const providerConfigSchema = z.discriminatedUnion('type', [
  slackProviderSchema,
  emailProviderSchema,
  myProviderSchema, // Add here
  // ...
]);
```

## Testing Strategy

### 1. Unit Tests - Provider Logic

```typescript
describe('SlackProvider', () => {
  it('should format incident notification correctly', async () => {
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const provider = new SlackProvider({
      id: 'test',
      type: 'slack',
      webhookUrl: 'https://hooks.slack.com/test',
    }, mockLogger);

    const context: NotificationContext = {
      event: {
        type: 'incident.opened',
        timestamp: '2025-01-01T00:00:00Z',
        incident: {
          id: 123,
          title: 'API Down',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'API not responding',
        },
      },
    };

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await provider.send(context);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should retry on network errors', async () => {
    const provider = new SlackProvider({
      id: 'test',
      type: 'slack',
      webhookUrl: 'https://hooks.slack.com/test',
      retry: { maxAttempts: 3, initialDelay: 100 },
    });

    let attemptCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Network error');
      }
      return Promise.resolve({ ok: true });
    });

    const result = await provider.send(mockContext);

    expect(attemptCount).toBe(3);
    expect(result.success).toBe(true);
  });
});
```

### 2. Integration Tests - Service Orchestration

```typescript
describe('NotificationService', () => {
  it('should send to multiple providers concurrently', async () => {
    const mockFactory = jest.fn().mockImplementation((config) => {
      return new MockProvider(config);
    });

    const service = new NotificationService({
      providers: [
        { id: 'slack', type: 'slack', webhookUrl: 'https://slack.com/webhook' },
        { id: 'email', type: 'email', /* ... */ },
      ],
      maxConcurrency: 2,
    }, mockFactory);

    await service.initialize();

    const results = await service.notify({
      type: 'incident.opened',
      timestamp: '2025-01-01T00:00:00Z',
      incident: { /* ... */ },
    });

    expect(results.size).toBe(2);
    expect(results.get('slack')?.success).toBe(true);
    expect(results.get('email')?.success).toBe(true);
  });
});
```

### 3. Validation Tests - Configuration

```typescript
describe('config-validator', () => {
  it('should resolve environment variables', () => {
    process.env.SLACK_WEBHOOK = 'https://hooks.slack.com/actual';

    const result = validateProviderConfig({
      id: 'test',
      type: 'slack',
      webhookUrl: 'env:SLACK_WEBHOOK',
    });

    expect(result.success).toBe(true);
    expect(result.data.webhookUrl).toBe('https://hooks.slack.com/actual');
  });

  it('should reject invalid configuration', () => {
    const result = validateProviderConfig({
      id: 'test',
      type: 'slack',
      webhookUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
    expect(result.error.errors[0].message).toContain('Invalid');
  });
});
```

## Performance Considerations

### Memory Efficiency

- **Lazy loading**: Providers loaded only when needed (saves ~50-100KB per unused provider)
- **Weak references**: Could use WeakMap for provider cache if memory is critical
- **Streaming**: Large batches could stream results instead of collecting all in memory

### Latency Optimization

- **Concurrent sends**: `maxConcurrency` controls parallelism (default: 5)
- **Connection pooling**: HTTP agents with keepAlive for webhooks
- **DNS caching**: Avoid repeated DNS lookups for same endpoints
- **Early filtering**: Check `shouldHandle()` before loading provider

### Rate Limiting

- **Token bucket algorithm**: Prevents overwhelming external APIs
- **Per-provider limits**: Each provider has independent rate limit
- **Backpressure**: Service-level rate limiting could be added for global limits

## Error Handling Patterns

### Non-Retryable Errors

```typescript
// Configuration errors
return this.createError('INVALID_CONFIG', 'Missing API key', false);

// Authentication errors
return this.createError('AUTH_FAILED', 'Invalid credentials', false);

// Validation errors
return this.createError('INVALID_EVENT', 'Unknown event type', false);
```

### Retryable Errors

```typescript
// Network errors
return this.createError('NETWORK_ERROR', 'Connection timeout', true);

// Rate limit errors
return this.createError('RATE_LIMITED', 'Too many requests', true);

// Temporary service errors
return this.createError('SERVICE_UNAVAILABLE', '503 error', true);
```

### Error Propagation

```typescript
// Service continues on provider errors (by default)
const results = await service.notify(event);

// Check results for each provider
for (const [providerId, result] of results) {
  if (!result.success) {
    logger.error(`Provider ${providerId} failed:`, result.error);
    // Send to error tracking service
    // Trigger alert for failed notifications
  }
}
```

## Security Considerations

### Secret Management

```typescript
// Configuration supports env: prefix
{
  type: 'slack',
  webhookUrl: 'env:SLACK_WEBHOOK',  // Read from process.env
}

// Never log sensitive config
logger.debug(`Provider config: ${JSON.stringify({
  ...config,
  webhookUrl: '[REDACTED]',
})}`);
```

### Input Validation

```typescript
// Zod schemas prevent injection attacks
const webhookUrl = z.string().url(); // Must be valid URL

// Message sanitization in formatMessage()
protected formatMessage(context: NotificationContext): string {
  const sanitized = context.event.incident.title
    .replace(/[<>]/g, '') // Remove HTML
    .slice(0, 500); // Limit length
  return sanitized;
}
```

### HTTPS Enforcement

```typescript
// Validate webhook URLs require HTTPS
const webhookUrl = envString
  .url('Invalid URL')
  .refine(url => url.startsWith('https://'), {
    message: 'Webhook URL must use HTTPS',
  });
```

## Configuration Examples

### Basic Setup

```typescript
const service = await createNotificationService({
  providers: [
    {
      id: 'alerts',
      type: 'slack',
      webhookUrl: 'env:SLACK_WEBHOOK',
      eventFilter: ['incident.opened', 'incident.closed'],
      minSeverity: 'major',
    },
  ],
  defaultContext: {
    statusPageUrl: 'https://status.example.com',
    organizationName: 'Acme Corp',
  },
}, createProvider);
```

### Advanced Setup

```typescript
const service = await createNotificationService({
  providers: [
    // Slack for all incidents
    {
      id: 'slack-incidents',
      type: 'slack',
      webhookUrl: 'env:SLACK_WEBHOOK',
      eventFilter: ['incident.opened', 'incident.updated', 'incident.closed'],
      mentionUsers: {
        critical: ['U12345', 'U67890'], // @mention on critical
        major: ['U12345'],
      },
      retry: { maxAttempts: 5 },
      rateLimit: { maxNotifications: 10, periodMs: 60000 },
    },

    // PagerDuty for critical only
    {
      id: 'pagerduty-critical',
      type: 'pagerduty',
      integrationKey: 'env:PAGERDUTY_KEY',
      eventFilter: ['incident.opened'],
      minSeverity: 'critical',
    },

    // Email for maintenance
    {
      id: 'email-maintenance',
      type: 'email',
      eventFilter: ['maintenance.scheduled', 'maintenance.started'],
      smtp: { /* ... */ },
      from: 'status@example.com',
      to: ['team@example.com'],
    },
  ],
  loadingStrategy: 'lazy', // Providers loaded on first use
  maxConcurrency: 5, // Send to 5 providers at a time
  continueOnError: true, // Don't stop on provider failure
}, createProvider);
```

## Migration Path

### Phase 1: Core Infrastructure (Current)
- Type definitions
- Base provider class
- Notification service
- Configuration validation
- Provider factory

### Phase 2: Provider Implementations
- Slack provider
- Webhook provider
- Email provider (with nodemailer)
- Discord provider
- PagerDuty provider
- MS Teams provider

### Phase 3: Integration
- Add to plugin options schema
- Integrate with GitHub status update workflow
- Add to monitoring workflow
- Documentation and examples

### Phase 4: Advanced Features
- Template system for custom messages
- Notification aggregation (batch similar events)
- Conditional routing (based on event data)
- Notification history/audit log
- Webhook signature verification
- Message formatting (Markdown → Slack/Discord/HTML)
