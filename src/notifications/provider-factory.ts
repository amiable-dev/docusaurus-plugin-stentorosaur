/**
 * Provider factory implementation
 * Handles dynamic provider instantiation with lazy loading support
 * @packageDocumentation
 */

import type { BaseNotificationProvider, ProviderLogger } from './providers/base-provider';
import type { ProviderConfig } from './types';

/**
 * Provider constructor type
 */
type ProviderConstructor<TConfig extends ProviderConfig = ProviderConfig> = new (
  config: TConfig,
  logger?: ProviderLogger
) => BaseNotificationProvider<TConfig>;

/**
 * Provider module loader function
 * Returns a dynamic import promise for lazy loading
 */
type ProviderLoader = () => Promise<{ default: ProviderConstructor }>;

/**
 * Provider registry entry
 */
interface ProviderRegistryEntry {
  loader: ProviderLoader;
  constructor?: ProviderConstructor;
}

/**
 * Global provider registry
 * Maps provider type to loader/constructor
 */
class ProviderRegistry {
  private registry = new Map<string, ProviderRegistryEntry>();

  /**
   * Register a provider with lazy loading
   */
  public register(type: string, loader: ProviderLoader): void {
    if (this.registry.has(type)) {
      throw new Error(`Provider type '${type}' is already registered`);
    }

    this.registry.set(type, { loader });
  }

  /**
   * Register a provider with eager constructor
   */
  public registerConstructor(type: string, constructor: ProviderConstructor): void {
    if (this.registry.has(type)) {
      throw new Error(`Provider type '${type}' is already registered`);
    }

    this.registry.set(type, { loader: async () => ({ default: constructor }), constructor });
  }

  /**
   * Get provider constructor (load if necessary)
   */
  public async getConstructor(type: string): Promise<ProviderConstructor | null> {
    const entry = this.registry.get(type);
    if (!entry) {
      return null;
    }

    // Return cached constructor if available
    if (entry.constructor) {
      return entry.constructor;
    }

    // Load constructor
    try {
      const module = await entry.loader();
      entry.constructor = module.default;
      return entry.constructor;
    } catch (error) {
      console.error(`Failed to load provider type '${type}':`, error);
      return null;
    }
  }

  /**
   * Check if provider type is registered
   */
  public has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Get all registered provider types
   */
  public getTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Clear all registrations (useful for testing)
   */
  public clear(): void {
    this.registry.clear();
  }
}

/**
 * Global provider registry instance
 */
const globalRegistry = new ProviderRegistry();

/**
 * Register built-in providers with lazy loading
 * These will be loaded only when first used
 */
export function registerBuiltInProviders(): void {
  // Slack provider
  globalRegistry.register('slack', () =>
    import('./providers/slack-provider').then(m => ({ default: m.SlackProvider as unknown as ProviderConstructor }))
  );

  // Email provider
  globalRegistry.register('email', () =>
    import('./providers/email-provider').then(m => ({ default: m.EmailProvider as unknown as ProviderConstructor }))
  );

  // Webhook provider
  globalRegistry.register('webhook', () =>
    import('./providers/webhook-provider').then(m => ({ default: m.WebhookProvider as unknown as ProviderConstructor }))
  );

  // Discord provider
  globalRegistry.register('discord', () =>
    import('./providers/discord-provider').then(m => ({ default: m.DiscordProvider as unknown as ProviderConstructor }))
  );

  // PagerDuty provider
  globalRegistry.register('pagerduty', () =>
    import('./providers/pagerduty-provider').then(m => ({ default: m.PagerDutyProvider as unknown as ProviderConstructor }))
  );

  // Microsoft Teams provider
  globalRegistry.register('msteams', () =>
    import('./providers/msteams-provider').then(m => ({ default: m.MSTeamsProvider as unknown as ProviderConstructor }))
  );
}

/**
 * Register a custom provider type
 * Allows users to extend the notification system with their own providers
 *
 * @example
 * ```typescript
 * class CustomProvider extends BaseNotificationProvider {
 *   // ... implementation
 * }
 *
 * registerCustomProvider('custom', CustomProvider);
 * ```
 */
export function registerCustomProvider(
  type: string,
  constructor: ProviderConstructor
): void {
  globalRegistry.registerConstructor(type, constructor);
}

/**
 * Register a custom provider with lazy loading
 *
 * @example
 * ```typescript
 * registerCustomProviderLazy('custom', () =>
 *   import('./custom-provider').then(m => ({ default: m.CustomProvider }))
 * );
 * ```
 */
export function registerCustomProviderLazy(
  type: string,
  loader: ProviderLoader
): void {
  globalRegistry.register(type, loader);
}

/**
 * Check if a provider type is registered
 */
export function isProviderTypeRegistered(type: string): boolean {
  return globalRegistry.has(type);
}

/**
 * Get all registered provider types
 */
export function getRegisteredProviderTypes(): string[] {
  return globalRegistry.getTypes();
}

/**
 * Create provider instance from configuration
 * This is the main factory function used by NotificationService
 */
export async function createProvider(
  config: ProviderConfig,
  logger?: ProviderLogger
): Promise<BaseNotificationProvider> {
  const constructor = await globalRegistry.getConstructor(config.type);

  if (!constructor) {
    throw new Error(
      `Unknown provider type: ${config.type}. Available types: ${globalRegistry.getTypes().join(', ')}`
    );
  }

  try {
    return new constructor(config, logger);
  } catch (error) {
    throw new Error(
      `Failed to instantiate provider '${config.id}' of type '${config.type}': ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Clear provider registry (for testing)
 */
export function clearProviderRegistry(): void {
  globalRegistry.clear();
}

/**
 * Auto-register built-in providers on module load
 */
registerBuiltInProviders();
