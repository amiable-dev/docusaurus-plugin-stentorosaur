/**
 * Tests for Slack notification provider
 */

import { SlackProvider } from '../../src/notifications/providers/slack-provider';
import type { NotificationEvent } from '../../src/notifications/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SlackProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw error if webhookUrl is missing', () => {
      expect(() => {
        new SlackProvider({
          enabled: true,
          webhookUrl: '',
        });
      }).toThrow('Slack webhookUrl is required');
    });

    it('should throw error if webhookUrl is invalid', () => {
      expect(() => {
        new SlackProvider({
          enabled: true,
          webhookUrl: 'https://invalid-url.com/webhook',
        });
      }).toThrow('Invalid Slack webhook URL');
    });

    it('should accept valid Slack webhook URL', () => {
      expect(() => {
        new SlackProvider({
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
        });
      }).not.toThrow();
    });
  });

  describe('send()', () => {
    const validConfig = {
      enabled: true,
      webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
      retryConfig: {
        maxRetries: 0, // Disable retries for tests
        retryDelayMs: 0,
        timeoutMs: 5000,
      },
    };

    it('should send incident.opened event successfully', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'API Down',
          severity: 'critical',
          affectedEntities: ['api', 'web'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'The API is not responding',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        validConfig.webhookUrl,
        expect.objectContaining({
          blocks: expect.any(Array),
          attachments: expect.any(Array),
        }),
        expect.objectContaining({
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send incident.closed event with duration', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'incident.closed',
        timestamp: '2025-11-13T14:00:00Z',
        incident: {
          id: 123,
          title: 'API Down',
          duration: 7200000, // 2 hours
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send maintenance.scheduled event', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'maintenance.scheduled',
        timestamp: '2025-11-13T12:00:00Z',
        maintenance: {
          id: 124,
          title: 'Database Migration',
          start: '2025-11-14T02:00:00Z',
          end: '2025-11-14T04:00:00Z',
          affectedEntities: ['database', 'api'],
          url: 'https://github.com/org/repo/issues/124',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send system.down event', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'system.down',
        timestamp: '2025-11-13T12:00:00Z',
        system: {
          name: 'api',
          type: 'system',
          lastCheck: '2025-11-13T12:00:00Z',
          statusCode: 503,
          error: 'Connection timeout',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send system.recovered event with downtime', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'system.recovered',
        timestamp: '2025-11-13T14:00:00Z',
        system: {
          name: 'api',
          type: 'system',
          downtime: 7200000, // 2 hours
          lastCheck: '2025-11-13T14:00:00Z',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should include user mentions for critical incidents', async () => {
      const configWithMentions = {
        ...validConfig,
        mentionUsers: ['U123456', 'U789012'],
      };

      const provider = new SlackProvider(configWithMentions);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Critical Outage',
          severity: 'critical',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Complete system failure',
        },
      };

      await provider.send(event);

      const callArgs = mockedAxios.post.mock.calls[0][1];
      expect(callArgs).toHaveProperty('blocks');
      expect(JSON.stringify(callArgs)).toContain('<@U123456>');
      expect(JSON.stringify(callArgs)).toContain('<@U789012>');
    });

    it('should handle axios errors gracefully', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          severity: 'minor',
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'Test',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(false);
    });

    it('should format durations correctly', async () => {
      const provider = new SlackProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'incident.closed',
        timestamp: '2025-11-13T14:00:00Z',
        incident: {
          id: 123,
          title: 'Test',
          duration: 90061000, // 1 day, 1 hour, 1 minute, 1 second
          affectedEntities: ['api'],
          url: 'https://github.com/org/repo/issues/123',
        },
      };

      await provider.send(event);

      const callArgs = mockedAxios.post.mock.calls[0][1];
      const messageStr = JSON.stringify(callArgs);

      // Should contain formatted duration (1d 1h)
      expect(messageStr).toMatch(/1d\s+1h/);
    });
  });
});
