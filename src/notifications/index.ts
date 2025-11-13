/**
 * Stentorosaur Notification System
 *
 * A type-safe, extensible notification system for status page events.
 * Supports multiple providers (Slack, email, webhooks, Discord, PagerDuty, MS Teams)
 * with configurable filtering, retry logic, and rate limiting.
 *
 * @packageDocumentation
 */

// Core service
export {
  NotificationService,
  createNotificationService,
  type NotificationServiceConfig,
  type ProviderFactory,
} from './notification-service';

// Provider factory
export {
  createProvider,
  registerCustomProvider,
  registerCustomProviderLazy,
  isProviderTypeRegistered,
  getRegisteredProviderTypes,
  clearProviderRegistry,
} from './provider-factory';

// Base provider class for custom implementations
export {
  BaseNotificationProvider,
  type ProviderLogger,
  defaultLogger,
} from './providers/base-provider';

// Built-in provider implementations
export { WebhookProvider } from './providers/webhook-provider';
// Additional providers will be exported as they are implemented:
// export { SlackProvider } from './providers/slack-provider';
// export { EmailProvider } from './providers/email-provider';
// export { DiscordProvider } from './providers/discord-provider';
// export { PagerDutyProvider } from './providers/pagerduty-provider';
// export { MSTeamsProvider } from './providers/msteams-provider';

// Configuration validation
export {
  validateProviderConfig,
  validateProviderConfigs,
  validateAndResolveConfig,
  resolveEnvVariable,
  formatZodError,
  getProviderSchema,
  // Type guards
  isProviderType,
  isSlackProvider,
  isEmailProvider,
  isWebhookProvider,
  isDiscordProvider,
  isPagerDutyProvider,
  isMSTeamsProvider,
} from './config-validator';

// Type definitions
export type {
  // Events
  NotificationEvent,
  NotificationEventType,
  EventDataForType,
  // Results
  NotificationResult,
  NotificationError,
  // Context
  NotificationContext,
  // Provider configs
  BaseProviderConfig,
  ProviderConfig,
  SlackProviderConfig,
  EmailProviderConfig,
  WebhookProviderConfig,
  DiscordProviderConfig,
  PagerDutyProviderConfig,
  MSTeamsProviderConfig,
  ConfigForProviderType,
  // Statistics
  NotificationStats,
  // Batch operations
  BatchNotificationRequest,
  BatchNotificationResult,
} from './types';
