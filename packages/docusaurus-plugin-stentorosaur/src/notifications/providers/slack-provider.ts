/**
 * Slack notification provider using Incoming Webhooks
 */

import axios from 'axios';
import type { NotificationEvent } from '../types';

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  channel?: string;
  mentionUsers?: string[];
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}

export class SlackProvider {
  readonly name = 'slack';

  constructor(private config: SlackConfig) {
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

      return response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[Slack] Error: ${error.response?.status} - ${error.message}`);
      }
      return false;
    }
  }

  validate(config: SlackConfig): void {
    if (!config.webhookUrl) {
      throw new Error('Slack webhookUrl is required');
    }
    if (!config.webhookUrl.startsWith('https://hooks.slack.com/')) {
      throw new Error('Invalid Slack webhook URL');
    }
  }

  private formatMessage(event: NotificationEvent): unknown {
    const emoji = this.getEmojiForEvent(event);
    const color = this.getColorForEvent(event);
    const title = this.getEventTitle(event);

    const blocks: unknown[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${title}`,
          emoji: true,
        },
      },
    ];

    // Add mentions for critical incidents
    if (event.type === 'incident.opened' && event.incident.severity === 'critical' && this.config.mentionUsers) {
      const mentions = this.config.mentionUsers.map(user => `<@${user}>`).join(' ');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: mentions,
        },
      });
    }

    // Build fields based on event type
    const fields: unknown[] = [];

    // Incident events
    if ('incident' in event && event.incident) {
      if (event.type === 'incident.opened' || event.type === 'incident.updated') {
        fields.push({
          type: 'mrkdwn',
          text: `*Severity:*\n${event.incident.severity.toUpperCase()}`,
        });
      }

      fields.push({
        type: 'mrkdwn',
        text: `*Time:*\n${new Date(event.timestamp).toLocaleString()}`,
      });

      if (event.incident.affectedEntities && event.incident.affectedEntities.length > 0) {
        fields.push({
          type: 'mrkdwn',
          text: `*Affected:*\n${event.incident.affectedEntities.join(', ')}`,
        });
      }

      if (event.type === 'incident.closed' && 'duration' in event.incident) {
        fields.push({
          type: 'mrkdwn',
          text: `*Duration:*\n${this.formatDuration(event.incident.duration)}`,
        });
      }
    }

    // Maintenance events
    if ('maintenance' in event && event.maintenance) {
      if (event.type === 'maintenance.scheduled' && 'start' in event.maintenance && 'end' in event.maintenance) {
        fields.push({
          type: 'mrkdwn',
          text: `*Start:*\n${new Date(event.maintenance.start).toLocaleString()}`,
        });
        fields.push({
          type: 'mrkdwn',
          text: `*End:*\n${new Date(event.maintenance.end).toLocaleString()}`,
        });
      }

      if (event.type === 'maintenance.completed' && 'duration' in event.maintenance) {
        fields.push({
          type: 'mrkdwn',
          text: `*Duration:*\n${this.formatDuration(event.maintenance.duration)}`,
        });
      }

      if (event.maintenance.affectedEntities && event.maintenance.affectedEntities.length > 0) {
        fields.push({
          type: 'mrkdwn',
          text: `*Affected:*\n${event.maintenance.affectedEntities.join(', ')}`,
        });
      }
    }

    // System events
    if ('system' in event && event.system) {
      fields.push({
        type: 'mrkdwn',
        text: `*System:*\n${event.system.name}`,
      });

      fields.push({
        type: 'mrkdwn',
        text: `*Type:*\n${event.system.type}`,
      });

      if (event.type === 'system.down' && 'error' in event.system && event.system.error) {
        fields.push({
          type: 'mrkdwn',
          text: `*Error:*\n${event.system.error}`,
        });
      }

      if (event.type === 'system.degraded' && 'reason' in event.system) {
        fields.push({
          type: 'mrkdwn',
          text: `*Reason:*\n${event.system.reason}`,
        });
      }

      if (event.type === 'system.recovered' && 'downtime' in event.system) {
        fields.push({
          type: 'mrkdwn',
          text: `*Downtime:*\n${this.formatDuration(event.system.downtime)}`,
        });
      }
    }

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }

    // Add action buttons
    const url = this.getEventUrl(event);
    if (url) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
            },
            url,
          },
        ],
      });
    }

    return {
      channel: this.config.channel,
      blocks,
      attachments: [
        {
          color,
          fallback: title,
        },
      ],
    };
  }

  private getEventUrl(event: NotificationEvent): string | undefined {
    if ('incident' in event) {
      return event.incident.url;
    }
    if ('maintenance' in event) {
      return event.maintenance.url;
    }
    return undefined;
  }

  private getColorForEvent(event: NotificationEvent): string {
    if ('incident' in event && event.incident) {
      if ((event.type === 'incident.opened' || event.type === 'incident.updated') && 'severity' in event.incident) {
        switch (event.incident.severity) {
          case 'critical':
            return '#d32f2f';
          case 'major':
            return '#f57c00';
          case 'minor':
            return '#fbc02d';
        }
      }
    }

    switch (event.type) {
      case 'incident.opened':
        return '#d32f2f'; // Red
      case 'incident.closed':
      case 'maintenance.completed':
      case 'system.recovered':
        return '#388e3c'; // Green
      case 'maintenance.scheduled':
      case 'maintenance.started':
        return '#1976d2'; // Blue
      case 'system.down':
        return '#d32f2f'; // Red
      case 'system.degraded':
        return '#f57c00'; // Orange
      default:
        return '#757575'; // Gray
    }
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
        return ':red_circle:';
      case 'incident.closed':
        return ':white_check_mark:';
      case 'incident.updated':
        return ':large_yellow_circle:';
      case 'maintenance.scheduled':
        return ':wrench:';
      case 'maintenance.started':
        return ':gear:';
      case 'maintenance.completed':
        return ':white_check_mark:';
      case 'system.down':
        return ':red_circle:';
      case 'system.degraded':
        return ':large_yellow_circle:';
      case 'system.recovered':
        return ':white_check_mark:';
      case 'slo.breached':
        return ':warning:';
      default:
        return ':information_source:';
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
}
