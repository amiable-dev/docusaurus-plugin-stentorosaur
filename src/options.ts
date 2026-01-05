/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Joi} from '@docusaurus/utils-validation';
import type {OptionValidationContext} from '@docusaurus/types';
import type {PluginOptions, SiteConfig, DataSource} from './types';

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
  statusLabel: 'status',
  entities: [],
  entitiesSource: 'config',
  labelScheme: {
    separator: ':',
    defaultType: 'system' as const,
    allowUntyped: true,
  },
  updateInterval: 60,
  dataPath: 'status-data',
  title: 'System Status',
  description: 'Current status of our systems and services',
  showResponseTimes: true,
  showUptime: true,
  showServices: true,
  showIncidents: true,
  showPerformanceMetrics: true,
  defaultSLO: 99.9,
  systemSLOs: {},
  sites: [],
};

// Entity link validation schema
const entityLinkSchema = Joi.object({
  url: Joi.string().required(),
  label: Joi.string().required(),
  icon: Joi.string(),
});

// Monitoring configuration validation schema
const monitoringConfigSchema = Joi.object({
  enabled: Joi.boolean().required(),
  url: Joi.string(),
  method: Joi.string().valid('GET', 'POST', 'HEAD'),
  timeout: Joi.number().positive(),
  expectedCodes: Joi.array().items(Joi.number().integer().min(100).max(599)),
  maxResponseTime: Joi.number().positive(),
  headers: Joi.object().pattern(Joi.string(), Joi.string()),
  body: Joi.string(),
});

// Status rule validation schema
const statusRuleSchema = Joi.object({
  condition: Joi.string().required(),
  status: Joi.string().valid('up', 'down', 'degraded', 'maintenance').required(),
  priority: Joi.number().integer().required(),
  message: Joi.string(),
});

// Status logic validation schema
const statusLogicSchema = Joi.object({
  source: Joi.string().valid('monitoring', 'issues', 'composite').required(),
  rules: Joi.array().items(statusRuleSchema),
});

// Entity validation schema
const entitySchema = Joi.object({
  name: Joi.string().pattern(/^[a-z0-9-]+$/).required(),
  displayName: Joi.string(),
  type: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').required(),
  description: Joi.string(),
  icon: Joi.string(),
  tags: Joi.array().items(Joi.string()),
  links: Joi.array().items(entityLinkSchema),
  monitoring: monitoringConfigSchema,
  statusLogic: statusLogicSchema,
  config: Joi.object().pattern(Joi.string(), Joi.any()),
});

// Label scheme validation schema
const labelSchemeSchema = Joi.object({
  separator: Joi.string().default(':'),
  defaultType: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').default('system'),
  allowUntyped: Joi.boolean().default(true),
});

// Site configuration validation schema
const siteConfigSchema = Joi.object<SiteConfig>({
  name: Joi.string().required(),
  url: Joi.string().required(),
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS').default('GET'),
  check: Joi.string().valid('http', 'tcp-ping', 'ws', 'ssl').default('http'),
  port: Joi.number().port(),
  ipv6: Joi.boolean(),
  headers: Joi.array().items(Joi.string()),
  body: Joi.string(),
  expectedStatusCodes: Joi.array().items(Joi.number().integer().min(100).max(599)),
  maxResponseTime: Joi.number().positive(),
  __dangerous__insecure: Joi.boolean(),
  __dangerous__disable_verify_peer: Joi.boolean(),
  __dangerous__disable_verify_host: Joi.boolean(),
  __dangerous__body_down: Joi.string(),
  __dangerous__body_degraded: Joi.string(),
  __dangerous__body_down_if_text_missing: Joi.string(),
  __dangerous__body_degraded_if_text_missing: Joi.string(),
  icon: Joi.string(),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/),
  assignees: Joi.array().items(Joi.string()),
});

/**
 * ADR-001: DataSource Validation Schemas
 *
 * Discriminated union validation for configurable data fetching strategies.
 * The schema handles:
 * - String shorthand (URL) -> converts to HTTP strategy
 * - Object with strategy field -> validates per-strategy requirements
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

// GitHub strategy schema
const githubDataSourceSchema = Joi.object({
  strategy: Joi.string().valid('github').required(),
  owner: Joi.string().required().messages({
    'any.required': '"owner" is required for github strategy',
    'string.empty': '"owner" is required for github strategy',
  }),
  repo: Joi.string().required().messages({
    'any.required': '"repo" is required for github strategy',
    'string.empty': '"repo" is required for github strategy',
  }),
  branch: Joi.string().default('status-data'),
  path: Joi.string().default('current.json'),
});

// HTTP strategy schema
const httpDataSourceSchema = Joi.object({
  strategy: Joi.string().valid('http').required(),
  url: Joi.string().required().messages({
    'any.required': '"url" is required for http strategy',
    'string.empty': '"url" is required for http strategy',
  }),
  headers: Joi.object().pattern(Joi.string(), Joi.string()),
  cacheBust: Joi.boolean().default(false),
});

// Static strategy schema
const staticDataSourceSchema = Joi.object({
  strategy: Joi.string().valid('static').required(),
  path: Joi.string().required().messages({
    'any.required': '"path" is required for static strategy',
    'string.empty': '"path" is required for static strategy',
  }),
});

// Build-only strategy schema
const buildOnlyDataSourceSchema = Joi.object({
  strategy: Joi.string().valid('build-only').required(),
}).unknown(false); // Strip extra fields

/**
 * DataSource schema - handles both string shorthand and object configuration
 *
 * Usage:
 * - String: 'https://example.com/status.json' -> { strategy: 'http', url: '...' }
 * - Object: { strategy: 'github', owner: '...', repo: '...' }
 */
export const dataSourceSchema = Joi.alternatives()
  .try(
    // String shorthand -> convert to HTTP strategy
    Joi.string().custom((value, helpers) => {
      return {
        strategy: 'http',
        url: value,
        cacheBust: false,
      };
    }, 'string to http strategy'),

    // Object with strategy discriminator
    Joi.object({
      strategy: Joi.string().valid('github', 'http', 'static', 'build-only').required(),
    }).unknown(true) // Allow other fields, validated below
      .custom((value, helpers) => {
        // Validate based on strategy
        let result;
        switch (value.strategy) {
          case 'github':
            result = githubDataSourceSchema.validate(value);
            break;
          case 'http':
            result = httpDataSourceSchema.validate(value);
            break;
          case 'static':
            result = staticDataSourceSchema.validate(value);
            break;
          case 'build-only':
            result = buildOnlyDataSourceSchema.validate(value);
            break;
          default:
            return helpers.error('any.invalid', { message: `Unknown strategy: ${value.strategy}` });
        }

        if (result.error) {
          throw result.error;
        }
        return result.value;
      }, 'strategy validation')
  )
  .messages({
    'alternatives.match': '"dataSource" must be a URL string or an object with a valid strategy',
  });

/**
 * Validate and resolve dataSource from plugin options.
 * Handles:
 * - New dataSource config (preferred)
 * - Legacy fetchUrl (deprecated, emits warning)
 * - Default to build-only when neither present
 *
 * @param options - Plugin options containing dataSource and/or fetchUrl
 * @returns Resolved DataSource configuration
 */
export function validateDataSource(options: {
  dataSource?: DataSource | string;
  fetchUrl?: string;
}): DataSource {
  // dataSource takes precedence
  if (options.dataSource !== undefined) {
    // If fetchUrl is also present, warn that it's ignored
    if (options.fetchUrl !== undefined) {
      console.warn(
        '[Stentorosaur] Both dataSource and fetchUrl provided. ' +
        'dataSource takes precedence, fetchUrl will be ignored.'
      );
    }

    // Validate and convert dataSource
    const result = dataSourceSchema.validate(options.dataSource);
    if (result.error) {
      throw result.error;
    }
    return result.value as DataSource;
  }

  // Legacy fetchUrl support (deprecated)
  if (options.fetchUrl !== undefined) {
    console.warn(
      '[Stentorosaur] fetchUrl is deprecated. Use dataSource instead. ' +
      'fetchUrl will be removed in v1.0.'
    );

    // Convert fetchUrl to HTTP strategy
    return {
      strategy: 'http',
      url: options.fetchUrl,
      cacheBust: false,
    };
  }

  // Default: build-only
  return { strategy: 'build-only' };
}

const pluginOptionsSchema = Joi.object<PluginOptions>({
  owner: Joi.string(),
  repo: Joi.string(),
  statusLabel: Joi.string().default(DEFAULT_OPTIONS.statusLabel),
  entities: Joi.array().items(entitySchema).default(DEFAULT_OPTIONS.entities),
  entitiesSource: Joi.string().valid('config', 'monitorrc', 'hybrid').default('config'),
  labelScheme: labelSchemeSchema.default(DEFAULT_OPTIONS.labelScheme),
  token: Joi.string(),
  updateInterval: Joi.number().min(1).default(DEFAULT_OPTIONS.updateInterval),
  dataPath: Joi.string().default(DEFAULT_OPTIONS.dataPath),
  title: Joi.string().default(DEFAULT_OPTIONS.title),
  description: Joi.string().default(DEFAULT_OPTIONS.description),
  showResponseTimes: Joi.boolean().default(DEFAULT_OPTIONS.showResponseTimes),
  showUptime: Joi.boolean().default(DEFAULT_OPTIONS.showUptime),
  useDemoData: Joi.boolean(),
  showServices: Joi.boolean().default(DEFAULT_OPTIONS.showServices),
  showIncidents: Joi.boolean().default(DEFAULT_OPTIONS.showIncidents),
  showPerformanceMetrics: Joi.boolean().default(DEFAULT_OPTIONS.showPerformanceMetrics),
  defaultSLO: Joi.number().min(0).max(100).default(DEFAULT_OPTIONS.defaultSLO),
  systemSLOs: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(100)).default(DEFAULT_OPTIONS.systemSLOs),
  statusView: Joi.string().valid('default', 'upptime').default('default'),
  statusCardLayout: Joi.string().valid('minimal', 'detailed').default('minimal'),
  uptimeConfig: Joi.object({
    sections: Joi.array().items(
      Joi.object({
        id: Joi.string().valid('active-incidents', 'live-status', 'charts', 'scheduled-maintenance', 'past-maintenance', 'past-incidents').required(),
        enabled: Joi.boolean().required(),
      })
    ),
    sectionTitles: Joi.object().pattern(Joi.string(), Joi.string()),
  }),
  scheduledMaintenance: Joi.object({
    enabled: Joi.boolean(),
    displayDuration: Joi.number().min(1),
    label: Joi.string(), // Deprecated: use labels instead
    labels: Joi.array().items(Joi.string()),
    showComments: Joi.boolean(),
    showAffectedSystems: Joi.boolean(),
    timezone: Joi.string(),
  }),
  sites: Joi.array().items(siteConfigSchema).default(DEFAULT_OPTIONS.sites),
  fetchUrl: Joi.string().uri({ allowRelative: true }),
  dataSource: dataSourceSchema,
});

export function validateOptions({
  validate,
  options,
}: OptionValidationContext<PluginOptions, PluginOptions>): PluginOptions {
  return validate(pluginOptionsSchema, options);
}
