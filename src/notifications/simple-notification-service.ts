/**
 * Simplified notification service for sending notifications to multiple channels
 */

import type { NotificationEvent } from './types';
import { SlackProvider, type SlackConfig } from './providers/slack-provider';
import { TelegramProvider, type TelegramConfig } from './providers/telegram-provider';
import { EmailProvider, type EmailConfig } from './providers/email-provider';
import { DiscordProvider, type DiscordConfig } from './providers/discord-provider';

export interface SimpleNotificationConfig {
  enabled?: boolean;
  channels?: {
    slack?: SlackConfig;
    telegram?: TelegramConfig;
    email?: EmailConfig;
    discord?: DiscordConfig;
  };
  events?: {
    incidentOpened?: boolean;
    incidentClosed?: boolean;
    incidentUpdated?: boolean;
    maintenanceScheduled?: boolean;
    maintenanceStarted?: boolean;
    maintenanceCompleted?: boolean;
    systemDegraded?: boolean;
    systemRestored?: boolean;
  };
}

export interface NotificationResult {
  provider: string;
  success: boolean;
  error?: Error;
}

export class SimpleNotificationService {
  private providers: Map<string, any> = new Map();

  constructor(private config: SimpleNotificationConfig) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (this.config.channels?.slack?.enabled) {
      try {
        this.providers.set('slack', new SlackProvider(this.config.channels.slack));
      } catch (error) {
        console.error('[NotificationService] Failed to initialize Slack provider:', error);
      }
    }

    if (this.config.channels?.telegram?.enabled) {
      try {
        this.providers.set('telegram', new TelegramProvider(this.config.channels.telegram));
      } catch (error) {
        console.error('[NotificationService] Failed to initialize Telegram provider:', error);
      }
    }

    if (this.config.channels?.email?.enabled) {
      try {
        this.providers.set('email', new EmailProvider(this.config.channels.email));
      } catch (error) {
        console.error('[NotificationService] Failed to initialize Email provider:', error);
      }
    }

    if (this.config.channels?.discord?.enabled) {
      try {
        this.providers.set('discord', new DiscordProvider(this.config.channels.discord));
      } catch (error) {
        console.error('[NotificationService] Failed to initialize Discord provider:', error);
      }
    }
  }

  async sendNotification(event: NotificationEvent): Promise<NotificationResult[]> {
    // Check if event type is enabled
    if (!this.isEventEnabled(event.type)) {
      return [];
    }

    const results: NotificationResult[] = [];

    // Send to all enabled providers
    for (const [name, provider] of this.providers) {
      try {
        const success = await this.sendWithRetry(provider, event);
        results.push({ provider: name, success });
      } catch (error) {
        results.push({
          provider: name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }

  async sendNotifications(events: NotificationEvent[]): Promise<NotificationResult[]> {
    const allResults: NotificationResult[] = [];

    for (const event of events) {
      const results = await this.sendNotification(event);
      allResults.push(...results);
    }

    return allResults;
  }

  private async sendWithRetry(provider: any, event: NotificationEvent): Promise<boolean> {
    const maxRetries = provider.config?.retryConfig?.maxRetries ?? 3;
    const retryDelayMs = provider.config?.retryConfig?.retryDelayMs ?? 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const success = await provider.send(event);
        if (success) {
          return true;
        }
      } catch (error) {
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isEventEnabled(eventType: string): boolean {
    const events = this.config.events ?? {};

    switch (eventType) {
      case 'incident.opened':
        return events.incidentOpened ?? true;
      case 'incident.closed':
        return events.incidentClosed ?? true;
      case 'incident.updated':
        return events.incidentUpdated ?? false;
      case 'maintenance.scheduled':
        return events.maintenanceScheduled ?? true;
      case 'maintenance.started':
        return events.maintenanceStarted ?? true;
      case 'maintenance.completed':
        return events.maintenanceCompleted ?? false;
      case 'system.degraded':
        return events.systemDegraded ?? true;
      case 'system.restored':
        return events.systemRestored ?? true;
      default:
        return false;
    }
  }
}
