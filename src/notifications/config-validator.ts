/**
 * Configuration validation using Zod schemas
 * Provides runtime validation and type safety for notification configurations
 * @packageDocumentation
 */

import { z } from 'zod';
import type {
  BaseProviderConfig,
  DiscordProviderConfig,
  EmailProviderConfig,
  MSTeamsProviderConfig,
  NotificationEventType,
  PagerDutyProviderConfig,
  ProviderConfig,
  SlackProviderConfig,
  WebhookProviderConfig,
} from './types';

/**
 * Environment variable resolution helper
 * Supports both direct values and env:VAR_NAME syntax
 */
export function resolveEnvVariable(value: string): string {
  if (value.startsWith('env:')) {
    const varName = value.slice(4);
    const resolved = process.env[varName];
    if (!resolved) {
      throw new Error(
        `Environment variable ${varName} is not defined (referenced as ${value})`
      );
    }
    return resolved;
  }
  return value;
}

/**
 * Zod transform for environment variable resolution
 */
const envString = z.string().transform(resolveEnvVariable);

/**
 * Valid notification event types
 */
const eventTypes: readonly NotificationEventType[] = [
  'incident.opened',
  'incident.closed',
  'incident.updated',
  'maintenance.scheduled',
  'maintenance.started',
  'maintenance.completed',
  'system.down',
  'system.degraded',
  'system.recovered',
  'slo.breached',
] as const;

/**
 * Base provider configuration schema
 */
const baseProviderSchema = z.object({
  id: z.string().min(1, 'Provider ID is required'),
  type: z.string().min(1, 'Provider type is required'),
  name: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  eventFilter: z.array(z.enum(eventTypes as [string, ...string[]])).optional().default([]),
  entityFilter: z.array(z.string()).optional().default([]),
  minSeverity: z.enum(['critical', 'major', 'minor']).optional().default('minor'),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(10).optional().default(3),
      initialDelay: z.number().int().min(100).optional().default(1000),
      backoffMultiplier: z.number().min(1).optional().default(2),
      maxDelay: z.number().int().min(1000).optional().default(30000),
    })
    .optional(),
  rateLimit: z
    .object({
      maxNotifications: z.number().int().min(1),
      periodMs: z.number().int().min(1000),
    })
    .optional(),
});

/**
 * Slack provider configuration schema
 */
const slackProviderSchema = baseProviderSchema.extend({
  type: z.literal('slack'),
  webhookUrl: envString.url('Invalid Slack webhook URL'),
  channel: z.string().optional(),
  username: z.string().optional(),
  iconEmoji: z.string().optional(),
  mentionUsers: z
    .object({
      critical: z.array(z.string()).optional(),
      major: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Email provider configuration schema
 */
const emailProviderSchema = baseProviderSchema.extend({
  type: z.literal('email'),
  smtp: z.object({
    host: z.string().min(1, 'SMTP host is required'),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean().optional().default(false),
    auth: z.object({
      user: envString.min(1, 'SMTP user is required'),
      pass: envString.min(1, 'SMTP password is required'),
    }),
  }),
  from: z.string().email('Invalid from email address'),
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subjectPrefix: z.string().optional().default('[Status]'),
});

/**
 * Webhook provider configuration schema
 */
const webhookProviderSchema = baseProviderSchema.extend({
  type: z.literal('webhook'),
  url: envString.url('Invalid webhook URL'),
  method: z.enum(['POST', 'PUT', 'PATCH']).optional().default('POST'),
  headers: z.record(z.string()).optional(),
  authentication: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('bearer'),
        token: envString.min(1, 'Bearer token is required'),
      }),
      z.object({
        type: z.literal('basic'),
        username: envString.min(1, 'Username is required'),
        password: envString.min(1, 'Password is required'),
      }),
      z.object({
        type: z.literal('api-key'),
        token: envString.min(1, 'API key is required'),
        headerName: z.string().min(1, 'Header name is required'),
      }),
    ])
    .optional(),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000),
});

/**
 * Discord provider configuration schema
 */
const discordProviderSchema = baseProviderSchema.extend({
  type: z.literal('discord'),
  webhookUrl: envString.url('Invalid Discord webhook URL'),
  username: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  mentionRoles: z
    .object({
      critical: z.array(z.string()).optional(),
      major: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * PagerDuty provider configuration schema
 */
const pagerDutyProviderSchema = baseProviderSchema.extend({
  type: z.literal('pagerduty'),
  integrationKey: envString.min(1, 'Integration key is required'),
  apiKey: envString.optional(),
  routingKey: envString.optional(),
  severity: z
    .object({
      critical: z.enum(['critical', 'error']).optional().default('critical'),
      major: z.enum(['warning', 'error']).optional().default('error'),
      minor: z.enum(['warning', 'info']).optional().default('warning'),
    })
    .optional(),
});

/**
 * Microsoft Teams provider configuration schema
 */
const msTeamsProviderSchema = baseProviderSchema.extend({
  type: z.literal('msteams'),
  webhookUrl: envString.url('Invalid MS Teams webhook URL'),
  themeColor: z
    .object({
      critical: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      major: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      minor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      maintenance: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    })
    .optional(),
});

/**
 * Union schema for all provider types
 */
const providerConfigSchema = z.discriminatedUnion('type', [
  slackProviderSchema,
  emailProviderSchema,
  webhookProviderSchema,
  discordProviderSchema,
  pagerDutyProviderSchema,
  msTeamsProviderSchema,
]);

/**
 * Validate a single provider configuration
 */
export function validateProviderConfig(
  config: unknown
): { success: true; data: ProviderConfig } | { success: false; error: z.ZodError } {
  const result = providerConfigSchema.safeParse(config);
  return result;
}

/**
 * Validate multiple provider configurations
 */
export function validateProviderConfigs(
  configs: unknown[]
): { success: true; data: ProviderConfig[] } | { success: false; errors: Array<{ index: number; error: z.ZodError }> } {
  const results = configs.map((config, index) => ({
    index,
    result: validateProviderConfig(config),
  }));

  const errors = results
    .filter((r): r is { index: number; result: { success: false; error: z.ZodError } } =>
      !r.result.success
    )
    .map(r => ({ index: r.index, error: r.result.error }));

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: results.map(r => (r.result as { success: true; data: ProviderConfig }).data),
  };
}

/**
 * Type guard: Check if config is a specific provider type
 */
export function isProviderType<T extends ProviderConfig['type']>(
  config: ProviderConfig,
  type: T
): config is Extract<ProviderConfig, { type: T }> {
  return config.type === type;
}

/**
 * Type guard: Check if config is Slack provider
 */
export function isSlackProvider(config: ProviderConfig): config is SlackProviderConfig {
  return isProviderType(config, 'slack');
}

/**
 * Type guard: Check if config is Email provider
 */
export function isEmailProvider(config: ProviderConfig): config is EmailProviderConfig {
  return isProviderType(config, 'email');
}

/**
 * Type guard: Check if config is Webhook provider
 */
export function isWebhookProvider(config: ProviderConfig): config is WebhookProviderConfig {
  return isProviderType(config, 'webhook');
}

/**
 * Type guard: Check if config is Discord provider
 */
export function isDiscordProvider(config: ProviderConfig): config is DiscordProviderConfig {
  return isProviderType(config, 'discord');
}

/**
 * Type guard: Check if config is PagerDuty provider
 */
export function isPagerDutyProvider(config: ProviderConfig): config is PagerDutyProviderConfig {
  return isProviderType(config, 'pagerduty');
}

/**
 * Type guard: Check if config is MS Teams provider
 */
export function isMSTeamsProvider(config: ProviderConfig): config is MSTeamsProviderConfig {
  return isProviderType(config, 'msteams');
}

/**
 * Get schema for a specific provider type
 * Useful for documentation generation
 */
export function getProviderSchema(type: ProviderConfig['type']): z.ZodTypeAny {
  switch (type) {
    case 'slack':
      return slackProviderSchema;
    case 'email':
      return emailProviderSchema;
    case 'webhook':
      return webhookProviderSchema;
    case 'discord':
      return discordProviderSchema;
    case 'pagerduty':
      return pagerDutyProviderSchema;
    case 'msteams':
      return msTeamsProviderSchema;
    default:
      throw new Error(`Unknown provider type: ${type as string}`);
  }
}

/**
 * Format Zod error for user-friendly display
 */
export function formatZodError(error: z.ZodError): string {
  return error.errors
    .map(err => {
      const path = err.path.join('.');
      return `${path ? `${path}: ` : ''}${err.message}`;
    })
    .join('\n');
}

/**
 * Validate and resolve environment variables in config
 */
export function validateAndResolveConfig(config: unknown): ProviderConfig {
  const result = validateProviderConfig(config);

  if (!result.success) {
    throw new Error(
      `Invalid provider configuration:\n${formatZodError(result.error)}`
    );
  }

  return result.data;
}
