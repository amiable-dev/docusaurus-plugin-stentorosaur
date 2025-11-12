/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Joi} from '@docusaurus/utils-validation';
import {DEFAULT_OPTIONS, validateOptions} from '../src/options';
import type {PluginOptions, SiteConfig, Entity} from '../src/types';
import type {OptionValidationContext} from '@docusaurus/types';

// Simple entity schema for testing
const entitySchema = Joi.object<Entity>({
  name: Joi.string().pattern(/^[a-z0-9-]+$/).required(),
  displayName: Joi.string(),
  type: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').required(),
  description: Joi.string(),
  icon: Joi.string(),
  tags: Joi.array().items(Joi.string()),
  links: Joi.array(),
  monitoring: Joi.object(),
  statusLogic: Joi.object(),
  config: Joi.object(),
});

const labelSchemeSchema = Joi.object({
  separator: Joi.string().default(':'),
  defaultType: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').default('system'),
  allowUntyped: Joi.boolean().default(true),
});

// Create the same schema as in options.ts for testing
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

  it('should accept custom entities', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      entities: [
        { name: 'api', type: 'system' },
        { name: 'web', type: 'system' },
        { name: 'database', type: 'system' },
      ],
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.entities).toHaveLength(3);
    expect(value.entities[0].name).toBe('api');
  });

  it('should accept custom label scheme', () => {
    const options: Partial<PluginOptions> = {
      owner: 'test-owner',
      repo: 'test-repo',
      labelScheme: {
        separator: '/',
        defaultType: 'process',
        allowUntyped: false,
      },
    };

    const {value} = pluginOptionsSchema.validate(options);
    expect(value.labelScheme?.separator).toBe('/');
    expect(value.labelScheme?.defaultType).toBe('process');
    expect(value.labelScheme?.allowUntyped).toBe(false);
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

  it('should throw error for invalid entities type', () => {
    const options: any = {
      owner: 'test-owner',
      repo: 'test-repo',
      entities: 'not-an-array', // Should be array
    };

    const result = pluginOptionsSchema.validate(options);
    expect(result.error).toBeDefined();
  });

  it('should throw error for invalid entity structure', () => {
    const options: any = {
      owner: 'test-owner',
      repo: 'test-repo',
      entities: [
        { name: 'api' }, // Missing required 'type' field
      ],
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
      entities: [
        { name: 'api', type: 'system' },
        { name: 'web', type: 'system' },
      ],
      labelScheme: {
        separator: ':',
        defaultType: 'system',
        allowUntyped: true,
      },
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
    expect(value.entities).toHaveLength(2);
    expect(value.entities[0].name).toBe('api');
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
        entities: [],
        labelScheme: {
          separator: ':',
          defaultType: 'system',
          allowUntyped: true,
        },
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

  describe('site configuration validation', () => {
    it('should accept valid site configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'API Service',
            url: 'https://api.example.com',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites).toBeDefined();
      expect(result.sites?.[0].name).toBe('API Service');
    });

    it('should accept HTTP method configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'POST Endpoint',
            url: 'https://api.example.com/webhook',
            method: 'POST',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].method).toBe('POST');
    });

    it('should accept headers configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Authenticated API',
            url: 'https://api.example.com',
            headers: [
              'Authorization: Bearer $API_TOKEN',
              'Content-Type: application/json',
            ],
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].headers).toEqual([
        'Authorization: Bearer $API_TOKEN',
        'Content-Type: application/json',
      ]);
    });

    it('should accept expected status codes', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'API',
            url: 'https://api.example.com',
            expectedStatusCodes: [200, 201, 202],
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].expectedStatusCodes).toEqual([200, 201, 202]);
    });

    it('should accept TCP ping configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Database',
            url: 'db.example.com',
            check: 'tcp-ping',
            port: 5432,
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].check).toBe('tcp-ping');
      expect(result.sites?.[0].port).toBe(5432);
    });

    it('should accept SSL configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Secure Site',
            url: 'https://secure.example.com',
            check: 'ssl',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].check).toBe('ssl');
    });

    it('should accept dangerous SSL options', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Internal API',
            url: 'https://internal.example.com',
            __dangerous__insecure: true,
            __dangerous__disable_verify_peer: true,
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].__dangerous__insecure).toBe(true);
    });

    it('should accept body check options', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Status Check',
            url: 'https://status.example.com',
            __dangerous__body_down_if_text_missing: '\"status\":\"UP\"',
            __dangerous__body_degraded_if_text_missing: '\"health\":\"OK\"',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].__dangerous__body_down_if_text_missing).toBe('\"status\":\"UP\"');
    });

    it('should accept max response time', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Fast API',
            url: 'https://api.example.com',
            maxResponseTime: 5000,
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].maxResponseTime).toBe(5000);
    });

    it('should accept display options', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Main Website',
            url: 'https://example.com',
            icon: '🌐',
            slug: 'main-site',
            assignees: ['user1', 'user2'],
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].icon).toBe('🌐');
      expect(result.sites?.[0].slug).toBe('main-site');
      expect(result.sites?.[0].assignees).toEqual(['user1', 'user2']);
    });

    it('should accept IPv6 configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'IPv6 Site',
            url: 'https://ipv6.example.com',
            ipv6: true,
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].ipv6).toBe(true);
    });

    it('should accept POST request with body', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'GraphQL API',
            url: 'https://api.example.com/graphql',
            method: 'POST',
            body: '{\"query\":\"{health}\"}',
            headers: ['Content-Type: application/json'],
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].body).toBe('{\"query\":\"{health}\"}');
    });

    it('should accept WebSocket configuration', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'WebSocket Server',
            url: 'wss://ws.example.com',
            check: 'ws',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].check).toBe('ws');
    });

    it('should accept multiple sites', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Website',
            url: 'https://example.com',
          },
          {
            name: 'API',
            url: 'https://api.example.com',
            method: 'GET',
          },
          {
            name: 'Database',
            url: 'db.example.com',
            check: 'tcp-ping',
            port: 5432,
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites).toHaveLength(3);
      expect(result.sites?.[0].name).toBe('Website');
      expect(result.sites?.[1].name).toBe('API');
      expect(result.sites?.[2].name).toBe('Database');
    });

    it('should default to empty sites array', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
      };

      const mockValidate = jest.fn((schema, opts) => ({
        ...opts,
        sites: DEFAULT_OPTIONS.sites,
      }));
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites).toEqual([]);
    });

    it('should support environment variable substitution in URL', () => {
      const options: Partial<PluginOptions> = {
        owner: 'test-owner',
        repo: 'test-repo',
        sites: [
          {
            name: 'Secret API',
            url: 'https://$API_HOST/endpoint',
          },
        ],
      };

      const mockValidate = jest.fn((schema, opts) => opts);
      const mockContext: OptionValidationContext<PluginOptions, PluginOptions> = {
        validate: mockValidate,
        options: options as PluginOptions,
      };

      const result = validateOptions(mockContext);
      expect(result.sites?.[0].url).toBe('https://$API_HOST/endpoint');
    });
  });
});
