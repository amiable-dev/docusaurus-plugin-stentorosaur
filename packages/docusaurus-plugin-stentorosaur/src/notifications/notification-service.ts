/**
 * Main notification service orchestrator
 * Handles provider registration, event routing, and batch processing
 * @packageDocumentation
 */

import type {
  BaseNotificationProvider,
  ProviderLogger,
} from './providers/base-provider';
import type {
  BatchNotificationRequest,
  BatchNotificationResult,
  NotificationContext,
  NotificationEvent,
  NotificationResult,
  NotificationStats,
  ProviderConfig,
} from './types';

/**
 * Provider factory function type
 * Used for lazy loading and dependency injection
 */
export type ProviderFactory = (
  config: ProviderConfig,
  logger?: ProviderLogger
) => BaseNotificationProvider | Promise<BaseNotificationProvider>;

/**
 * Service configuration options
 */
export interface NotificationServiceConfig {
  /**
   * Provider configurations
   */
  providers: ProviderConfig[];

  /**
   * Default context values applied to all notifications
   */
  defaultContext?: Partial<Omit<NotificationContext, 'event'>>;

  /**
   * Whether to load providers eagerly or lazily
   * @default 'lazy'
   */
  loadingStrategy?: 'eager' | 'lazy';

  /**
   * Maximum concurrent notifications when sending to multiple providers
   * @default 5
   */
  maxConcurrency?: number;

  /**
   * Whether to continue sending to other providers if one fails
   * @default true
   */
  continueOnError?: boolean;

  /**
   * Logger instance
   */
  logger?: ProviderLogger;
}

/**
 * Provider registry entry
 */
interface ProviderEntry {
  config: ProviderConfig;
  provider: BaseNotificationProvider | null;
  factory: ProviderFactory;
  loadError?: Error;
}

/**
 * Main notification service class
 * Manages provider lifecycle and coordinates notification delivery
 */
export class NotificationService {
  private readonly config: Required<
    Omit<NotificationServiceConfig, 'defaultContext' | 'logger'>
  > & {
    defaultContext?: Partial<Omit<NotificationContext, 'event'>>;
    logger?: ProviderLogger;
  };
  private readonly providerRegistry: Map<string, ProviderEntry>;
  private initialized = false;

  constructor(
    config: NotificationServiceConfig,
    private readonly providerFactory: ProviderFactory
  ) {
    this.config = {
      providers: config.providers,
      defaultContext: config.defaultContext,
      loadingStrategy: config.loadingStrategy ?? 'lazy',
      maxConcurrency: config.maxConcurrency ?? 5,
      continueOnError: config.continueOnError ?? true,
      logger: config.logger,
    };

    this.providerRegistry = new Map();
  }

  /**
   * Initialize the notification service
   * Must be called before sending notifications
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.config.logger?.info('Initializing notification service...');

    // Register all providers
    for (const providerConfig of this.config.providers) {
      this.registerProvider(providerConfig);
    }

    // Eagerly load providers if configured
    if (this.config.loadingStrategy === 'eager') {
      await this.loadAllProviders();
    }

    this.initialized = true;
    this.config.logger?.info(
      `Notification service initialized with ${this.providerRegistry.size} provider(s)`
    );
  }

  /**
   * Register a provider configuration
   */
  private registerProvider(config: ProviderConfig): void {
    if (this.providerRegistry.has(config.id)) {
      throw new Error(`Provider with ID '${config.id}' is already registered`);
    }

    this.providerRegistry.set(config.id, {
      config,
      provider: null,
      factory: this.providerFactory,
    });

    this.config.logger?.debug(`Registered provider: ${config.id} (${config.type})`);
  }

  /**
   * Load all providers (for eager loading)
   */
  private async loadAllProviders(): Promise<void> {
    const loadPromises = Array.from(this.providerRegistry.keys()).map(id =>
      this.loadProvider(id)
    );

    await Promise.allSettled(loadPromises);
  }

  /**
   * Load a specific provider
   */
  private async loadProvider(providerId: string): Promise<BaseNotificationProvider | null> {
    const entry = this.providerRegistry.get(providerId);
    if (!entry) {
      throw new Error(`Provider '${providerId}' is not registered`);
    }

    // Return cached provider if already loaded
    if (entry.provider) {
      return entry.provider;
    }

    // Return null if previous load failed (don't retry)
    if (entry.loadError) {
      return null;
    }

    try {
      this.config.logger?.debug(`Loading provider: ${providerId}`);
      const provider = await entry.factory(entry.config, this.config.logger);

      // Validate provider configuration
      const validationResult = await provider.validate();
      if (!validationResult.success) {
        throw new Error(
          `Provider validation failed: ${validationResult.error.message}`
        );
      }

      entry.provider = provider;
      this.config.logger?.info(`Provider loaded successfully: ${providerId}`);
      return provider;
    } catch (error) {
      entry.loadError = error instanceof Error ? error : new Error(String(error));
      this.config.logger?.error(
        `Failed to load provider ${providerId}:`,
        entry.loadError
      );
      return null;
    }
  }

  /**
   * Get a loaded provider by ID
   */
  private async getProvider(providerId: string): Promise<BaseNotificationProvider | null> {
    const entry = this.providerRegistry.get(providerId);
    if (!entry) {
      return null;
    }

    return entry.provider ?? (await this.loadProvider(providerId));
  }

  /**
   * Send a notification event to all applicable providers
   */
  public async notify(
    event: NotificationEvent,
    context?: Partial<Omit<NotificationContext, 'event'>>
  ): Promise<Map<string, NotificationResult>> {
    if (!this.initialized) {
      throw new Error('NotificationService must be initialized before use');
    }

    const fullContext: NotificationContext = {
      event,
      ...this.config.defaultContext,
      ...context,
    };

    const results = new Map<string, NotificationResult>();

    // Get all enabled providers
    const providerIds = Array.from(this.providerRegistry.keys());
    const enabledProviders = await Promise.all(
      providerIds.map(async id => {
        const provider = await this.getProvider(id);
        return provider && provider.isEnabled() ? { id, provider } : null;
      })
    );

    const validProviders = enabledProviders.filter(
      (p): p is { id: string; provider: BaseNotificationProvider } => p !== null
    );

    if (validProviders.length === 0) {
      this.config.logger?.warn('No enabled providers available for notification');
      return results;
    }

    // Send notifications with concurrency control
    const chunks = this.chunk(validProviders, this.config.maxConcurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(async ({ id, provider }) => {
          try {
            const result = await provider.send(fullContext);
            return { id, result };
          } catch (error) {
            this.config.logger?.error(
              `Unexpected error in provider ${id}:`,
              error
            );
            return {
              id,
              result: {
                success: false,
                error: {
                  code: 'SEND_ERROR',
                  message: error instanceof Error ? error.message : 'Unknown error',
                  provider: id,
                  originalError: error,
                  retryable: false,
                  timestamp: new Date().toISOString(),
                },
              } as NotificationResult,
            };
          }
        })
      );

      // Collect results
      for (const chunkResult of chunkResults) {
        if (chunkResult.status === 'fulfilled') {
          const { id, result } = chunkResult.value;
          results.set(id, result);

          if (!result.success && !this.config.continueOnError) {
            this.config.logger?.error(
              `Provider ${id} failed, stopping due to continueOnError=false`
            );
            return results;
          }
        } else {
          this.config.logger?.error(
            'Provider promise rejected:',
            chunkResult.reason
          );
        }
      }
    }

    // Log summary
    const successCount = Array.from(results.values()).filter(r => r.success).length;
    const failureCount = results.size - successCount;
    this.config.logger?.info(
      `Notification sent: ${successCount} succeeded, ${failureCount} failed`
    );

    return results;
  }

  /**
   * Send multiple events in batch
   */
  public async notifyBatch(
    request: BatchNotificationRequest
  ): Promise<BatchNotificationResult> {
    if (!this.initialized) {
      throw new Error('NotificationService must be initialized before use');
    }

    const results: BatchNotificationResult['results'] = [];
    let successfulEvents = 0;
    let failedEvents = 0;

    for (const event of request.events) {
      const providerResults = await this.notify(event, request.context);

      const hasAnySuccess = Array.from(providerResults.values()).some(r => r.success);
      if (hasAnySuccess) {
        successfulEvents++;
      } else {
        failedEvents++;
      }

      results.push({
        event,
        providerResults,
      });
    }

    return {
      totalEvents: request.events.length,
      successfulEvents,
      failedEvents,
      results,
    };
  }

  /**
   * Get statistics for all providers
   */
  public async getStats(): Promise<Map<string, NotificationStats>> {
    const stats = new Map<string, NotificationStats>();

    for (const [id, entry] of this.providerRegistry) {
      const provider = entry.provider ?? (await this.getProvider(id));
      if (provider) {
        stats.set(id, provider.getStats());
      }
    }

    return stats;
  }

  /**
   * Get statistics for a specific provider
   */
  public async getProviderStats(providerId: string): Promise<NotificationStats | null> {
    const provider = await this.getProvider(providerId);
    return provider ? provider.getStats() : null;
  }

  /**
   * Reset statistics for all providers
   */
  public async resetStats(): Promise<void> {
    for (const entry of this.providerRegistry.values()) {
      if (entry.provider) {
        entry.provider.resetStats();
      }
    }
  }

  /**
   * Get list of registered provider IDs
   */
  public getProviderIds(): string[] {
    return Array.from(this.providerRegistry.keys());
  }

  /**
   * Check if a provider is registered
   */
  public hasProvider(providerId: string): boolean {
    return this.providerRegistry.has(providerId);
  }

  /**
   * Get provider configuration
   */
  public getProviderConfig(providerId: string): ProviderConfig | null {
    const entry = this.providerRegistry.get(providerId);
    return entry ? entry.config : null;
  }

  /**
   * Enable a provider
   */
  public async enableProvider(providerId: string): Promise<boolean> {
    const entry = this.providerRegistry.get(providerId);
    if (!entry) {
      return false;
    }

    entry.config.enabled = true;

    // Load provider if not already loaded
    if (!entry.provider && this.config.loadingStrategy === 'eager') {
      await this.loadProvider(providerId);
    }

    return true;
  }

  /**
   * Disable a provider
   */
  public disableProvider(providerId: string): boolean {
    const entry = this.providerRegistry.get(providerId);
    if (!entry) {
      return false;
    }

    entry.config.enabled = false;
    return true;
  }

  /**
   * Shutdown service and cleanup resources
   */
  public async shutdown(): Promise<void> {
    this.config.logger?.info('Shutting down notification service...');

    // Clear provider registry
    this.providerRegistry.clear();
    this.initialized = false;

    this.config.logger?.info('Notification service shutdown complete');
  }

  /**
   * Split array into chunks of specified size
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Create a notification service instance with validation
 */
export async function createNotificationService(
  config: NotificationServiceConfig,
  providerFactory: ProviderFactory
): Promise<NotificationService> {
  const service = new NotificationService(config, providerFactory);
  await service.initialize();
  return service;
}
