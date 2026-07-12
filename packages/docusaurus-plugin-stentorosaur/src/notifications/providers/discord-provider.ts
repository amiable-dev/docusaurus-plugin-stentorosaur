/**
 * Discord notification provider using Webhooks
 */

import axios from 'axios';
import type { NotificationEvent } from '../types';

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}

export class DiscordProvider {
  readonly name = 'discord';

  constructor(private config: DiscordConfig) {
    this.validate(config);
  }

  async send(event: NotificationEvent): Promise<boolean> {
    const message = this.formatMessage(event);

    try {
      const response = await axios.post(
        this.config.webhookUrl,
        message,
        {
          timeout: this.config.retryConfig?.timeoutMs ?? 10000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      return response.status === 204 || response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[Discord] Error: ${error.response?.status} - ${error.message}`);
      }
      return false;
    }
  }

  validate(config: DiscordConfig): void {
    if (!config.webhookUrl) {
      throw new Error('Discord webhookUrl is required');
    }
    if (!config.webhookUrl.startsWith('https://discord.com/api/webhooks/') &&
        !config.webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
      throw new Error('Invalid Discord webhook URL');
    }
  }

  private formatMessage(event: NotificationEvent): unknown {
    const color = this.getColorForEvent(event);
    const title = this.getEventTitle(event);

    const embed: any = {
      title,
      color,
      timestamp: event.timestamp,
      footer: {
        text: 'Stentorosaur Status Monitor',
      },
    };

    const fields: any[] = [];

    // Add incident details
    if ('incident' in event && event.incident) {
      // Severity only exists on opened/updated events
      if (event.type === 'incident.opened' || event.type === 'incident.updated') {
        fields.push({
          name: 'Severity',
          value: event.incident.severity.toUpperCase(),
          inline: true,
        });
      }

      fields.push({
        name: 'Incident',
        value: `[#${event.incident.id}](${event.incident.url})`,
        inline: true,
      });

      if (event.incident.affectedEntities && event.incident.affectedEntities.length > 0) {
        fields.push({
          name: 'Affected Systems',
          value: event.incident.affectedEntities.map(e => `\`${e}\``).join(', '),
          inline: false,
        });
      }

      // Body only exists on opened events
      if (event.type === 'incident.opened') {
        const bodyPreview = event.incident.body.slice(0, 300);
        embed.description = bodyPreview + (event.incident.body.length > 300 ? '...' : '');
      }

      // Duration only exists on closed events
      if (event.type === 'incident.closed') {
        fields.push({
          name: 'Duration',
          value: this.formatDuration(event.incident.duration),
          inline: true,
        });
      }
    }

    // Add maintenance details
    if ('maintenance' in event && event.maintenance) {
      if (event.type === 'maintenance.scheduled' && 'start' in event.maintenance) {
        fields.push({
          name: 'Start Time',
          value: `<t:${Math.floor(new Date(event.maintenance.start).getTime() / 1000)}:F>`,
          inline: true,
        });
      }

      if ((event.type === 'maintenance.scheduled' || event.type === 'maintenance.started') && 'end' in event.maintenance) {
        fields.push({
          name: 'End Time',
          value: `<t:${Math.floor(new Date(event.maintenance.end).getTime() / 1000)}:F>`,
          inline: true,
        });
      }

      if (event.type === 'maintenance.completed' && 'duration' in event.maintenance) {
        fields.push({
          name: 'Duration',
          value: this.formatDuration(event.maintenance.duration),
          inline: true,
        });
      }

      if (event.maintenance.affectedEntities && event.maintenance.affectedEntities.length > 0) {
        fields.push({
          name: 'Affected Systems',
          value: event.maintenance.affectedEntities.map(e => `\`${e}\``).join(', '),
          inline: false,
        });
      }

      if (event.maintenance.url) {
        fields.push({
          name: 'Details',
          value: `[View Maintenance](${event.maintenance.url})`,
          inline: false,
        });
      }
    }

    // Add system change details
    if ('system' in event && event.system) {
      fields.push({
        name: 'System',
        value: `\`${event.system.name}\``,
        inline: true,
      });

      fields.push({
        name: 'Type',
        value: event.system.type.toUpperCase(),
        inline: true,
      });

      if (event.type === 'system.down' && 'error' in event.system && event.system.error) {
        fields.push({
          name: 'Error',
          value: event.system.error,
          inline: false,
        });
      }

      if (event.type === 'system.degraded' && 'reason' in event.system) {
        fields.push({
          name: 'Reason',
          value: event.system.reason,
          inline: false,
        });
      }

      if (event.type === 'system.recovered' && 'downtime' in event.system) {
        fields.push({
          name: 'Downtime',
          value: this.formatDuration(event.system.downtime),
          inline: true,
        });
      }

      if ('responseTime' in event.system && event.system.responseTime !== undefined) {
        fields.push({
          name: 'Response Time',
          value: `${event.system.responseTime}ms`,
          inline: true,
        });
      }
    }

    embed.fields = fields;

    return {
      username: this.config.username ?? 'Stentorosaur',
      avatar_url: this.config.avatarUrl,
      embeds: [embed],
    };
  }

  private getColorForEvent(event: NotificationEvent): number {
    // Discord uses decimal color values
    if ('incident' in event && event.incident) {
      if ((event.type === 'incident.opened' || event.type === 'incident.updated') && 'severity' in event.incident) {
        switch (event.incident.severity) {
          case 'critical':
            return 0xd32f2f; // Red
          case 'major':
            return 0xf57c00; // Orange
          case 'minor':
            return 0xfbc02d; // Yellow
        }
      }
    }

    switch (event.type) {
      case 'incident.opened':
        return 0xd32f2f; // Red
      case 'incident.closed':
      case 'maintenance.completed':
      case 'system.recovered':
        return 0x388e3c; // Green
      case 'maintenance.scheduled':
      case 'maintenance.started':
        return 0x1976d2; // Blue
      case 'system.down':
        return 0xd32f2f; // Red
      case 'system.degraded':
        return 0xf57c00; // Orange
      default:
        return 0x757575; // Gray
    }
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

  private getEventTitle(event: NotificationEvent): string {
    const emoji = this.getEmojiForEvent(event);

    switch (event.type) {
      case 'incident.opened':
        return `${emoji} ${event.incident?.title || 'New Incident'}`;
      case 'incident.closed':
        return `${emoji} Incident Resolved: ${event.incident?.title || 'Unknown'}`;
      case 'incident.updated':
        return `${emoji} Incident Updated: ${event.incident?.title || 'Unknown'}`;
      case 'maintenance.scheduled':
        return `${emoji} ${event.maintenance?.title || 'Maintenance Scheduled'}`;
      case 'maintenance.started':
        return `${emoji} ${event.maintenance?.title || 'Maintenance Started'}`;
      case 'maintenance.completed':
        return `${emoji} ${event.maintenance?.title || 'Maintenance Completed'}`;
      case 'system.down':
        return `${emoji} ${event.system?.name || 'System'} Down`;
      case 'system.degraded':
        return `${emoji} ${event.system?.name || 'System'} Degraded`;
      case 'system.recovered':
        return `${emoji} ${event.system?.name || 'System'} Recovered`;
      case 'slo.breached':
        return `${emoji} SLO Breached: ${event.slo?.entity || 'Unknown'}`;
      default:
        return `${emoji} Status Update`;
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
}
