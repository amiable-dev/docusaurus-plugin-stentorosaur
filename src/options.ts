/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Joi} from '@docusaurus/utils-validation';
import type {OptionValidationContext} from '@docusaurus/types';
import type {PluginOptions, SiteConfig} from './types';

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
  statusLabel: 'status',
  entities: [],
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

const pluginOptionsSchema = Joi.object<PluginOptions>({
  owner: Joi.string(),
  repo: Joi.string(),
  statusLabel: Joi.string().default(DEFAULT_OPTIONS.statusLabel),
  entities: Joi.array().items(entitySchema).default(DEFAULT_OPTIONS.entities),
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
});

export function validateOptions({
  validate,
  options,
}: OptionValidationContext<PluginOptions, PluginOptions>): PluginOptions {
  return validate(pluginOptionsSchema, options);
}
