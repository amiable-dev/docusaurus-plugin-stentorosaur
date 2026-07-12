/**
 * Email notification provider using SMTP (nodemailer)
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { NotificationEvent } from '../types';

export interface EmailConfig {
  enabled: boolean;
  provider: 'smtp' | 'sendgrid' | 'ses' | 'mailgun';
  from: string;
  to: string[];
  cc?: string[];
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}

export class EmailProvider {
  readonly name = 'email';
  private transporter?: Transporter;

  constructor(private config: EmailConfig) {
    this.validate(config);
    this.initializeTransporter();
  }

  async send(event: NotificationEvent): Promise<boolean> {
    if (!this.transporter) {
      console.error('[Email] Transporter not initialized');
      return false;
    }

    const { subject, html, text } = this.formatMessage(event);

    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to.join(', '),
        cc: this.config.cc?.join(', '),
        subject,
        text,
        html,
      });

      console.log(`[Email] Message sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('[Email] Error sending message:', error);
      return false;
    }
  }

  validate(config: EmailConfig): void {
    if (!config.from) {
      throw new Error('Email from address is required');
    }
    if (!config.to || config.to.length === 0) {
      throw new Error('Email to addresses are required');
    }
    if (config.provider === 'smtp' && !config.smtp) {
      throw new Error('SMTP configuration is required for SMTP provider');
    }
  }

  private initializeTransporter(): void {
    if (this.config.provider === 'smtp' && this.config.smtp) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass,
        },
      });
    }
  }

  private formatMessage(event: NotificationEvent): { subject: string; html: string; text: string } {
    const emoji = this.getEmojiForEvent(event);
    const title = this.getEventTitle(event);
    const subject = `${emoji} ${title}`;

    let htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${this.getColorForEvent(event)}; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">${emoji} ${this.escapeHtml(title)}</h2>
          </div>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
    `;

    let textContent = `${emoji} ${title}\n\n`;

    // Incident events
    if ('incident' in event && event.incident) {
      if (event.type === 'incident.opened' || event.type === 'incident.updated') {
        htmlContent += `<p><strong>Severity:</strong> ${this.escapeHtml(event.incident.severity.toUpperCase())}</p>`;
        textContent += `Severity: ${event.incident.severity.toUpperCase()}\n`;
      }

      if (event.type === 'incident.opened' && 'body' in event.incident) {
        const bodyPreview = event.incident.body.slice(0, 500);
        htmlContent += `<p><strong>Description:</strong></p><p>${this.escapeHtml(bodyPreview)}${event.incident.body.length > 500 ? '...' : ''}</p>`;
        textContent += `Description: ${bodyPreview}${event.incident.body.length > 500 ? '...' : ''}\n`;
      }

      if (event.type === 'incident.closed' && 'duration' in event.incident) {
        htmlContent += `<p><strong>Duration:</strong> ${this.formatDuration(event.incident.duration)}</p>`;
        textContent += `Duration: ${this.formatDuration(event.incident.duration)}\n`;
      }

      if (event.incident.affectedEntities && event.incident.affectedEntities.length > 0) {
        htmlContent += `<p><strong>Affected Systems:</strong> ${this.escapeHtml(event.incident.affectedEntities.join(', '))}</p>`;
        textContent += `Affected Systems: ${event.incident.affectedEntities.join(', ')}\n`;
      }

      htmlContent += `<p><a href="${event.incident.url}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View Incident</a></p>`;
      textContent += `\nView Incident: ${event.incident.url}\n`;
    }

    // Maintenance events
    if ('maintenance' in event && event.maintenance) {
      if (event.type === 'maintenance.scheduled' && 'start' in event.maintenance && 'end' in event.maintenance) {
        htmlContent += `<p><strong>Start Time:</strong> ${new Date(event.maintenance.start).toLocaleString()}</p>`;
        htmlContent += `<p><strong>End Time:</strong> ${new Date(event.maintenance.end).toLocaleString()}</p>`;
        textContent += `Start Time: ${new Date(event.maintenance.start).toLocaleString()}\n`;
        textContent += `End Time: ${new Date(event.maintenance.end).toLocaleString()}\n`;
      }

      if (event.type === 'maintenance.completed' && 'duration' in event.maintenance) {
        htmlContent += `<p><strong>Duration:</strong> ${this.formatDuration(event.maintenance.duration)}</p>`;
        textContent += `Duration: ${this.formatDuration(event.maintenance.duration)}\n`;
      }

      if (event.maintenance.affectedEntities && event.maintenance.affectedEntities.length > 0) {
        htmlContent += `<p><strong>Affected Systems:</strong> ${this.escapeHtml(event.maintenance.affectedEntities.join(', '))}</p>`;
        textContent += `Affected Systems: ${event.maintenance.affectedEntities.join(', ')}\n`;
      }

      htmlContent += `<p><a href="${event.maintenance.url}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View Details</a></p>`;
      textContent += `\nView Details: ${event.maintenance.url}\n`;
    }

    // System events
    if ('system' in event && event.system) {
      htmlContent += `<p><strong>System:</strong> ${this.escapeHtml(event.system.name)}</p>`;
      htmlContent += `<p><strong>Type:</strong> ${this.escapeHtml(event.system.type)}</p>`;
      textContent += `System: ${event.system.name}\n`;
      textContent += `Type: ${event.system.type}\n`;

      if (event.type === 'system.down' && 'error' in event.system && event.system.error) {
        htmlContent += `<p><strong>Error:</strong> ${this.escapeHtml(event.system.error)}</p>`;
        textContent += `Error: ${event.system.error}\n`;
      }

      if (event.type === 'system.degraded' && 'reason' in event.system) {
        htmlContent += `<p><strong>Reason:</strong> ${this.escapeHtml(event.system.reason)}</p>`;
        textContent += `Reason: ${event.system.reason}\n`;
      }

      if (event.type === 'system.recovered' && 'downtime' in event.system) {
        htmlContent += `<p><strong>Downtime:</strong> ${this.formatDuration(event.system.downtime)}</p>`;
        textContent += `Downtime: ${this.formatDuration(event.system.downtime)}\n`;
      }

      if ('responseTime' in event.system && event.system.responseTime !== undefined) {
        htmlContent += `<p><strong>Response Time:</strong> ${event.system.responseTime}ms</p>`;
        textContent += `Response Time: ${event.system.responseTime}ms\n`;
      }
    }

    // SLO events
    if ('slo' in event && event.slo) {
      htmlContent += `<p><strong>Entity:</strong> ${this.escapeHtml(event.slo.entity)}</p>`;
      htmlContent += `<p><strong>Metric:</strong> ${this.escapeHtml(event.slo.metric)}</p>`;
      htmlContent += `<p><strong>Target:</strong> ${event.slo.target}%</p>`;
      htmlContent += `<p><strong>Actual:</strong> ${event.slo.actual}%</p>`;
      htmlContent += `<p><strong>Period:</strong> ${this.escapeHtml(event.slo.period)}</p>`;
      textContent += `Entity: ${event.slo.entity}\n`;
      textContent += `Metric: ${event.slo.metric}\n`;
      textContent += `Target: ${event.slo.target}%\n`;
      textContent += `Actual: ${event.slo.actual}%\n`;
      textContent += `Period: ${event.slo.period}\n`;
    }

    htmlContent += `
            <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
            <p style="color: #666; font-size: 0.9em;">${new Date(event.timestamp).toLocaleString()}</p>
            <p style="color: #999; font-size: 0.8em;">Sent by Stentorosaur Status Monitor</p>
          </div>
        </body>
      </html>
    `;

    textContent += `\n${new Date(event.timestamp).toLocaleString()}\n`;
    textContent += `\nSent by Stentorosaur Status Monitor\n`;

    return {
      subject,
      html: htmlContent,
      text: textContent,
    };
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

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
