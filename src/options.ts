/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Joi} from '@docusaurus/utils-validation';
import type {OptionValidationContext} from '@docusaurus/types';
import type {PluginOptions} from './types';

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
  statusLabel: 'status',
  systemLabels: [],
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
};

const pluginOptionsSchema = Joi.object<PluginOptions>({
  owner: Joi.string(),
  repo: Joi.string(),
  statusLabel: Joi.string().default(DEFAULT_OPTIONS.statusLabel),
  systemLabels: Joi.array().items(Joi.string()).default(DEFAULT_OPTIONS.systemLabels),
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
    labels: Joi.array().items(Joi.string()),
    showComments: Joi.boolean(),
    showAffectedSystems: Joi.boolean(),
    timezone: Joi.string(),
  }),
});

export function validateOptions({
  validate,
  options,
}: OptionValidationContext<PluginOptions, PluginOptions>): PluginOptions {
  return validate(pluginOptionsSchema, options);
}
