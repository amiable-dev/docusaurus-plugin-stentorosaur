/**
 * Telegram notification provider using Bot API
 */

import axios from 'axios';
import type { NotificationEvent } from '../types';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  parseMode?: 'Markdown' | 'HTML';
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}

export class TelegramProvider {
  readonly name = 'telegram';

  constructor(private config: TelegramConfig) {
    this.validate(config);
  }

  async send(event: NotificationEvent): Promise<boolean> {
    const message = this.formatMessage(event);
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

    try {
      const response = await axios.post(
        url,
        {
          chat_id: this.config.chatId,
          text: message,
          parse_mode: this.config.parseMode ?? 'Markdown',
          disable_web_page_preview: false,
        },
        {
          timeout: this.config.retryConfig?.timeoutMs ?? 10000,
        }
      );

      return response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[Telegram] Error: ${error.response?.status} - ${error.message}`);
      }
      return false;
    }
  }

  validate(config: TelegramConfig): void {
    if (!config.botToken) {
      throw new Error('Telegram botToken is required');
    }
    if (!config.chatId) {
      throw new Error('Telegram chatId is required');
    }
  }

  private formatMessage(event: NotificationEvent): string {
    const emoji = this.getEmojiForEvent(event);
    const title = this.getEventTitle(event);

    let message = `${emoji} *${this.escapeMarkdown(title)}*\n\n`;

    // Incident events
    if ('incident' in event && event.incident) {
      if (event.type === 'incident.opened' || event.type === 'incident.updated') {
        message += `📊 Severity: ${this.escapeMarkdown(event.incident.severity.toUpperCase())}\n`;
      }

      if (event.type === 'incident.closed' && 'duration' in event.incident) {
        message += `⏱ Duration: ${this.escapeMarkdown(this.formatDuration(event.incident.duration))}\n`;
      }

      if (event.incident.affectedEntities && event.incident.affectedEntities.length > 0) {
        message += `🎯 Affected: ${this.escapeMarkdown(event.incident.affectedEntities.join(', '))}\n`;
      }

      message += `\n[View Incident](${event.incident.url})`;
    }

    // Maintenance events
    if ('maintenance' in event && event.maintenance) {
      if (event.type === 'maintenance.scheduled' && 'start' in event.maintenance && 'end' in event.maintenance) {
        const startTime = Math.floor(new Date(event.maintenance.start).getTime() / 1000);
        const endTime = Math.floor(new Date(event.maintenance.end).getTime() / 1000);
        message += `📅 Start: ${this.formatUnixTime(startTime)}\n`;
        message += `📅 End: ${this.formatUnixTime(endTime)}\n`;
      }

      if (event.type === 'maintenance.completed' && 'duration' in event.maintenance) {
        message += `⏱ Duration: ${this.escapeMarkdown(this.formatDuration(event.maintenance.duration))}\n`;
      }

      if (event.maintenance.affectedEntities && event.maintenance.affectedEntities.length > 0) {
        message += `🎯 Affected: ${this.escapeMarkdown(event.maintenance.affectedEntities.join(', '))}\n`;
      }

      message += `\n[View Details](${event.maintenance.url})`;
    }

    // System events
    if ('system' in event && event.system) {
      message += `💻 System: ${this.escapeMarkdown(event.system.name)}\n`;
      message += `📦 Type: ${this.escapeMarkdown(event.system.type)}\n`;

      if (event.type === 'system.down' && 'error' in event.system && event.system.error) {
        message += `❌ Error: ${this.escapeMarkdown(event.system.error)}\n`;
      }

      if (event.type === 'system.degraded' && 'reason' in event.system) {
        message += `⚠️ Reason: ${this.escapeMarkdown(event.system.reason)}\n`;
      }

      if (event.type === 'system.recovered' && 'downtime' in event.system) {
        message += `⏱ Downtime: ${this.escapeMarkdown(this.formatDuration(event.system.downtime))}\n`;
      }

      if ('responseTime' in event.system && event.system.responseTime !== undefined) {
        message += `⚡ Response Time: ${event.system.responseTime}ms\n`;
      }
    }

    // SLO events
    if ('slo' in event && event.slo) {
      message += `🎯 Entity: ${this.escapeMarkdown(event.slo.entity)}\n`;
      message += `📊 Metric: ${this.escapeMarkdown(event.slo.metric)}\n`;
      message += `🎯 Target: ${event.slo.target}%\n`;
      message += `📈 Actual: ${event.slo.actual}%\n`;
      message += `📅 Period: ${this.escapeMarkdown(event.slo.period)}\n`;
    }

    message += `\n🕒 ${new Date(event.timestamp).toLocaleString()}`;

    return message;
  }

  private formatUnixTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  private getEventTitle(event: NotificationEvent): string {
    switch (event.type) {
      case 'incident.opened':
        return event.incident?.title || 'New Incident';
      case 'incident.closed':
        return `Incident Resolved: ${event.incident?.title || 'Unknown'}`;
      case 'incident.updated':
        return `Incident Updated: ${event.incident?.title || 'Unknown'}`;
      case 'maintenance.scheduled':
        return event.maintenance?.title || 'Maintenance Scheduled';
      case 'maintenance.started':
        return event.maintenance?.title || 'Maintenance Started';
      case 'maintenance.completed':
        return event.maintenance?.title || 'Maintenance Completed';
      case 'system.down':
        return `${event.system?.name || 'System'} Down`;
      case 'system.degraded':
        return `${event.system?.name || 'System'} Degraded`;
      case 'system.recovered':
        return `${event.system?.name || 'System'} Recovered`;
      case 'slo.breached':
        return `SLO Breached: ${event.slo?.entity || 'Unknown'}`;
      default:
        return 'Status Update';
    }
  }

  private getEmojiForEvent(event: NotificationEvent): string {
    switch (event.type) {
      case 'incident.opened':
        return '🔴';
      case 'incident.closed':
        return '✅';
      case 'incident.updated':
        return '🟡';
      case 'maintenance.scheduled':
        return '🔧';
      case 'maintenance.started':
        return '⚙️';
      case 'maintenance.completed':
        return '✅';
      case 'system.down':
        return '🔴';
      case 'system.degraded':
        return '🟡';
      case 'system.recovered':
        return '✅';
      case 'slo.breached':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  }

  private escapeMarkdown(text: string): string {
    // Escape special Markdown characters
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
