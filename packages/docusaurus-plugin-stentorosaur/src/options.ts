/**
 * Plugin option validation — v1.0 (ADR-005 §11). The monitoring config
 * lives in stentorosaur.config.js (consumed by the probe CLI); the
 * plugin options are display concerns plus the data endpoint.
 */

import {Joi} from '@docusaurus/utils-validation';
import type {OptionValidationContext} from '@docusaurus/types';
import type {PluginOptions} from './types';

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
  dataPath: 'status-data',
  title: 'System Status',
  description: 'Current status of our systems and services',
  showServices: true,
  showIncidents: true,
  showPerformanceMetrics: true,
  defaultSLO: 99.9,
  systemSLOs: {},
  entities: [],
  statusView: 'default',
  statusCardLayout: 'minimal',
};

const entityDisplaySchema = Joi.object({
  name: Joi.string().required(),
  displayName: Joi.string(),
  description: Joi.string(),
});

const uptimeSectionSchema = Joi.object({
  id: Joi.string()
    .valid(
      'active-incidents',
      'live-status',
      'charts',
      'scheduled-maintenance',
      'past-maintenance',
      'past-incidents'
    )
    .required(),
  enabled: Joi.boolean().required(),
});

export const pluginOptionsSchema = Joi.object<PluginOptions>({
  owner: Joi.string(),
  repo: Joi.string(),
  // Absolute http(s) endpoint (fetched at build time + by the client),
  // or a site-relative path to the self-served snapshot (client-only).
  dataUrl: Joi.alternatives().try(
    Joi.string().uri({scheme: ['http', 'https']}),
    Joi.string().pattern(/^\//)
  ),
  dataPath: Joi.string().default(DEFAULT_OPTIONS.dataPath),
  title: Joi.string().default(DEFAULT_OPTIONS.title),
  description: Joi.string().default(DEFAULT_OPTIONS.description),
  entities: Joi.array().items(entityDisplaySchema).default([]),
  showServices: Joi.boolean().default(true),
  showIncidents: Joi.boolean().default(true),
  showPerformanceMetrics: Joi.boolean().default(true),
  systemSLOs: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(100)).default({}),
  defaultSLO: Joi.number().min(0).max(100).default(99.9),
  statusView: Joi.string().valid('default', 'upptime').default('default'),
  statusCardLayout: Joi.string().valid('minimal', 'detailed').default('minimal'),
  uptimeConfig: Joi.object({
    sections: Joi.array().items(uptimeSectionSchema).required(),
    sectionTitles: Joi.object().pattern(Joi.string(), Joi.string()),
  }),
});

export function validateOptions({
  validate,
  options,
}: OptionValidationContext<PluginOptions, PluginOptions>): PluginOptions {
  return validate(pluginOptionsSchema, options);
}
