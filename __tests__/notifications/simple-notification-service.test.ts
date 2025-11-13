/**
 * Tests for SimpleNotificationService
 */

import { SimpleNotificationService } from '../../src/notifications/simple-notification-service';
import type { NotificationEvent } from '../../src/notifications/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  })),
}));

describe('SimpleNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with no providers when all disabled', () => {
      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: { enabled: false, webhookUrl: 'https://hooks.slack.com/test' },
          telegram: { enabled: false, botToken: 'test', chatId: 'test' },
        },
      });

      expect(service).toBeDefined();
    });

    it('should initialize Slack provider when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
          },
        },
      });

      expect(service).toBeDefined();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log error if provider initialization fails', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: '', // Invalid - will cause error
          },
        },
      });

      expect(service).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize Slack provider'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('sendNotification()', () => {
    it('should send to all enabled providers', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
          telegram: {
            enabled: true,
            botToken: '123456:ABC-DEF',
            chatId: '123456',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
        },
      });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test Incident',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test body',
        },
      };

      const results = await service.sendNotification(event);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('provider', 'slack');
      expect(results[0]).toHaveProperty('success', true);
      expect(results[1]).toHaveProperty('provider', 'telegram');
      expect(results[1]).toHaveProperty('success', true);

      // Both Slack and Telegram should have been called
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should skip disabled event types', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
          },
        },
        events: {
          incidentOpened: false, // Disabled
          incidentClosed: true,
        },
      });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test',
        },
      };

      const results = await service.sendNotification(event);

      expect(results).toHaveLength(0);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should send enabled event types', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
        },
        events: {
          incidentOpened: true,
          incidentClosed: false,
        },
      });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test',
        },
      };

      const results = await service.sendNotification(event);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle provider failures gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
        },
      });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test',
        },
      };

      const results = await service.sendNotification(event);

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('provider', 'slack');
      expect(results[0]).toHaveProperty('success', false);
      // sendWithRetry catches errors internally and returns false
      // Error property is only added if the catch block in sendNotification is triggered
    });
  });

  describe('sendNotifications()', () => {
    it('should send multiple events', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
        },
      });

      const events: NotificationEvent[] = [
        {
          type: 'incident.opened',
          timestamp: '2025-11-13T12:00:00Z',
          incident: {
            id: 123,
            title: 'Incident 1',
            severity: 'critical',
            affectedEntities: ['api'],
            url: 'https://github.com/org/repo/issues/123',
            body: 'Test 1',
          },
        },
        {
          type: 'incident.closed',
          timestamp: '2025-11-13T14:00:00Z',
          incident: {
            id: 123,
            title: 'Incident 1',
            duration: 7200000,
            affectedEntities: ['api'],
            url: 'https://github.com/org/repo/issues/123',
          },
        },
      ];

      const results = await service.sendNotifications(events);

      expect(results).toHaveLength(2); // 2 events × 1 provider
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('event type defaults', () => {
    it('should enable critical events by default', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            retryConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 5000 },
          },
        },
        // No events config - should use defaults
      });

      const openedEvent: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test',
        },
      };

      const results1 = await service.sendNotification(openedEvent);
      expect(results1).toHaveLength(1);
      expect(results1[0].success).toBe(true);

      const closedEvent: NotificationEvent = {
        type: 'incident.closed',
        timestamp: '2025-11-13T14:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          duration: 3600000,
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
        },
      };

      const results2 = await service.sendNotification(closedEvent);
      expect(results2).toHaveLength(1);
      expect(results2[0].success).toBe(true);
    });

    it('should disable incident.updated by default', async () => {
      const service = new SimpleNotificationService({
        enabled: true,
        channels: {
          slack: {
            enabled: true,
            webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
          },
        },
      });

      const event: NotificationEvent = {
        type: 'incident.updated',
        timestamp: '2025-11-13T13:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          changes: {},
        },
      };

      const results = await service.sendNotification(event);
      expect(results).toHaveLength(0);
    });
  });
});
