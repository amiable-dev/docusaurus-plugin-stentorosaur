/**
 * Tests for Telegram notification provider
 */

import { TelegramProvider } from '../../src/notifications/providers/telegram-provider';
import type { NotificationEvent } from '../../src/notifications/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TelegramProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw error if botToken is missing', () => {
      expect(() => {
        new TelegramProvider({
          enabled: true,
          botToken: '',
          chatId: '123456',
        });
      }).toThrow('Telegram botToken is required');
    });

    it('should throw error if chatId is missing', () => {
      expect(() => {
        new TelegramProvider({
          enabled: true,
          botToken: '123456:ABC-DEF',
          chatId: '',
        });
      }).toThrow('Telegram chatId is required');
    });

    it('should accept valid configuration', () => {
      expect(() => {
        new TelegramProvider({
          enabled: true,
          botToken: '123456:ABC-DEF',
          chatId: '123456',
        });
      }).not.toThrow();
    });
  });

  describe('send()', () => {
    const validConfig = {
      enabled: true,
      botToken: '123456:ABC-DEF',
      chatId: '123456',
      retryConfig: {
        maxRetries: 0,
        retryDelayMs: 0,
        timeoutMs: 5000,
      },
    };

    it('should send incident.opened event successfully', async () => {
      const provider = new TelegramProvider(validConfig);
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

      const url = mockedAxios.post.mock.calls[0][0];
      expect(url).toBe('https://api.telegram.org/bot123456:ABC-DEF/sendMessage');

      const payload = mockedAxios.post.mock.calls[0][1];
      expect(payload).toHaveProperty('chat_id', '123456');
      expect(payload).toHaveProperty('text');
      expect(payload).toHaveProperty('parse_mode', 'Markdown');
    });

    it('should escape special markdown characters', async () => {
      const provider = new TelegramProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'incident.opened',
        timestamp: '2025-11-13T12:00:00Z',
        incident: {
          id: 123,
          title: 'API [Down]',
          severity: 'critical',
          affectedEntities: ['api_service'],
          url: 'https://github.com/org/repo/issues/123',
          body: 'The API (v2.0) is not responding',
        },
      };

      await provider.send(event);

      const payload = mockedAxios.post.mock.calls[0][1];
      const text = payload.text as string;

      // Special characters should be escaped
      expect(text).toContain('\\[');
      expect(text).toContain('\\]');
      // Parentheses in title get escaped, check underscore instead
      expect(text).toContain('\\_');
    });

    it('should send maintenance.scheduled event with time formatting', async () => {
      const provider = new TelegramProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'maintenance.scheduled',
        timestamp: '2025-11-13T12:00:00Z',
        maintenance: {
          id: 124,
          title: 'Database Migration',
          start: '2025-11-14T02:00:00Z',
          end: '2025-11-14T04:00:00Z',
          affectedEntities: ['database'],
          url: 'https://github.com/org/repo/issues/124',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);

      const payload = mockedAxios.post.mock.calls[0][1];
      const text = payload.text as string;

      // Should include formatted dates
      expect(text).toContain('Start:');
      expect(text).toContain('End:');
    });

    it('should send system.degraded event with reason', async () => {
      const provider = new TelegramProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'system.degraded',
        timestamp: '2025-11-13T12:00:00Z',
        system: {
          name: 'api',
          type: 'system',
          lastCheck: '2025-11-13T12:00:00Z',
          responseTime: 5000,
          reason: 'Response time exceeded threshold',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);

      const payload = mockedAxios.post.mock.calls[0][1];
      const text = payload.text as string;

      expect(text).toContain('Reason:');
      expect(text).toContain('Response time exceeded threshold');
    });

    it('should send SLO breach event', async () => {
      const provider = new TelegramProvider(validConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const event: NotificationEvent = {
        type: 'slo.breached',
        timestamp: '2025-11-13T12:00:00Z',
        slo: {
          entity: 'api',
          metric: 'uptime',
          target: 99.9,
          actual: 98.5,
          period: '30d',
        },
      };

      const result = await provider.send(event);

      expect(result).toBe(true);

      const payload = mockedAxios.post.mock.calls[0][1];
      const text = payload.text as string;

      expect(text).toContain('Target: 99.9%');
      expect(text).toContain('Actual: 98.5%');
      expect(text).toContain('Period:');
    });

    it('should use custom parse mode when specified', async () => {
      const customConfig = {
        ...validConfig,
        parseMode: 'HTML' as const,
      };

      const provider = new TelegramProvider(customConfig);
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

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

      await provider.send(event);

      const payload = mockedAxios.post.mock.calls[0][1];
      expect(payload).toHaveProperty('parse_mode', 'HTML');
    });

    it('should handle axios errors gracefully', async () => {
      const provider = new TelegramProvider(validConfig);
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
  });
});
