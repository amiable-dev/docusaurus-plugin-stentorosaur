/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Joi} from '@docusaurus/utils-validation';
import {DEFAULT_OPTIONS, validateOptions} from '../src/options';
import type {PluginOptions} from '../src/types';
import type {OptionValidationContext} from '@docusaurus/types';

// Create the same schema as in options.ts for testing
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
});

describe('plugin options validation', () => {
  it('should validate minimal valid options', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeUndefined();
  });

  it('should use default values for missing options', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    const {value} = pluginOptionsSchema.validate(options);

    expect(value.statusLabel).toBe(DEFAULT_OPTIONS.statusLabel);
    expect(value.updateInterval).toBe(DEFAULT_OPTIONS.updateInterval);
    expect(value.dataPath).toBe(DEFAULT_OPTIONS.dataPath);
    expect(value.showServices).toBe(DEFAULT_OPTIONS.showServices);
    expect(value.showIncidents).toBe(DEFAULT_OPTIONS.showIncidents);
  });

  it('should accept custom system labels', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      systemLabels: ['api', 'web', 'database'],
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.systemLabels).toEqual(['api', 'web', 'database']);
  });

  it('should accept valid GitHub token', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      token: 'ghp_test123456789',
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid update interval', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      updateInterval: 30,
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.updateInterval).toBe(30);
  });

  it('should accept custom title and description', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      title: 'Custom Status',
      description: 'Custom description',
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.title).toBe('Custom Status');
    expect(value.description).toBe('Custom description');
  });

  it('should accept showResponseTimes and showUptime options', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      showResponseTimes: true,
      showUptime: true,
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.showResponseTimes).toBe(true);
    expect(value.showUptime).toBe(true);
  });

  it('should accept useDemoData option', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      useDemoData: true,
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.useDemoData).toBe(true);
  });

  it('should accept showServices and showIncidents options', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      showServices: false,
      showIncidents: true,
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.showServices).toBe(false);
    expect(value.showIncidents).toBe(true);
  });

  it('should throw error for invalid owner type', () => {
    const options: any = {
      owner: 123, // Should be string
      repo: 'test-repo',
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeDefined();
  });

  it('should throw error for invalid repo type', () => {
    const options: any = {
      owner: 'test-owner',
      repo: 456, // Should be string
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeDefined();
  });

  it('should throw error for invalid systemLabels type', () => {
    const options: any = {
      owner: 'test-owner',
      repo: 'test-repo',
      systemLabels: 'not-an-array', // Should be array
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeDefined();
  });

  it('should throw error for invalid updateInterval', () => {
    const options: any = {
      owner: 'test-owner',
      repo: 'test-repo',
      updateInterval: -1, // Should be positive
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeDefined();
  });

  it('should handle all options together', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      statusLabel: 'custom-status',
      systemLabels: ['api', 'web'],
      token: 'ghp_test',
      updateInterval: 45,
      dataPath: 'custom-data',
      title: 'My Status',
      description: 'My description',
      showResponseTimes: true,
      showUptime: true,
      useDemoData: false,
      showServices: true,
      showIncidents: true,
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.owner).toBe('test-owner');
    expect(value.repo).toBe('test-repo');
    expect(value.statusLabel).toBe('custom-status');
    expect(value.systemLabels).toEqual(['api', 'web']);
    expect(value.updateInterval).toBe(45);
    expect(value.title).toBe('My Status');
  });

  describe('validateOptions function', () => {
    it('should validate options using the exported function', () => {
      const mockValidate = jest.fn((schema, options) => options);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: {
          owner: 'test-owner',
          repo: 'test-repo',
        } as PluginOptions,
      };

      const result = validateOptions(mockContext);

      expect(mockValidate).toHaveBeenCalled();
      expect(result).toEqual(mockContext.options);
    });

    it('should pass the schema to validate function', () => {
      const mockValidate = jest.fn((schema, options) => ({
        ...options,
        statusLabel: 'status',
        systemLabels: [],
      }));
      
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: {
          owner: 'test-owner',
          repo: 'test-repo',
        } as PluginOptions,
      };

      validateOptions(mockContext);

      expect(mockValidate).toHaveBeenCalledWith(
        expect.any(Object),
        mockContext.options
      );
    });
  });
});
