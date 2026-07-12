/**
 * Webhook notification provider
 * Sends notifications to generic webhook endpoints with flexible authentication
 * @packageDocumentation
 */

import type {
  NotificationContext,
  NotificationResult,
  WebhookProviderConfig,
} from '../types';
import { BaseNotificationProvider, type ProviderLogger } from './base-provider';

/**
 * Webhook payload structure
 */
interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
  organization?: string;
  statusPageUrl?: string;
}

/**
 * Webhook provider implementation
 * Supports multiple authentication methods and flexible message formatting
 */
export class WebhookProvider extends BaseNotificationProvider<WebhookProviderConfig> {
  constructor(config: WebhookProviderConfig, logger?: ProviderLogger) {
    super(config, logger);
  }

  /**
   * Send notification via webhook
   */
  protected async sendNotification(
    context: NotificationContext
  ): Promise<NotificationResult> {
    try {
      const payload = this.buildPayload(context);
      const headers = this.buildHeaders();

      this.logger.debug(
        `Sending webhook to ${this.config.url} with method ${this.config.method ?? 'POST'}`
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout ?? 10000
      );

      try {
        const response = await fetch(this.config.url, {
          method: this.config.method ?? 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text().catch(() => 'Unable to read response');
          this.logger.warn(
            `Webhook request failed with status ${response.status}: ${body}`
          );

          // Retry on server errors, don't retry on client errors
          const retryable = response.status >= 500 && response.status < 600;

          return this.createError(
            'WEBHOOK_ERROR',
            `HTTP ${response.status}: ${response.statusText}`,
            retryable,
            { status: response.status, body }
          );
        }

        this.logger.debug(`Webhook delivered successfully to ${this.config.url}`);
        return this.createSuccess();
      } catch (error) {
        clearTimeout(timeoutId);

        if ((error as Error).name === 'AbortError') {
          return this.createError(
            'TIMEOUT',
            `Request timeout after ${this.config.timeout}ms`,
            true,
            error
          );
        }

        // Network errors are retryable
        return this.createError(
          'NETWORK_ERROR',
          error instanceof Error ? error.message : 'Unknown network error',
          true,
          error
        );
      }
    } catch (error) {
      return this.createError(
        'SEND_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        false,
        error
      );
    }
  }

  /**
   * Validate webhook configuration
   */
  protected async validateProviderConfig(): Promise<NotificationResult> {
    // Check URL
    try {
      new URL(this.config.url);
    } catch {
      return this.createError(
        'INVALID_CONFIG',
        'Invalid webhook URL',
        false
      );
    }

    // Check HTTPS for production
    if (
      !this.config.url.startsWith('https://') &&
      !this.config.url.startsWith('http://localhost')
    ) {
      this.logger.warn(
        'Webhook URL does not use HTTPS. This is insecure in production.'
      );
    }

    // Validate authentication config
    if (this.config.authentication) {
      const auth = this.config.authentication;

      switch (auth.type) {
        case 'bearer':
          if (!auth.token) {
            return this.createError(
              'INVALID_CONFIG',
              'Bearer token is required',
              false
            );
          }
          break;

        case 'basic':
          if (!auth.username || !auth.password) {
            return this.createError(
              'INVALID_CONFIG',
              'Username and password are required for basic auth',
              false
            );
          }
          break;

        case 'api-key':
          if (!auth.token || !auth.headerName) {
            return this.createError(
              'INVALID_CONFIG',
              'API key and header name are required',
              false
            );
          }
          break;
      }
    }

    return this.createSuccess();
  }

  /**
   * Build webhook payload from notification context
   */
  private buildPayload(context: NotificationContext): WebhookPayload {
    return {
      event: context.event.type,
      timestamp: context.event.timestamp,
      data: this.extractEventData(context.event),
      organization: context.organizationName,
      statusPageUrl: context.statusPageUrl,
    };
  }

  /**
   * Extract relevant data from event based on type
   */
  private extractEventData(event: NotificationContext['event']): unknown {
    switch (event.type) {
      case 'incident.opened':
      case 'incident.closed':
      case 'incident.updated':
        return {
          incident: event.incident,
        };

      case 'maintenance.scheduled':
      case 'maintenance.started':
      case 'maintenance.completed':
        return {
          maintenance: event.maintenance,
        };

      case 'system.down':
      case 'system.degraded':
      case 'system.recovered':
        return {
          system: event.system,
        };

      case 'slo.breached':
        return {
          slo: event.slo,
        };

      default:
        return event;
    }
  }

  /**
   * Build HTTP headers including authentication
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Stentorosaur-Webhook/1.0',
      ...this.config.headers,
    };

    // Add authentication headers
    if (this.config.authentication) {
      const auth = this.config.authentication;

      switch (auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${auth.token}`;
          break;

        case 'basic': {
          const credentials = Buffer.from(
            `${auth.username}:${auth.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
          break;
        }

        case 'api-key':
          headers[auth.headerName!] = auth.token!;
          break;
      }
    }

    return headers;
  }

  /**
   * Format message for webhook (override default)
   * Returns structured data instead of plain text
   */
  protected formatMessage(context: NotificationContext): string {
    return JSON.stringify(this.buildPayload(context), null, 2);
  }
}
