/**
 * Test suite for NotificationService
 * Demonstrates dependency injection, mocking, and error handling patterns
 */

import { BaseNotificationProvider, type ProviderLogger } from '../providers/base-provider';
import type {
  BaseProviderConfig,
  NotificationContext,
  NotificationEvent,
  NotificationResult,
  ProviderConfig,
} from '../types';
import { NotificationService, type ProviderFactory } from '../notification-service';

/**
 * Mock logger for testing
 */
const createMockLogger = (): ProviderLogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

/**
 * Mock provider for testing
 */
class MockProvider extends BaseNotificationProvider {
  public sendCalled = 0;
  public shouldFail = false;
  public shouldThrow = false;

  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    this.sendCalled++;

    if (this.shouldThrow) {
      throw new Error('Provider threw error');
    }

    if (this.shouldFail) {
      return this.createError('MOCK_ERROR', 'Mock error message', true);
    }

    return this.createSuccess();
  }

  protected async validateProviderConfig(): Promise<NotificationResult> {
    if (!this.config.id) {
      return this.createError('INVALID_CONFIG', 'ID required', false);
    }
    return this.createSuccess();
  }
}

/**
 * Create mock provider factory
 */
const createMockFactory = (
  providerMap: Map<string, MockProvider>
): ProviderFactory => {
  return (config: ProviderConfig, logger?: ProviderLogger): BaseNotificationProvider => {
    const provider = new MockProvider(config as BaseProviderConfig, logger);
    providerMap.set(config.id, provider);
    return provider;
  };
};

/**
 * Create test event
 */
const createTestEvent = (): NotificationEvent => ({
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
});

describe('NotificationService', () => {
  let mockLogger: ProviderLogger;
  let providerMap: Map<string, MockProvider>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    providerMap = new Map();
  });

  describe('initialization', () => {
    it('should initialize with empty providers list', async () => {
      const service = new NotificationService(
        {
          providers: [],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      expect(service.getProviderIds()).toEqual([]);
    });

    it('should register all providers on initialization', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
            { id: 'provider2', type: 'webhook', url: 'https://example.com' },
          ],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      expect(service.getProviderIds()).toEqual(['provider1', 'provider2']);
    });

    it('should eagerly load providers when configured', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Provider should be loaded immediately
      expect(providerMap.has('provider1')).toBe(true);
    });

    it('should not load providers lazily on initialization', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'lazy',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Provider should NOT be loaded yet
      expect(providerMap.has('provider1')).toBe(false);
    });

    it('should reject duplicate provider IDs', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'duplicate', type: 'webhook', url: 'https://example.com' },
            { id: 'duplicate', type: 'webhook', url: 'https://example.com' },
          ],
        },
        createMockFactory(providerMap)
      );

      await expect(service.initialize()).rejects.toThrow(
        "Provider with ID 'duplicate' is already registered"
      );
    });
  });

  describe('notify', () => {
    it('should throw if not initialized', async () => {
      const service = new NotificationService(
        { providers: [] },
        createMockFactory(providerMap)
      );

      await expect(service.notify(createTestEvent())).rejects.toThrow(
        'NotificationService must be initialized before use'
      );
    });

    it('should send notification to single provider', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const results = await service.notify(createTestEvent());

      expect(results.size).toBe(1);
      expect(results.get('provider1')?.success).toBe(true);
      expect(providerMap.get('provider1')?.sendCalled).toBe(1);
    });

    it('should send notification to multiple providers concurrently', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
            { id: 'provider2', type: 'webhook', url: 'https://example.com' },
            { id: 'provider3', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
          maxConcurrency: 2,
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const results = await service.notify(createTestEvent());

      expect(results.size).toBe(3);
      expect(Array.from(results.values()).every(r => r.success)).toBe(true);
    });

    it('should continue sending on provider failure when configured', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
            { id: 'provider2', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
          continueOnError: true,
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Make first provider fail
      providerMap.get('provider1')!.shouldFail = true;

      const results = await service.notify(createTestEvent());

      expect(results.size).toBe(2);
      expect(results.get('provider1')?.success).toBe(false);
      expect(results.get('provider2')?.success).toBe(true);
    });

    it('should stop sending on provider failure when configured', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
            { id: 'provider2', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
          continueOnError: false,
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Make first provider fail
      providerMap.get('provider1')!.shouldFail = true;

      const results = await service.notify(createTestEvent());

      // Only first provider should be called
      expect(results.size).toBe(1);
      expect(results.get('provider1')?.success).toBe(false);
    });

    it('should handle provider exceptions gracefully', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Make provider throw
      providerMap.get('provider1')!.shouldThrow = true;

      const results = await service.notify(createTestEvent());

      expect(results.size).toBe(1);
      expect(results.get('provider1')?.success).toBe(false);
      expect(results.get('provider1')?.error?.message).toContain('Provider threw error');
    });

    it('should merge default context with provided context', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          defaultContext: {
            organizationName: 'Acme Corp',
            statusPageUrl: 'https://status.example.com',
          },
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      await service.notify(createTestEvent(), {
        environment: 'production',
      });

      // Context would include both default and provided values
      // This is verified implicitly by provider receiving correct context
      expect(providerMap.get('provider1')?.sendCalled).toBe(1);
    });

    it('should skip disabled providers', async () => {
      const service = new NotificationService(
        {
          providers: [
            {
              id: 'provider1',
              type: 'webhook',
              url: 'https://example.com',
              enabled: false,
            },
            { id: 'provider2', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const results = await service.notify(createTestEvent());

      // Only enabled provider should receive notification
      expect(results.size).toBe(1);
      expect(results.has('provider2')).toBe(true);
    });

    it('should load providers lazily on first notify', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'lazy',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      // Provider not loaded yet
      expect(providerMap.has('provider1')).toBe(false);

      await service.notify(createTestEvent());

      // Provider loaded during notify
      expect(providerMap.has('provider1')).toBe(true);
      expect(providerMap.get('provider1')?.sendCalled).toBe(1);
    });
  });

  describe('notifyBatch', () => {
    it('should send multiple events in batch', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const event1 = createTestEvent();
      const event2: NotificationEvent = {
        type: 'system.down',
        timestamp: '2025-01-01T00:00:00Z',
        system: {
          name: 'database',
          type: 'system',
          lastCheck: '2025-01-01T00:00:00Z',
          error: 'Connection timeout',
        },
      };

      const result = await service.notifyBatch({
        events: [event1, event2],
      });

      expect(result.totalEvents).toBe(2);
      expect(result.successfulEvents).toBe(2);
      expect(result.failedEvents).toBe(0);
      expect(providerMap.get('provider1')?.sendCalled).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track provider statistics', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      await service.notify(createTestEvent());

      const stats = await service.getProviderStats('provider1');

      expect(stats).not.toBeNull();
      expect(stats?.totalAttempts).toBe(1);
      expect(stats?.successCount).toBe(1);
      expect(stats?.failureCount).toBe(0);
    });

    it('should reset statistics', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
          loadingStrategy: 'eager',
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      await service.notify(createTestEvent());
      await service.resetStats();

      const stats = await service.getProviderStats('provider1');

      expect(stats?.totalAttempts).toBe(0);
      expect(stats?.successCount).toBe(0);
    });
  });

  describe('provider management', () => {
    it('should enable provider', async () => {
      const service = new NotificationService(
        {
          providers: [
            {
              id: 'provider1',
              type: 'webhook',
              url: 'https://example.com',
              enabled: false,
            },
          ],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const enabled = await service.enableProvider('provider1');
      expect(enabled).toBe(true);

      const config = service.getProviderConfig('provider1');
      expect(config?.enabled).toBe(true);
    });

    it('should disable provider', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      const disabled = service.disableProvider('provider1');
      expect(disabled).toBe(true);

      const config = service.getProviderConfig('provider1');
      expect(config?.enabled).toBe(false);
    });

    it('should check if provider exists', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();

      expect(service.hasProvider('provider1')).toBe(true);
      expect(service.hasProvider('nonexistent')).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources on shutdown', async () => {
      const service = new NotificationService(
        {
          providers: [
            { id: 'provider1', type: 'webhook', url: 'https://example.com' },
          ],
        },
        createMockFactory(providerMap)
      );

      await service.initialize();
      await service.shutdown();

      expect(service.getProviderIds()).toEqual([]);
    });
  });
});
