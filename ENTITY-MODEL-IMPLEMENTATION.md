# Entity Model Implementation Guide

**Date**: 2025-11-12
**Version**: Draft v2.0 - Simplified (No Backward Compatibility)
**Related**: NON-SYSTEM-STATUS-PROPOSAL.md
**Status**: Technical Implementation Plan

## Overview

This document provides the technical implementation details for introducing the Entity model to replace the system-centric architecture.

**IMPORTANT**: Since there are no external users (only the internal test site amiable-docusaurus), this implementation **skips backward compatibility** and goes directly to the Entity model. This simplifies the codebase significantly.

---

## Migration Status

### Current Users
- **External users**: 0
- **Internal test site**: amiable-docusaurus (1 site)

### Migration Required
- **Data files**: NONE (current.json, incidents.json are system-agnostic)
- **GitHub workflows**: NONE (already use service names)
- **Configuration**: ONE file update (docusaurus.config.ts in amiable-docusaurus)
- **Estimated effort**: 15 minutes

### Why Skip Backward Compatibility

✅ **No external users** - Only test site to update
✅ **Data format unchanged** - Status data uses service names, not systemLabels
✅ **Simpler codebase** - No EntityAdapter complexity
✅ **Faster development** - Skip entire Phase 1
✅ **Cleaner architecture** - Entity model from day one
✅ **Better maintainability** - Single code path

---

## Implementation Plan (Simplified)

## Phase 1: Direct Entity Model (v0.11.0)

**Goal**: Replace systemLabels with entities configuration directly.

### 1.1 Core Type Definitions

Add to `src/types.ts`:

```typescript
/**
 * Entity type enumeration
 * Replaces the implicit "system" concept with explicit types
 */
export type EntityType =
  | 'system'      // Technical infrastructure
  | 'process'     // Business process
  | 'project'     // Time-bound initiative
  | 'event'       // Scheduled event/campaign
  | 'sla'         // Service level agreement
  | 'custom';     // User-defined

/**
 * Entity configuration - flexible abstraction for trackable items
 */
export interface Entity {
  /** Unique identifier (kebab-case: 'api', 'customer-onboarding') */
  name: string;

  /** Human-readable display name (defaults to name if not provided) */
  displayName?: string;

  /** Entity type determines status calculation logic */
  type: EntityType;

  /** Description shown on status page */
  description?: string;

  /** Icon (emoji or icon name) for display */
  icon?: string;

  /** Tags for categorization and filtering */
  tags?: string[];

  /** External links (documentation, dashboards, etc.) */
  links?: EntityLink[];

  /** Monitoring configuration (optional, only for monitored entities) */
  monitoring?: MonitoringConfig;

  /** Status determination logic */
  statusLogic?: StatusLogic;

  /** Entity-specific configuration data */
  config?: Record<string, unknown>;
}

/**
 * Entity link - documentation, dashboards, etc.
 */
export interface EntityLink {
  url: string;
  label: string;
  icon?: string;
}

/**
 * Monitoring configuration for entities that have uptime checks
 */
export interface MonitoringConfig {
  enabled: boolean;
  url?: string;
  method?: 'GET' | 'POST' | 'HEAD';
  timeout?: number;
  expectedCodes?: number[];
  maxResponseTime?: number;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Status determination logic
 */
export interface StatusLogic {
  /** Source of status information */
  source: 'monitoring' | 'issues' | 'composite';

  /** Rules for determining status from issues */
  rules?: StatusRule[];
}

/**
 * Status rule for issue-based status determination
 */
export interface StatusRule {
  /** Condition to match (e.g., "label:blocker", "severity:critical") */
  condition: string;

  /** Status to set when condition matches */
  status: StatusItemStatus;

  /** Priority (higher priority wins when multiple rules match) */
  priority: number;

  /** Optional message template */
  message?: string;
}

/**
 * Label parsing configuration
 */
export interface LabelScheme {
  /** Separator between type and name (default: ':') */
  separator: string;

  /** Default entity type for unlabeled items (default: 'system') */
  defaultType: EntityType;

  /** Allow labels without type prefix (default: true) */
  allowUntyped: boolean;
}
```

### 1.2 Update PluginOptions

Modify `src/types.ts` PluginOptions interface:

```typescript
export interface PluginOptions {
  // ... existing options ...

  /**
   * Entity definitions (REQUIRED as of v0.11.0)
   * Replaces deprecated systemLabels
   */
  entities: Entity[];

  /**
   * Label parsing scheme for GitHub issue labels
   */
  labelScheme?: LabelScheme;

  // REMOVED: systemLabels (no longer supported)

  // ... rest of existing options ...
}
```

### 1.3 Update Options Validation

Modify `src/options.ts`:

```typescript
import {Joi} from '@docusaurus/utils-validation';
import type {OptionValidationContext} from '@docusaurus/types';
import type {PluginOptions, Entity} from './types';

// Entity validation schema
const entitySchema = Joi.object<Entity>({
  name: Joi.string().required().pattern(/^[a-z0-9-]+$/),
  displayName: Joi.string(),
  type: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').required(),
  description: Joi.string(),
  icon: Joi.string(),
  tags: Joi.array().items(Joi.string()),
  links: Joi.array().items(Joi.object({
    url: Joi.string().uri().required(),
    label: Joi.string().required(),
    icon: Joi.string(),
  })),
  monitoring: Joi.object({
    enabled: Joi.boolean().required(),
    url: Joi.string().uri(),
    method: Joi.string().valid('GET', 'POST', 'HEAD'),
    timeout: Joi.number().positive(),
    expectedCodes: Joi.array().items(Joi.number().integer().min(100).max(599)),
    maxResponseTime: Joi.number().positive(),
    headers: Joi.object().pattern(Joi.string(), Joi.string()),
    body: Joi.string(),
  }),
  statusLogic: Joi.object({
    source: Joi.string().valid('monitoring', 'issues', 'composite').required(),
    rules: Joi.array().items(Joi.object({
      condition: Joi.string().required(),
      status: Joi.string().valid('up', 'down', 'degraded', 'maintenance').required(),
      priority: Joi.number().integer().min(0).required(),
      message: Joi.string(),
    })),
  }),
  config: Joi.object(),
});

const labelSchemeSchema = Joi.object({
  separator: Joi.string().default(':'),
  defaultType: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom').default('system'),
  allowUntyped: Joi.boolean().default(true),
});

export const DEFAULT_OPTIONS: Partial<PluginOptions> = {
  statusLabel: 'status',
  entities: [], // Required, but can be empty
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

const pluginOptionsSchema = Joi.object<PluginOptions>({
  // ... existing validations ...

  // Entity model (required)
  entities: Joi.array().items(entitySchema).required(),

  // Label parsing configuration
  labelScheme: labelSchemeSchema,

  // REMOVED: systemLabels validation

  // ... rest of existing validations ...
});
```

### 1.4 Label Parsing Utilities

Create `src/label-utils.ts`:

```typescript
/**
 * Label parsing utilities for entity identification
 */

import type { Entity, EntityType, LabelScheme } from './types';

export class LabelParser {
  private scheme: LabelScheme;

  constructor(scheme?: Partial<LabelScheme>) {
    this.scheme = {
      separator: scheme?.separator || ':',
      defaultType: scheme?.defaultType || 'system',
      allowUntyped: scheme?.allowUntyped ?? true,
    };
  }

  /**
   * Parse GitHub label to extract entity type and name
   * Examples:
   *   'api' → { type: 'system', name: 'api' }
   *   'system:api' → { type: 'system', name: 'api' }
   *   'process:onboarding' → { type: 'process', name: 'onboarding' }
   */
  parseLabel(label: string): { type: EntityType; name: string } | null {
    const { separator, defaultType, allowUntyped } = this.scheme;

    // Check if label contains separator
    if (label.includes(separator)) {
      const [typeStr, ...nameParts] = label.split(separator);
      const name = nameParts.join(separator); // Handle names with separators

      // Validate type
      const validTypes: EntityType[] = ['system', 'process', 'project', 'event', 'sla', 'custom'];
      if (validTypes.includes(typeStr as EntityType)) {
        return {
          type: typeStr as EntityType,
          name: name,
        };
      }
    }

    // Handle untyped labels
    if (allowUntyped) {
      return {
        type: defaultType,
        name: label,
      };
    }

    return null; // Invalid label
  }

  /**
   * Extract entities from GitHub issue labels
   * Returns array of entity identifiers affected by the issue
   */
  extractEntitiesFromLabels(
    labels: string[],
    knownEntities: Entity[]
  ): Array<{ type: EntityType; name: string }> {
    const entities: Array<{ type: EntityType; name: string }> = [];
    const entityNames = new Set(knownEntities.map(e => e.name));

    for (const label of labels) {
      const parsed = this.parseLabel(label);

      if (parsed && entityNames.has(parsed.name)) {
        entities.push(parsed);
      }
    }

    return entities;
  }
}
```

### 1.5 Update GitHub Service

Modify `src/github-service.ts`:

```typescript
import { LabelParser } from './label-utils';
import type { Entity, StatusItem, StatusIncident } from './types';

export class GitHubStatusService {
  private entities: Entity[];
  private labelParser: LabelParser;

  constructor(options: PluginOptions) {
    // ... existing constructor code ...

    this.entities = options.entities;
    this.labelParser = new LabelParser(options.labelScheme);
  }

  /**
   * Generate status items from entities and incidents
   */
  async generateStatusItems(incidents: StatusIncident[]): Promise<StatusItem[]> {
    const statusMap = new Map<string, {
      status: StatusItemStatus;
      incidentCount: number;
    }>();

    // Initialize all entities as 'up'
    for (const entity of this.entities) {
      statusMap.set(entity.name, {
        status: 'up',
        incidentCount: 0,
      });
    }

    // Process open incidents
    for (const incident of incidents) {
      if (incident.status === 'open') {
        // Extract affected entities from labels
        const affectedEntities = this.labelParser.extractEntitiesFromLabels(
          incident.labels,
          this.entities
        );

        for (const { name } of affectedEntities) {
          const current = statusMap.get(name);
          if (current) {
            current.incidentCount++;

            // Determine status based on severity
            const newStatus = this.determineStatusFromSeverity(incident.severity);

            // Worst status wins
            if (this.statusPriority(newStatus) > this.statusPriority(current.status)) {
              current.status = newStatus;
            }
          }
        }
      }
    }

    // Convert entities to StatusItems
    return this.entities.map(entity => {
      const runtimeData = statusMap.get(entity.name) || { status: 'up', incidentCount: 0 };

      return {
        name: entity.displayName || entity.name,
        description: entity.description,
        status: runtimeData.status,
        incidentCount: runtimeData.incidentCount,
        // Additional fields populated from monitoring data if available
      };
    });
  }

  /**
   * Convert issue to incident
   */
  private convertIssueToIncident(issue: any): StatusIncident {
    const labels = issue.labels.map((l: any) => l.name);

    // Extract affected entity names
    const affectedEntities = this.labelParser.extractEntitiesFromLabels(
      labels,
      this.entities
    );

    return {
      // ... existing incident fields ...
      affectedSystems: affectedEntities.map(e => e.name),
      labels,
    };
  }

  // ... rest of existing methods ...
}
```

### 1.6 Testing Strategy

Create `__tests__/label-utils.test.ts`:

```typescript
import { LabelParser } from '../src/label-utils';
import type { Entity } from '../src/types';

describe('LabelParser', () => {
  describe('parseLabel', () => {
    const parser = new LabelParser();

    it('parses typed labels', () => {
      const result = parser.parseLabel('system:api');
      expect(result).toEqual({ type: 'system', name: 'api' });
    });

    it('parses process labels', () => {
      const result = parser.parseLabel('process:customer-onboarding');
      expect(result).toEqual({ type: 'process', name: 'customer-onboarding' });
    });

    it('handles untyped labels with default', () => {
      const result = parser.parseLabel('api');
      expect(result).toEqual({ type: 'system', name: 'api' });
    });

    it('handles custom separator', () => {
      const parser = new LabelParser({ separator: '/' });
      const result = parser.parseLabel('process/onboarding');
      expect(result).toEqual({ type: 'process', name: 'onboarding' });
    });

    it('rejects invalid types when untyped not allowed', () => {
      const parser = new LabelParser({ allowUntyped: false });
      const result = parser.parseLabel('api');
      expect(result).toBeNull();
    });

    it('handles names with separators', () => {
      const result = parser.parseLabel('project:migration:v2:to:aurora');
      expect(result).toEqual({ type: 'project', name: 'migration:v2:to:aurora' });
    });
  });

  describe('extractEntitiesFromLabels', () => {
    const parser = new LabelParser();
    const knownEntities: Entity[] = [
      { name: 'api', type: 'system' },
      { name: 'customer-onboarding', type: 'process' },
      { name: 'migration', type: 'project' },
    ];

    it('extracts multiple entity types', () => {
      const labels = [
        'system:api',
        'process:customer-onboarding',
        'severity:critical',
        'status',
      ];

      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(2);
      expect(extracted).toContainEqual({ type: 'system', name: 'api' });
      expect(extracted).toContainEqual({ type: 'process', name: 'customer-onboarding' });
    });

    it('handles untyped labels', () => {
      const labels = ['api', 'status'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toEqual({ type: 'system', name: 'api' });
    });

    it('ignores unknown entities', () => {
      const labels = ['system:unknown', 'process:customer-onboarding'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(1);
      expect(extracted[0].name).toBe('customer-onboarding');
    });
  });
});
```

---

## Phase 2: Enhanced Features (v0.12.0)

**Goal**: Add entity type icons, grouping, and auto-discovery.

### 2.1 Auto-Discovery of Entities

Add entity auto-discovery from GitHub issues:

```typescript
/**
 * Discover entities from GitHub issue labels
 * Creates entities for any typed labels that don't have explicit configs
 */
export class EntityDiscovery {
  static discoverFromIssues(
    issues: StatusIncident[],
    explicitEntities: Entity[],
    labelParser: LabelParser
  ): Entity[] {
    const discovered = new Map<string, Entity>();
    const explicitNames = new Set(explicitEntities.map(e => e.name));

    for (const issue of issues) {
      for (const label of issue.labels) {
        const parsed = labelParser.parseLabel(label);

        if (parsed && !explicitNames.has(parsed.name) && !discovered.has(parsed.name)) {
          // Create minimal entity config
          discovered.set(parsed.name, {
            name: parsed.name,
            type: parsed.type,
            statusLogic: {
              source: parsed.type === 'system' ? 'composite' : 'issues',
            },
            monitoring: parsed.type === 'system' ? { enabled: false } : undefined,
          });
        }
      }
    }

    return Array.from(discovered.values());
  }
}
```

### 2.2 UI Updates - Entity Type Icons

Update `src/theme/StatusItem/index.tsx`:

```typescript
import type { EntityType } from '@site/src/types';

const ENTITY_TYPE_ICONS: Record<EntityType, string> = {
  system: '📊',
  process: '🔄',
  project: '🎯',
  event: '📅',
  sla: '📈',
  custom: '⚙️',
};

interface Props {
  item: StatusItem;
  entityType?: EntityType;
}

export default function StatusItem({ item, entityType = 'system' }: Props) {
  const icon = ENTITY_TYPE_ICONS[entityType] || ENTITY_TYPE_ICONS.custom;

  return (
    <div className={styles.statusItem}>
      <div className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <h3>{item.name}</h3>
      </div>
      {/* ... rest of component ... */}
    </div>
  );
}
```

### 2.3 Grouped Display

Update `src/theme/StatusBoard/index.tsx`:

```typescript
import type { EntityType, Entity, StatusItem } from '@site/src/types';

interface Props {
  items: StatusItem[];
  entities: Entity[];
}

export default function StatusBoard({ items, entities }: Props) {
  // Group items by entity type
  const grouped = new Map<EntityType, Array<{ item: StatusItem; entity: Entity }>>();

  items.forEach((item, index) => {
    const entity = entities[index];
    const type = entity.type;

    if (!grouped.has(type)) {
      grouped.set(type, []);
    }
    grouped.get(type)!.push({ item, entity });
  });

  const typeOrder: EntityType[] = ['system', 'process', 'project', 'event', 'sla', 'custom'];
  const typeLabels: Record<EntityType, string> = {
    system: '📊 Systems',
    process: '🔄 Processes',
    project: '🎯 Projects',
    event: '📅 Events',
    sla: '📈 SLA Tracking',
    custom: '⚙️ Custom',
  };

  return (
    <div className={styles.statusBoard}>
      {typeOrder.map(type => {
        const typeItems = grouped.get(type);
        if (!typeItems || typeItems.length === 0) return null;

        return (
          <section key={type} className={styles.entityTypeSection}>
            <h2>{typeLabels[type]}</h2>
            <div className={styles.itemGrid}>
              {typeItems.map(({ item, entity }, idx) => (
                <StatusItem key={idx} item={item} entityType={entity.type} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

---

## Phase 3: Custom Status Logic (v0.13.0)

**Goal**: Different status determination per entity type.

### 3.1 Status Rule Engine

Create `src/status-rules.ts`:

```typescript
import type { StatusIncident, StatusItemStatus, Entity } from './types';

export class StatusRuleEngine {
  /**
   * Evaluate status rules against incidents
   */
  static evaluateRules(
    entity: Entity,
    incidents: StatusIncident[]
  ): StatusItemStatus {
    if (!entity.statusLogic?.rules) {
      return 'up'; // Default
    }

    const applicableIncidents = incidents.filter(incident =>
      incident.affectedSystems.includes(entity.name) && incident.status === 'open'
    );

    if (applicableIncidents.length === 0) {
      return 'up';
    }

    // Sort rules by priority (descending)
    const sortedRules = [...entity.statusLogic.rules].sort((a, b) => b.priority - a.priority);

    // Find first matching rule
    for (const rule of sortedRules) {
      if (this.matchesCondition(rule.condition, applicableIncidents)) {
        return rule.status;
      }
    }

    return 'up'; // No rules matched
  }

  /**
   * Check if condition matches any incident
   */
  private static matchesCondition(condition: string, incidents: StatusIncident[]): boolean {
    // Parse condition
    // Format: "label:value" or "severity:value" or "open_issues > N"

    if (condition.startsWith('label:')) {
      const labelValue = condition.substring(6);
      return incidents.some(inc => inc.labels.includes(labelValue));
    }

    if (condition.startsWith('severity:')) {
      const severityValue = condition.substring(9) as StatusIncident['severity'];
      return incidents.some(inc => inc.severity === severityValue);
    }

    if (condition.includes('open_issues >')) {
      const threshold = parseInt(condition.split('>')[1].trim(), 10);
      return incidents.length > threshold;
    }

    return false;
  }
}
```

---

## Migration Guide for amiable-docusaurus

### One-Time Configuration Migration

**Before (v0.10.x):**

```typescript
// docusaurus.config.ts
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
      owner: 'amiable-dev',
      repo: 'status',
      systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api'],
      // ... other options
    }]
  ]
}
```

**After (v0.11.0+):**

```typescript
// docusaurus.config.ts
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
      owner: 'amiable-dev',
      repo: 'status',
      entities: [
        { name: 'website', type: 'system' },
        { name: 'documentation', type: 'system' },
        { name: 'build-system', type: 'system' },
        { name: 'ci-cd', type: 'system' },
        { name: 'api', type: 'system' },
      ],
      // ... other options
    }]
  ]
}
```

### Automated Migration Script

Create `scripts/migrate-config.js`:

```javascript
#!/usr/bin/env node

/**
 * One-time migration script for systemLabels → entities
 * Usage: node scripts/migrate-config.js <config-file-path>
 */

const fs = require('fs');
const path = require('path');

function migrateConfig(configPath) {
  console.log(`Reading config from: ${configPath}`);

  const content = fs.readFileSync(configPath, 'utf8');

  // Find systemLabels array
  const systemLabelsMatch = content.match(/systemLabels:\s*\[(.*?)\]/s);

  if (!systemLabelsMatch) {
    console.log('❌ No systemLabels found in config');
    return;
  }

  const labelsStr = systemLabelsMatch[1];
  const labels = labelsStr
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(s => s.length > 0);

  console.log(`Found ${labels.length} system labels:`, labels);

  // Generate entities config
  const entities = labels.map(label =>
    `        { name: '${label}', type: 'system' }`
  ).join(',\n');

  const entitiesConfig = `entities: [\n${entities},\n      ]`;

  // Replace systemLabels with entities
  const newContent = content.replace(
    /systemLabels:\s*\[.*?\]/s,
    entitiesConfig
  );

  // Write backup
  const backupPath = configPath + '.backup';
  fs.writeFileSync(backupPath, content, 'utf8');
  console.log(`✓ Backup saved to: ${backupPath}`);

  // Write updated config
  fs.writeFileSync(configPath, newContent, 'utf8');
  console.log(`✓ Config updated: ${configPath}`);

  console.log('\nMigration complete! Next steps:');
  console.log('1. Review the updated config file');
  console.log('2. Add displayName, description, or other Entity fields as desired');
  console.log('3. Run your build to verify everything works');
  console.log('4. Delete the .backup file once confirmed');
}

// Run migration
const configPath = process.argv[2];

if (!configPath) {
  console.error('Usage: node scripts/migrate-config.js <config-file-path>');
  console.error('Example: node scripts/migrate-config.js ../amiable-docusaurus/docusaurus.config.ts');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error(`❌ File not found: ${configPath}`);
  process.exit(1);
}

migrateConfig(configPath);
```

**Usage:**

```bash
cd docusaurus-plugin-stentorosaur
node scripts/migrate-config.js ../test-status-site/docusaurus.config.ts

# Or for amiable-docusaurus
node scripts/migrate-config.js /path/to/amiable-docusaurus/docusaurus.config.ts
```

---

## Configuration Examples

### Example 1: Basic System Entities

```typescript
{
  entities: [
    { name: 'api', type: 'system' },
    { name: 'database', type: 'system' },
    { name: 'cdn', type: 'system' },
  ]
}
```

### Example 2: Enhanced with Display Names

```typescript
{
  entities: [
    {
      name: 'api',
      type: 'system',
      displayName: 'API Service',
      description: 'Main REST API for customer applications',
      icon: '🔌',
    },
    {
      name: 'database',
      type: 'system',
      displayName: 'Database Cluster',
      description: 'PostgreSQL primary and replicas',
      icon: '💾',
    },
  ]
}
```

### Example 3: Mixed Entity Types

```typescript
{
  entities: [
    // Systems
    { name: 'api', type: 'system', displayName: 'API Service' },
    { name: 'database', type: 'system', displayName: 'Database' },

    // Processes
    {
      name: 'customer-onboarding',
      type: 'process',
      displayName: 'Customer Onboarding',
      description: 'End-to-end onboarding flow',
      statusLogic: {
        source: 'issues',
        rules: [
          { condition: 'severity:critical', status: 'down', priority: 10 },
          { condition: 'severity:major', status: 'degraded', priority: 5 },
        ],
      },
    },

    // Projects
    {
      name: 'migration-aurora',
      type: 'project',
      displayName: 'Aurora Migration',
      description: 'PostgreSQL to Aurora migration project',
      tags: ['infrastructure', 'database', 'q4-2025'],
      links: [
        { url: '/docs/migration', label: 'Migration Guide' },
      ],
    },
  ]
}
```

### Example 4: Process with Custom Status Logic

```typescript
{
  entities: [
    {
      name: 'support-response',
      type: 'process',
      displayName: 'Support Response Times',
      description: 'Average response time SLA compliance',
      icon: '💬',
      statusLogic: {
        source: 'issues',
        rules: [
          {
            condition: 'label:sla-breach',
            status: 'down',
            priority: 10,
            message: 'SLA target missed',
          },
          {
            condition: 'label:at-risk',
            status: 'degraded',
            priority: 5,
            message: 'Approaching SLA threshold',
          },
        ],
      },
      links: [
        { url: 'https://dashboard.example.com/support', label: 'Dashboard' },
      ],
    },
  ]
}
```

---

## Data Migration

### Status Data Files (No Changes Needed)

The existing status data format is **already compatible** with the Entity model:

**current.json:**
```json
{
  "name": "api",  // ← Matches entity.name
  "url": "https://api.example.com",
  "currentStatus": "up",
  "history": [...]
}
```

**incidents.json:**
```json
{
  "affectedSystems": ["api", "database"],  // ← Matches entity.name
  "labels": ["system:api", "severity:critical"]
}
```

**No migration needed** - entity names match existing service names.

---

## Testing Strategy

### Unit Tests

Update existing tests:
- `__tests__/github-service.test.ts` - Update to use entities
- `__tests__/options.test.ts` - Update to validate entities
- Add `__tests__/label-utils.test.ts` - Test label parsing
- Add `__tests__/status-rules.test.ts` - Test rule engine (Phase 3)

### Integration Tests

- Entity-based status generation
- Label parsing with different schemes
- Status determination for different entity types
- Auto-discovery of entities from issues

### Migration Tests

- Test config migration script
- Verify data files still load correctly
- Ensure GitHub workflows continue working

---

## Breaking Changes

### v0.11.0 Breaking Changes

**REMOVED:**
- `systemLabels` configuration option

**ADDED:**
- `entities` configuration option (required)

**MIGRATION:**
- Use `scripts/migrate-config.js` to convert systemLabels → entities
- Manual update takes ~15 minutes

**DATA:**
- No data migration needed
- Existing status-data files are compatible

---

## Documentation Updates

### README.md

Add new section after "Quick Start":

```markdown
## Configuration

### Entity Configuration

Define entities to track in your `docusaurus.config.js`:

\`\`\`javascript
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
      owner: 'your-org',
      repo: 'status-tracking',
      entities: [
        // Systems (technical infrastructure)
        { name: 'api', type: 'system', displayName: 'API Service' },
        { name: 'database', type: 'system', displayName: 'Database' },

        // Processes (business flows)
        {
          name: 'onboarding',
          type: 'process',
          displayName: 'Customer Onboarding',
          description: 'End-to-end onboarding flow',
        },

        // Projects (time-bound initiatives)
        {
          name: 'migration',
          type: 'project',
          displayName: 'Database Migration',
        },
      ],
    }]
  ]
}
\`\`\`

### Entity Types

- **system**: Technical infrastructure (APIs, databases, services)
- **process**: Business processes (onboarding, billing, support)
- **project**: Time-bound initiatives (migrations, feature launches)
- **event**: Scheduled events (campaigns, product launches)
- **sla**: Service level tracking (uptime SLAs, performance targets)
- **custom**: User-defined entity types
```

### CHANGELOG.md

```markdown
## [0.11.0] - 2025-XX-XX

### BREAKING CHANGES

- **Removed `systemLabels` configuration** - Use `entities` instead
- Migration script provided: `scripts/migrate-config.js`

### Added

- Entity model with support for multiple types (system, process, project, event, sla, custom)
- Label parsing with namespaced labels (`system:api`, `process:onboarding`)
- Entity type icons and grouped display
- Flexible status determination per entity type

### Migration Guide

1. Run migration script: `node scripts/migrate-config.js path/to/docusaurus.config.ts`
2. Review and enhance generated entities configuration
3. Update GitHub issue labels to use namespaced format (optional)
4. No data migration needed - existing status files are compatible

See ENTITY-MODEL-IMPLEMENTATION.md for full details.
```

---

## Implementation Timeline

### Phase 1: Core Entity Model (v0.11.0)

**Effort**: 3-4 weeks

**Tasks:**
1. Add Entity types to src/types.ts (4 hours)
2. Create LabelParser utility (4 hours)
3. Update PluginOptions and validation (3 hours)
4. Update GitHubStatusService (6 hours)
5. Create migration script (2 hours)
6. Update tests (8 hours)
7. Update documentation (4 hours)
8. Migrate amiable-docusaurus (1 hour)

**Total**: ~32 hours

### Phase 2: Enhanced Features (v0.12.0)

**Effort**: 2-3 weeks

**Tasks:**
1. Entity auto-discovery (4 hours)
2. UI updates (entity icons, grouping) (8 hours)
3. Update theme components (6 hours)
4. Add tests (4 hours)
5. Update documentation (3 hours)

**Total**: ~25 hours

### Phase 3: Custom Status Logic (v0.13.0)

**Effort**: 3-4 weeks

**Tasks:**
1. Status rule engine (8 hours)
2. Integration with GitHub service (6 hours)
3. Add tests (6 hours)
4. Example configurations (4 hours)
5. Update documentation (4 hours)

**Total**: ~28 hours

---

## Summary

This simplified implementation plan:

1. ✅ **Skips backward compatibility** - No EntityAdapter complexity
2. ✅ **Minimal migration effort** - One config file update (15 minutes)
3. ✅ **No data migration** - Existing files work unchanged
4. ✅ **Clean architecture** - Entity model from day one
5. ✅ **Faster development** - ~85 hours total vs ~120 hours with backward compat
6. ✅ **Better maintainability** - Single code path
7. ✅ **Migration script provided** - Automated config conversion

**Recommended Timeline:**
- v0.11.0 (4 weeks): Core entity model + migration
- v0.12.0 (3 weeks): Enhanced UI and auto-discovery
- v0.13.0 (4 weeks): Custom status logic

**Next Steps:**
1. Review and approve this simplified plan
2. Create GitHub issues for each phase
3. Run migration script on amiable-docusaurus
4. Begin Phase 1 implementation

---

**End of Implementation Guide**
