# Migration Assessment: Entity Model Implementation & Backward Compatibility

**Date**: 2025-11-12  
**Status**: Current Configuration Analysis  
**Scope**: Test site + plugin codebase  

---

## Executive Summary

The test site is configured to use `systemLabels` configuration with 5 tracked systems. If backward compatibility with `systemLabels` is dropped, the following migration steps would be required:

1. **Configuration File Update**: Update `docusaurus.config.ts` to use `entities` instead of `systemLabels`
2. **Data Validation**: No breaking changes to existing `status-data/` files (data format is system-agnostic)
3. **GitHub Workflow Updates**: Minor updates to issue label handling
4. **Migration Script**: Automated conversion available in proposed Entity Adapter

---

## Current Configuration Analysis

### Test Site Setup

**Location**: `/Users/christopherjoseph/projects/amiable/Stentorosaurus/test-status-site/`

#### Docusaurus Configuration
**File**: `test-status-site/docusaurus.config.ts`

```typescript
plugins: [
  [
    '@amiable-dev/docusaurus-plugin-stentorosaur',
    {
      owner: 'facebook',
      repo: 'docusaurus',
      systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api'],
      token: process.env.GITHUB_TOKEN,
      title: 'System Status',
      description: 'Current operational status of our systems',
      // ... other options ...
      useDemoData: false,  // Uses real/committed data
      showServices: true,
      showIncidents: true,
    },
  ],
],
```

**Current Systems**: 5 systems tracked
- `website`
- `documentation`
- `build-system`
- `ci-cd`
- `api`

#### Status Data Files

**Location**: `test-status-site/status-data/`

1. **current.json** (10 readings, ~1.2 KB)
   - Time-series monitoring data in JSONL format
   - Systems referenced: `website`, `workflow`
   - Recent data with timestamps and latency metrics
   - Sample structure:
     ```json
     {
       "t": 1736456382730,      // timestamp
       "svc": "website",         // service name
       "state": "up",            // state
       "code": 200,              // HTTP status
       "lat": 150                // latency in ms
     }
     ```

2. **incidents.json** (2 incidents, ~0.9 KB)
   - Open incident: "Website experiencing intermittent downtime" (critical severity)
   - Closed incident: "API degraded performance" (major severity)
   - Current schema:
     ```json
     {
       "id": 1,
       "title": "...",
       "status": "open|closed",
       "severity": "critical|major|minor|maintenance",
       "affectedSystems": ["website"],  // ← System names
       "labels": ["status", "critical", "website"]
     }
     ```

3. **maintenance.json** (1 scheduled maintenance, ~0.6 KB)
   - Upcoming database migration
   - Affects: `website`, `workflow`
   - Current schema:
     ```json
     {
       "id": 10,
       "title": "...",
       "affectedSystems": ["website", "workflow"],
       "start": "2025-01-12T02:00:00Z",
       "end": "2025-01-12T04:00:00Z"
     }
     ```

**Data Format Compatibility**: ✅ All existing files are system-agnostic (use `svc`/`affectedSystems` fields, not labels)

---

## systemLabels Usage Across Codebase

### Plugin Source Code

#### 1. Type Definitions (`src/types.ts`)
- **Line 154**: `systemLabels?: string[];` in PluginOptions interface
- **Impact**: Configuration input point
- **Migration**: Change to `entities?: Entity[]` (proposed in ENTITY-MODEL-IMPLEMENTATION.md)

#### 2. Configuration Schema (`src/options.ts`)
```typescript
DEFAULT_OPTIONS: {
  systemLabels: [],  // Default to empty array
  // ...
}

pluginOptionsSchema: {
  systemLabels: Joi.array().items(Joi.string()).default([])
}
```
- **Impact**: Validation and default values
- **Migration**: Replace with entities validation schema

#### 3. Index Plugin (`src/index.ts`)
- **Line 166**: Destructure `systemLabels` from options
- **Line 340**: Pass to `GitHubStatusService` (GitHub API fetch)
- **Line 399**: Pass to `GitHubStatusService` (fallback fetch)
- **Impact**: Control flow for system identification
- **Migration**: Replace with entity collection extraction

#### 4. GitHub Service (`src/github-service.ts`)
**Critical usage locations**:

```typescript
// Constructor (line 52)
constructor(..., systemLabels: string[], ...)

// Line 107: Extract affected systems from issue labels
const affectedSystems = labels.filter(label =>
  this.systemLabels.includes(label)
);

// Line 140: Initialize all systems (generates StatusItem for each)
for (const system of this.systemLabels) {
  systemsMap.set(system, { name: system, status: 'up', ... });
}

// Line 273: Extract from maintenance labels
const affectedSystems = frontmatter.systems || 
  labels.filter(label => this.systemLabels.includes(label));
```

**Impact**: Core logic for:
- Filtering GitHub issue labels to find affected systems
- Initializing status board with all configured systems
- Determining which issues affect which systems

**Migration Strategy**:
- Extract system names from Entity[]
- Pass system names array instead of systemLabels
- Keep internal logic identical for Phase 1 (backward compatibility)

#### 5. CLI Scripts (`scripts/update-status.cjs`)
```typescript
systemLabelsIndex = args.indexOf('--system-labels');
if (systemLabelsIndex !== -1 && args[systemLabelsIndex + 1]) {
  options.systemLabels = args[systemLabelsIndex + 1].split(',');
}
```
- **Impact**: CLI argument parsing
- **Migration**: Support both `--system-labels` (legacy) and `--entities` (new)

---

## GitHub Workflows Analysis

### Template Workflows (Plugin Package)

**Location**: `docusaurus-plugin-stentorosaur/templates/workflows/`

#### monitor-systems.yml (No systemLabels dependency)
- Uses `.monitorrc.json` configuration
- Creates issues with labels: `['status', systemName, 'critical', 'automated']`
- **Migration Impact**: ⚠️ MINIMAL - system names come from monitoring config, not systemLabels

#### status-update.yml (No systemLabels dependency)
- Uses `stentorosaur-update-status` CLI tool
- Takes GITHUB_TOKEN, reads issues with 'status' label
- **Migration Impact**: ⚠️ MINIMAL - status label is separate from systemLabels

#### Template Monitor Config (`.monitorrc.json`)
```json
{
  "systems": [
    {
      "system": "api",      // ← System name
      "url": "https://api.example.com/health",
      "method": "GET"
    }
  ]
}
```
- **Migration Impact**: ⚠️ MINIMAL - system names independent of systemLabels

---

## Issue Label System

### Current Test Site Labels

From incidents.json and maintenance.json:
- **Status label**: `status` (identifies status-tracking issues)
- **System labels**: `website`, `api`, `workflow`, etc. (match configured systems)
- **Severity labels**: `critical`, `major`, `minor`, `maintenance`

### Label Matching Logic

```
GitHub Issue Labels: ['status', 'website', 'critical']
                           ↓
                    Filter against systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api']
                           ↓
                    affectedSystems: ['website']
```

**Migration Impact**: 
- If `systemLabels` is removed, label matching must change
- **Proposed Solution**: Use entity names instead
- **Breaking Change**: YES - if issue labels don't match entity names, they won't be recognized

---

## Migration Implementation Roadmap

### Phase 1: Foundation (Proposed v0.11.0)

**Goal**: Introduce Entity model internally, maintain backward compatibility

**Changes Required**:

1. **Add Entity Types** (`src/types.ts`):
   - Add `Entity` interface
   - Add `EntityType` enum
   - Add `entities?: Entity[]` to PluginOptions
   - Mark `systemLabels` as `@deprecated`

2. **Create Entity Adapter** (`src/entity-adapter.ts`):
   - Implement `fromSystemLabels(systemLabels)` conversion
   - Implement `mergeConfigurations(systemLabels, entities)` logic
   - Implement entity name extraction

3. **Update Plugin (`src/index.ts`):
   ```typescript
   // Before:
   const { systemLabels = [], entities } = options;
   
   // After:
   const systemNames = EntityAdapter.mergeConfigurations(
     options.systemLabels,
     options.entities
   ).map(e => e.name);
   ```

4. **Update GitHub Service** (`src/github-service.ts`):
   - No logic changes, just parameter naming
   - Accept `systemNames: string[]` instead of `systemLabels`

5. **Update Options Schema** (`src/options.ts`):
   ```typescript
   entities: Joi.array().items(
     Joi.object({
       name: Joi.string().required(),
       type: Joi.string().valid('system', 'process', 'project', 'event', 'sla', 'custom'),
       displayName: Joi.string(),
       // ... more fields ...
     })
   ),
   systemLabels: Joi.array()  // ← Keep for backward compat
     .items(Joi.string())
     .meta({ deprecated: true }),
   ```

### Migration Path for Test Site

**Current**: Uses `systemLabels`
```typescript
systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api']
```

**After Entity Model**:
```typescript
entities: [
  { name: 'website', type: 'system', displayName: 'Website' },
  { name: 'documentation', type: 'system', displayName: 'Documentation' },
  { name: 'build-system', type: 'system', displayName: 'Build System' },
  { name: 'ci-cd', type: 'system', displayName: 'CI/CD Pipeline' },
  { name: 'api', type: 'system', displayName: 'API Service' }
]
```

**Migration Effort**: ~15 minutes (straightforward configuration change)

---

## Data Format Migration (Current to New)

### No Breaking Changes Required

**Good news**: Status data files (current.json, incidents.json, maintenance.json) are system-agnostic.

**Evidence**:
- `current.json` uses `svc` field (service name, not label)
- `incidents.json` uses `affectedSystems: string[]` (system names, not labels)
- `maintenance.json` uses `affectedSystems: string[]` (system names, not labels)

**No migration script needed for status data**

---

## Backward Compatibility Strategy

### Option 1: Soft Deprecation (Recommended)

**Duration**: 2-3 releases (v0.11.0 → v0.12.0 → v0.13.0)

```typescript
// v0.11.0: Support both, prefer entities
if (options.entities) {
  systemNames = options.entities.map(e => e.name);
} else if (options.systemLabels) {
  console.warn(
    '[docusaurus-plugin-stentorosaur] ' +
    'systemLabels is deprecated. Use entities instead.\n' +
    'See migration guide: https://...'
  );
  systemNames = options.systemLabels;
} else {
  systemNames = [];
}

// v0.12.0: Same logic, add deprecation notice to docs

// v0.13.0: Remove systemLabels support
```

### Option 2: Hard Break (Not Recommended)

- Remove `systemLabels` entirely in v0.11.0
- Require users to migrate immediately
- **Cost**: Breaking change, potential user friction

---

## Test Site Migration Checklist

### Configuration Updates

- [ ] Update `test-status-site/docusaurus.config.ts`
  - Replace `systemLabels` with `entities` array
  - Ensure 5 systems converted correctly

### Data Validation

- [ ] Verify `status-data/current.json` loads without errors
- [ ] Verify `status-data/incidents.json` loads without errors
- [ ] Verify `status-data/maintenance.json` loads without errors
- [ ] Check that affected systems are recognized from incident data

### Workflow Updates

- [ ] Review `monitor-systems.yml` workflow
  - Update issue label creation if needed
  - Ensure system names match entity names

- [ ] Review `status-update.yml` workflow
  - Verify label matching logic still works
  - Test with mixed label scenarios

### Testing

- [ ] Run `npm test` in plugin directory
- [ ] Run `npm start` in test site directory
- [ ] Verify status page displays 5 systems
- [ ] Verify incidents show correct affected systems
- [ ] Verify maintenance windows display correctly

---

## Migration Script Example

### Automated Configuration Conversion

```javascript
#!/usr/bin/env node
/**
 * Migrate systemLabels to entities format
 * Usage: npx migrate-to-entities docusaurus.config.ts
 */

const fs = require('fs');
const path = require('path');

function migrateConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  
  // Extract systemLabels array
  const match = content.match(/systemLabels:\s*\[(.*?)\]/s);
  if (!match) {
    console.log('No systemLabels found');
    return content;
  }
  
  // Parse system names
  const systemsStr = match[1];
  const systems = systemsStr
    .split(',')
    .map(s => s.trim())
    .map(s => s.replace(/['"`]/g, ''))
    .filter(Boolean);
  
  // Generate entities array
  const entities = systems.map(name => `
  { name: '${name}', type: 'system', displayName: '${name}' }`).join(',');
  
  // Replace in config
  let newContent = content.replace(
    /systemLabels:\s*\[(.*?)\]/s,
    `entities: [${entities}\n  ]`
  );
  
  // Add deprecation comment
  newContent = newContent.replace(
    'entities: [',
    `// Migrated from systemLabels - see MIGRATION.md
    entities: [`
  );
  
  return newContent;
}

if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: migrate-to-entities <config-file>');
    process.exit(1);
  }
  
  const newContent = migrateConfig(configPath);
  console.log(newContent);
}

module.exports = { migrateConfig };
```

---

## Impact Summary Table

| Component | Current Use | Migration Impact | Effort |
|-----------|-------------|------------------|--------|
| `test-site/docusaurus.config.ts` | systemLabels config | Replace with entities | Low (15 min) |
| `src/types.ts` | Type definition | Add Entity, deprecate systemLabels | Low |
| `src/options.ts` | Default/schema | Update validation | Low |
| `src/index.ts` | Control flow | Pass system names from entities | Low |
| `src/github-service.ts` | Parameter usage | No logic changes | None |
| `.monitorrc.json` | Monitoring config | No changes needed | None |
| `monitor-systems.yml` | GitHub workflow | No changes needed | None |
| `status-update.yml` | GitHub workflow | No changes needed | None |
| `status-data/` | Data files | No changes needed | None |
| Tests | Plugin tests | Update test fixtures | Low |

---

## Recommendations

### If Dropping Backward Compatibility

**Timeline**: 
1. v0.11.0: Introduce `entities`, deprecate `systemLabels`
2. v0.12.0: Full support for both, warnings in logs
3. v0.13.0+: Remove `systemLabels`

**User Impact**:
- Test site needs config update (~15 minutes)
- No data migration needed
- No workflow changes needed
- Smooth migration path with clear warnings

### Rollout Strategy

1. **Week 1**: Add Entity type definitions, keep systemLabels working
2. **Week 2**: Update docs with migration guide
3. **Week 3**: Update test site as reference implementation
4. **Release v0.11.0**: Announce deprecation, provide migration script
5. **Release v0.12.0** (4-6 weeks later): Remove systemLabels
6. **Release v0.13.0** (8-12 weeks later): Full cleanup

---

## Files That Need Updates

### Plugin Package
```
docusaurus-plugin-stentorosaur/
├── src/
│   ├── types.ts              ← Add Entity types
│   ├── options.ts            ← Update schema
│   ├── index.ts              ← Use entities instead of systemLabels
│   ├── github-service.ts     ← Accept systemNames array
│   ├── entity-adapter.ts     ← NEW: Conversion logic
│   └── entity-manager.ts     ← NEW: Entity operations
├── __tests__/
│   ├── entity-adapter.test.ts ← NEW: Test conversions
│   └── plugin.test.ts        ← Update fixtures
├── README.md                 ← Update documentation
└── MIGRATION.md              ← NEW: Migration guide

```

### Test Site
```
test-status-site/
└── docusaurus.config.ts      ← Replace systemLabels with entities
```

---

## Questions Resolved

**Q: Will existing status-data files still work?**
A: Yes! Files are system-agnostic and don't reference systemLabels.

**Q: Do GitHub workflows need updating?**
A: No! Workflows use system names from `.monitorrc.json` or from issue labels.

**Q: Can we convert systemLabels automatically?**
A: Yes! EntityAdapter.fromSystemLabels() handles conversion.

**Q: How long is the deprecation period?**
A: Recommend 2-3 releases for graceful migration.

**Q: What about production sites using systemLabels?**
A: Soft deprecation with clear warnings and migration guide.

---

## Conclusion

**Migration Feasibility**: ⚠️ **HIGH - With Caveats**

The test site can migrate to the entity model with minimal changes:
- Configuration file update: ~15 minutes
- No data file migration needed
- No workflow changes required
- Internal plugin refactoring can be done gradually
- Backward compatibility can be maintained for 2-3 releases

**Recommendation**: Proceed with Phase 1 (Entity types + soft deprecation) to reduce user friction while modernizing the architecture.

