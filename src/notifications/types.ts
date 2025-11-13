/**
 * Core type definitions for the notification system
 * @packageDocumentation
 */

/**
 * Discriminated union for notification event types
 * Each event type has specific metadata and affected entities
 */
export type NotificationEvent =
  | {
      type: 'incident.opened';
      timestamp: string;
      incident: {
        id: number;
        title: string;
        severity: 'critical' | 'major' | 'minor';
        affectedEntities: string[];
        url: string;
        body: string;
      };
    }
  | {
      type: 'incident.closed';
      timestamp: string;
      incident: {
        id: number;
        title: string;
        duration: number; // milliseconds
        affectedEntities: string[];
        url: string;
      };
    }
  | {
      type: 'incident.updated';
      timestamp: string;
      incident: {
        id: number;
        title: string;
        severity: 'critical' | 'major' | 'minor';
        affectedEntities: string[];
        url: string;
        changes: {
          severity?: { from: string; to: string };
          entities?: { added: string[]; removed: string[] };
        };
      };
    }
  | {
      type: 'maintenance.scheduled';
      timestamp: string;
      maintenance: {
        id: number;
        title: string;
        start: string;
        end: string;
        affectedEntities: string[];
        url: string;
      };
    }
  | {
      type: 'maintenance.started';
      timestamp: string;
      maintenance: {
        id: number;
        title: string;
        end: string;
        affectedEntities: string[];
        url: string;
      };
    }
  | {
      type: 'maintenance.completed';
      timestamp: string;
      maintenance: {
        id: number;
        title: string;
        duration: number; // milliseconds
        affectedEntities: string[];
        url: string;
      };
    }
  | {
      type: 'system.down';
      timestamp: string;
      system: {
        name: string;
        type: 'system' | 'process';
        lastCheck: string;
        responseTime?: number;
        statusCode?: number;
        error?: string;
      };
    }
  | {
      type: 'system.degraded';
      timestamp: string;
      system: {
        name: string;
        type: 'system' | 'process';
        lastCheck: string;
        responseTime?: number;
        statusCode?: number;
        reason: string;
      };
    }
  | {
      type: 'system.recovered';
      timestamp: string;
      system: {
        name: string;
        type: 'system' | 'process';
        downtime: number; // milliseconds
        lastCheck: string;
      };
    }
  | {
      type: 'slo.breached';
      timestamp: string;
      slo: {
        entity: string;
        metric: 'uptime' | 'responseTime';
        target: number;
        actual: number;
        period: string;
      };
    };

/**
 * Extract event type from discriminated union
 */
export type NotificationEventType = NotificationEvent['type'];

/**
 * Extract event data for a specific type
 */
export type EventDataForType<T extends NotificationEventType> = Extract<
  NotificationEvent,
  { type: T }
>;

/**
 * Result type for notification operations
 * Uses discriminated union for type-safe error handling
 */
export type NotificationResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: NotificationError;
    };

/**
 * Structured error information
 */
export interface NotificationError {
  code: string;
  message: string;
  provider: string;
  originalError?: unknown;
  retryable: boolean;
  timestamp: string;
}

/**
 * Base configuration shared by all providers
 */
export interface BaseProviderConfig {
  /**
   * Unique identifier for this provider instance
   */
  id: string;

  /**
   * Provider type (e.g., 'slack', 'email', 'webhook')
   */
  type: string;

  /**
   * Human-readable name for logging
   */
  name?: string;

  /**
   * Whether this provider is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Event types this provider should handle
   * Empty array means handle all events
   * @default []
   */
  eventFilter?: NotificationEventType[];

  /**
   * Entity filter - only notify for these entities
   * Empty array means notify for all entities
   * @default []
   */
  entityFilter?: string[];

  /**
   * Minimum severity for incident notifications
   * @default 'minor'
   */
  minSeverity?: 'critical' | 'major' | 'minor';

  /**
   * Retry configuration
   */
  retry?: {
    /**
     * Maximum number of retry attempts
     * @default 3
     */
    maxAttempts?: number;

    /**
     * Initial delay in milliseconds
     * @default 1000
     */
    initialDelay?: number;

    /**
     * Backoff multiplier for exponential backoff
     * @default 2
     */
    backoffMultiplier?: number;

    /**
     * Maximum delay between retries in milliseconds
     * @default 30000
     */
    maxDelay?: number;
  };

  /**
   * Rate limiting configuration
   */
  rateLimit?: {
    /**
     * Maximum notifications per period
     */
    maxNotifications: number;

    /**
     * Period in milliseconds
     */
    periodMs: number;
  };
}

/**
 * Provider-specific configuration types
 * Uses generics to maintain type safety for provider-specific fields
 */
export interface SlackProviderConfig extends BaseProviderConfig {
  type: 'slack';
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
  mentionUsers?: {
    critical?: string[]; // User IDs for @mentions
    major?: string[];
  };
}

export interface EmailProviderConfig extends BaseProviderConfig {
  type: 'email';
  smtp: {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subjectPrefix?: string;
}

export interface WebhookProviderConfig extends BaseProviderConfig {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  authentication?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    headerName?: string; // For API key
  };
  timeout?: number;
}

export interface DiscordProviderConfig extends BaseProviderConfig {
  type: 'discord';
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  mentionRoles?: {
    critical?: string[]; // Role IDs
    major?: string[];
  };
}

export interface PagerDutyProviderConfig extends BaseProviderConfig {
  type: 'pagerduty';
  integrationKey: string;
  apiKey?: string;
  routingKey?: string;
  severity?: {
    critical?: 'critical' | 'error';
    major?: 'warning' | 'error';
    minor?: 'warning' | 'info';
  };
}

export interface MSTeamsProviderConfig extends BaseProviderConfig {
  type: 'msteams';
  webhookUrl: string;
  themeColor?: {
    critical?: string;
    major?: string;
    minor?: string;
    maintenance?: string;
  };
}

/**
 * Union type of all provider configurations
 * This enables type-safe provider instantiation
 */
export type ProviderConfig =
  | SlackProviderConfig
  | EmailProviderConfig
  | WebhookProviderConfig
  | DiscordProviderConfig
  | PagerDutyProviderConfig
  | MSTeamsProviderConfig;

/**
 * Extract config type for a specific provider type
 */
export type ConfigForProviderType<T extends ProviderConfig['type']> = Extract<
  ProviderConfig,
  { type: T }
>;

/**
 * Notification context passed to providers
 * Contains event data plus additional metadata
 */
export interface NotificationContext {
  event: NotificationEvent;
  statusPageUrl?: string;
  organizationName?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Statistics for monitoring notification delivery
 */
export interface NotificationStats {
  providerId: string;
  providerType: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  lastSuccess?: string;
  lastFailure?: string;
  averageLatency?: number; // milliseconds
  rateLimitHits: number;
}

/**
 * Batch notification request
 */
export interface BatchNotificationRequest {
  events: NotificationEvent[];
  context?: Omit<NotificationContext, 'event'>;
}

/**
 * Batch notification result
 */
export interface BatchNotificationResult {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  results: Array<{
    event: NotificationEvent;
    providerResults: Map<string, NotificationResult>;
  }>;
}
