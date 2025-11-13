/**
 * Abstract base class for notification providers
 * Implements common functionality: retry logic, error handling, filtering
 * @packageDocumentation
 */

import type {
  BaseProviderConfig,
  NotificationContext,
  NotificationError,
  NotificationEvent,
  NotificationEventType,
  NotificationResult,
  NotificationStats,
} from '../types';

/**
 * Logger interface for dependency injection
 * Allows providers to be tested without console output
 */
export interface ProviderLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Default console-based logger
 */
export const defaultLogger: ProviderLogger = {
  debug: (msg, ...args) => console.debug(`[NotificationProvider] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[NotificationProvider] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[NotificationProvider] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[NotificationProvider] ${msg}`, ...args),
};

/**
 * Rate limiter state
 */
interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

/**
 * Abstract base provider class
 * All notification providers must extend this class
 */
export abstract class BaseNotificationProvider<
  TConfig extends BaseProviderConfig = BaseProviderConfig
> {
  protected readonly config: TConfig;
  protected readonly logger: ProviderLogger;
  private stats: NotificationStats;
  private rateLimitState?: RateLimitState;

  constructor(config: TConfig, logger: ProviderLogger = defaultLogger) {
    this.config = config;
    this.logger = logger;
    this.stats = {
      providerId: config.id,
      providerType: config.type,
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitHits: 0,
    };

    // Initialize rate limiter if configured
    if (config.rateLimit) {
      this.rateLimitState = {
        tokens: config.rateLimit.maxNotifications,
        lastRefill: Date.now(),
      };
    }
  }

  /**
   * Get provider statistics
   */
  public getStats(): Readonly<NotificationStats> {
    return { ...this.stats };
  }

  /**
   * Reset provider statistics
   */
  public resetStats(): void {
    this.stats = {
      providerId: this.config.id,
      providerType: this.config.type,
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitHits: 0,
    };
  }

  /**
   * Check if provider is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled !== false;
  }

  /**
   * Check if provider should handle this event
   * Implements filtering logic based on configuration
   */
  public shouldHandle(event: NotificationEvent, context: NotificationContext): boolean {
    // Check if provider is enabled
    if (!this.isEnabled()) {
      return false;
    }

    // Check event type filter
    const eventFilter = this.config.eventFilter ?? [];
    if (eventFilter.length > 0 && !eventFilter.includes(event.type)) {
      return false;
    }

    // Check entity filter
    const entityFilter = this.config.entityFilter ?? [];
    if (entityFilter.length > 0) {
      const affectedEntities = this.extractAffectedEntities(event);
      const hasMatchingEntity = affectedEntities.some(entity =>
        entityFilter.includes(entity)
      );
      if (!hasMatchingEntity) {
        return false;
      }
    }

    // Check severity filter for incident events
    if (
      (event.type === 'incident.opened' || event.type === 'incident.updated') &&
      this.config.minSeverity
    ) {
      const severityLevel = { critical: 3, major: 2, minor: 1 };
      const eventSeverity = severityLevel[event.incident.severity];
      const minSeverity = severityLevel[this.config.minSeverity];
      if (eventSeverity < minSeverity) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send notification with retry logic and error handling
   * This is the main entry point for sending notifications
   */
  public async send(context: NotificationContext): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      // Check rate limit
      if (!this.checkRateLimit()) {
        this.stats.rateLimitHits++;
        return this.createError(
          'RATE_LIMIT_EXCEEDED',
          'Rate limit exceeded for provider',
          false
        );
      }

      // Check if provider should handle this event
      if (!this.shouldHandle(context.event, context)) {
        this.logger.debug(
          `Provider ${this.config.id} skipping event ${context.event.type} due to filters`
        );
        return { success: true, data: undefined };
      }

      // Execute with retry logic
      const result = await this.executeWithRetry(context);

      // Update statistics
      const latency = Date.now() - startTime;
      this.updateStats(result.success, latency);

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateStats(false, latency);

      this.logger.error(
        `Unhandled error in provider ${this.config.id}:`,
        error
      );

      return this.createError(
        'UNHANDLED_ERROR',
        'Unexpected error occurred',
        false,
        error
      );
    }
  }

  /**
   * Validate provider configuration
   * Subclasses can override to add provider-specific validation
   */
  public async validate(): Promise<NotificationResult> {
    try {
      // Basic validation
      if (!this.config.id || this.config.id.trim() === '') {
        return this.createError(
          'INVALID_CONFIG',
          'Provider ID is required',
          false
        );
      }

      if (!this.config.type || this.config.type.trim() === '') {
        return this.createError(
          'INVALID_CONFIG',
          'Provider type is required',
          false
        );
      }

      // Delegate to provider-specific validation
      return await this.validateProviderConfig();
    } catch (error) {
      return this.createError(
        'VALIDATION_ERROR',
        'Configuration validation failed',
        false,
        error
      );
    }
  }

  /**
   * Abstract method: Send notification (implemented by subclasses)
   * This method should contain the provider-specific logic
   */
  protected abstract sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult>;

  /**
   * Abstract method: Provider-specific configuration validation
   * Subclasses should override to validate their specific config fields
   */
  protected abstract validateProviderConfig(): Promise<NotificationResult>;

  /**
   * Format notification message
   * Subclasses can override to customize message formatting
   */
  protected formatMessage(context: NotificationContext): string {
    const event = context.event;

    switch (event.type) {
      case 'incident.opened':
        return `[${event.incident.severity.toUpperCase()}] Incident: ${event.incident.title}\nAffected: ${event.incident.affectedEntities.join(', ')}\n${event.incident.url}`;

      case 'incident.closed':
        return `Incident Resolved: ${event.incident.title}\nDuration: ${this.formatDuration(event.incident.duration)}\n${event.incident.url}`;

      case 'incident.updated':
        return `Incident Updated: ${event.incident.title}\nAffected: ${event.incident.affectedEntities.join(', ')}\n${event.incident.url}`;

      case 'maintenance.scheduled':
        return `Scheduled Maintenance: ${event.maintenance.title}\nStart: ${new Date(event.maintenance.start).toLocaleString()}\nEnd: ${new Date(event.maintenance.end).toLocaleString()}\nAffected: ${event.maintenance.affectedEntities.join(', ')}`;

      case 'maintenance.started':
        return `Maintenance Started: ${event.maintenance.title}\nExpected End: ${new Date(event.maintenance.end).toLocaleString()}\nAffected: ${event.maintenance.affectedEntities.join(', ')}`;

      case 'maintenance.completed':
        return `Maintenance Completed: ${event.maintenance.title}\nDuration: ${this.formatDuration(event.maintenance.duration)}`;

      case 'system.down':
        return `System Down: ${event.system.name} (${event.system.type})\n${event.system.error ?? 'No response'}`;

      case 'system.degraded':
        return `System Degraded: ${event.system.name} (${event.system.type})\nReason: ${event.system.reason}`;

      case 'system.recovered':
        return `System Recovered: ${event.system.name}\nDowntime: ${this.formatDuration(event.system.downtime)}`;

      case 'slo.breached':
        return `SLO Breached: ${event.slo.entity}\nMetric: ${event.slo.metric}\nTarget: ${event.slo.target}%\nActual: ${event.slo.actual}%`;

      default:
        return `Event: ${(event as NotificationEvent).type}`;
    }
  }

  /**
   * Execute notification with exponential backoff retry
   */
  private async executeWithRetry(
    context: NotificationContext
  ): Promise<NotificationResult> {
    const maxAttempts = this.config.retry?.maxAttempts ?? 3;
    const initialDelay = this.config.retry?.initialDelay ?? 1000;
    const backoffMultiplier = this.config.retry?.backoffMultiplier ?? 2;
    const maxDelay = this.config.retry?.maxDelay ?? 30000;

    let lastError: NotificationError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.debug(
        `Provider ${this.config.id} attempt ${attempt}/${maxAttempts} for event ${context.event.type}`
      );

      const result = await this.sendNotification(context);

      if (result.success) {
        this.logger.info(
          `Provider ${this.config.id} successfully sent notification for ${context.event.type}`
        );
        return result;
      }

      lastError = result.error;

      // Don't retry if error is not retryable
      if (!result.error.retryable) {
        this.logger.warn(
          `Provider ${this.config.id} encountered non-retryable error: ${result.error.message}`
        );
        return result;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      );

      this.logger.debug(
        `Provider ${this.config.id} retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`
      );

      await this.sleep(delay);
    }

    // All retries exhausted
    return this.createError(
      'MAX_RETRIES_EXCEEDED',
      `Failed after ${maxAttempts} attempts: ${lastError?.message ?? 'Unknown error'}`,
      false,
      lastError
    );
  }

  /**
   * Check and update rate limit
   * Returns true if request should proceed, false if rate limited
   */
  private checkRateLimit(): boolean {
    if (!this.config.rateLimit || !this.rateLimitState) {
      return true;
    }

    const now = Date.now();
    const { maxNotifications, periodMs } = this.config.rateLimit;

    // Refill tokens if period has elapsed
    if (now - this.rateLimitState.lastRefill >= periodMs) {
      this.rateLimitState.tokens = maxNotifications;
      this.rateLimitState.lastRefill = now;
    }

    // Check if tokens available
    if (this.rateLimitState.tokens > 0) {
      this.rateLimitState.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Update statistics after notification attempt
   */
  private updateStats(success: boolean, latency: number): void {
    this.stats.totalAttempts++;

    if (success) {
      this.stats.successCount++;
      this.stats.lastSuccess = new Date().toISOString();
    } else {
      this.stats.failureCount++;
      this.stats.lastFailure = new Date().toISOString();
    }

    // Calculate rolling average latency
    const totalSuccess = this.stats.successCount;
    if (totalSuccess > 0) {
      const prevAvg = this.stats.averageLatency ?? latency;
      this.stats.averageLatency =
        (prevAvg * (totalSuccess - 1) + latency) / totalSuccess;
    }
  }

  /**
   * Extract affected entities from event
   */
  private extractAffectedEntities(event: NotificationEvent): string[] {
    switch (event.type) {
      case 'incident.opened':
      case 'incident.closed':
      case 'incident.updated':
        return event.incident.affectedEntities;

      case 'maintenance.scheduled':
      case 'maintenance.started':
      case 'maintenance.completed':
        return event.maintenance.affectedEntities;

      case 'system.down':
      case 'system.degraded':
      case 'system.recovered':
        return [event.system.name];

      case 'slo.breached':
        return [event.slo.entity];

      default:
        return [];
    }
  }

  /**
   * Create error result
   */
  protected createError(
    code: string,
    message: string,
    retryable: boolean,
    originalError?: unknown
  ): NotificationResult<never> {
    const error: NotificationError = {
      code,
      message,
      provider: this.config.id,
      originalError,
      retryable,
      timestamp: new Date().toISOString(),
    };

    return { success: false, error };
  }

  /**
   * Create success result
   */
  protected createSuccess<T = void>(data: T): NotificationResult<T> {
    return { success: true, data };
  }

  /**
   * Format duration in human-readable format
   */
  protected formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
