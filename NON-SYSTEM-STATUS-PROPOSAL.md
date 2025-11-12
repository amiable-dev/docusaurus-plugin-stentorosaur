# Non-System Based Status Reporting - Design Proposal

**Date**: 2025-11-12
**Version**: Draft v2.0 - Simplified (No Backward Compatibility)
**Status**: Proposal for Discussion

## Executive Summary

This document proposes replacing the system-centric architecture of docusaurus-plugin-stentorosaur with a flexible **Entity model** that supports tracking business processes, projects, events, and other entities beyond technical infrastructure.

**IMPORTANT UPDATE**: Since there are no external users (only the internal test site amiable-docusaurus), this proposal **drops backward compatibility** and goes directly to the Entity model. This significantly simplifies implementation.

### Current Limitation

The plugin is fundamentally **system-centric**, requiring all status items to be defined as "systems" (API, Database, Website, etc.) with uptime monitoring. This works well for infrastructure but doesn't fit:

- Business processes (Onboarding, Billing, Support Response)
- Projects/Features (Migration to v2, New Dashboard Launch)
- Events/Campaigns (Black Friday Sale, Product Launch)
- Service-level tracking (SLA compliance, Customer satisfaction)

### Proposed Solution

**Replace `systemLabels` with `entities` configuration** that supports multiple entity types (system, process, project, event, sla, custom).

**Migration Impact**: One config file update (15 minutes), no data migration needed.

---

## Use Cases for Non-System Status

### 1. Business Process Tracking

**Example: Customer Onboarding Process**

Current workaround:
```yaml
systemLabels: ['customer-onboarding']
```
Problems:
- No uptime monitoring makes sense
- "System" terminology confusing
- Can't track process metrics (completion rate, time-to-complete)

Desired:
```yaml
entities:
  - name: Customer Onboarding
    type: process
    metrics:
      - completionRate
      - averageTime
      - currentBacklog
```

**Example: Support Response Times**

Status based on SLA compliance, not uptime:
- Green: <2h average response time
- Yellow: 2-4h average response time
- Red: >4h average response time

### 2. Project/Feature Status

**Example: Database Migration Project**

Track project milestones and blockers:
```yaml
entities:
  - name: PostgreSQL to Aurora Migration
    type: project
    milestones:
      - Planning (completed)
      - Testing (in-progress)
      - Production Rollout (upcoming)
```

Status determined by:
- Open blockers (GitHub issues with `project:migration` + `blocker`)
- Milestone progress
- Risk level

### 3. Event/Campaign Tracking

**Example: Black Friday Sale**

```yaml
entities:
  - name: Black Friday 2025
    type: event
    startDate: 2025-11-29
    endDate: 2025-12-01
    dependencies:
      - payment-processing
      - inventory-system
      - checkout-api
```

Status based on:
- Dependencies health
- Event timeline (upcoming/active/completed)
- Incidents affecting the event

### 4. Service Level Tracking

**Example: 99.9% Uptime SLA**

```yaml
entities:
  - name: Production SLA Compliance
    type: sla
    target: 99.9
    measurement: uptime
    period: monthly
```

Status:
- Green: Meeting SLA (>99.9%)
- Yellow: At risk (99.5-99.9%)
- Red: Breaching SLA (<99.5%)

### 5. Multi-Dimensional Status

**Example: API Platform Health**

Instead of single "API" system, track multiple dimensions:
- Availability (uptime)
- Performance (response times)
- Rate Limits (quota usage)
- Error Rates (5xx errors)

Each dimension can have incidents independently.

---

## Design Principles

### 1. Clean Break (No Backward Compatibility)

**BREAKING CHANGE in v0.11.0**: `systemLabels` removed, `entities` required.

**Before (v0.10.x):**

```javascript
{
  systemLabels: ['api', 'database', 'website']
}
```

**After (v0.11.0+):**

```javascript
{
  entities: [
    { name: 'api', type: 'system' },
    { name: 'database', type: 'system' },
    { name: 'website', type: 'system' },
  ]
}
```

**Why No Backward Compatibility:**

✅ No external users - only amiable-docusaurus test site
✅ One-time config update (15 minutes)
✅ Simpler codebase - no adapter complexity
✅ Faster development - skip Phase 1 entirely
✅ Migration script provided for automation

### 2. Flexible Status Determination

Different entity types need different status logic:

| Entity Type | Status Determined By |
|-------------|---------------------|
| `system` | Uptime monitoring + incidents (current) |
| `process` | Open issues + custom metrics |
| `project` | Milestones + blockers |
| `event` | Timeline + dependencies + incidents |
| `sla` | Metric threshold + incidents |
| `custom` | User-defined logic |

### 3. GitHub Issues as Source of Truth

Maintain current model:
- Issues create incidents/blockers/updates
- Labels link issues to entities
- Issue state (open/closed) affects status

**New Feature**: Entity-specific label schemes:

```text
system:api → Links to "API" system
process:onboarding → Links to "Customer Onboarding" process
project:migration → Links to "Database Migration" project
```

---

## Proposed Architecture

### Data Model Changes

#### New Core Type: `Entity`

```typescript
interface Entity {
  name: string;                    // Unique identifier
  displayName?: string;            // Human-readable name
  type: EntityType;                // system | process | project | event | sla | custom
  description?: string;            // Description

  // Status determination
  statusLogic?: StatusLogic;       // How to calculate status

  // Type-specific config
  config?: EntityConfig;           // Varies by type

  // Monitoring (optional)
  monitoring?: MonitoringConfig;   // Only for monitored entities

  // Metadata
  tags?: string[];                 // Categorization
  links?: EntityLink[];            // External links
  icon?: string;                   // Display icon
}

type EntityType =
  | 'system'      // Technical infrastructure (current model)
  | 'process'     // Business process
  | 'project'     // Time-bound initiative
  | 'event'       // Scheduled event/campaign
  | 'sla'         // Service level agreement
  | 'custom';     // User-defined

interface StatusLogic {
  source: 'monitoring' | 'issues' | 'custom' | 'composite';
  rules?: StatusRule[];
}

interface StatusRule {
  condition: string;               // e.g., "open_issues > 0"
  status: 'up' | 'down' | 'degraded' | 'maintenance';
  priority: number;                // Higher priority wins
}
```

#### Enhanced Issue Linking

**Current**: Single label → Single system
```
labels: ['api', 'critical'] → affects "api" system
```

**Proposed**: Namespace labels → Multiple entities
```
labels: [
  'system:api',           → affects "API" system
  'process:onboarding',   → affects "Customer Onboarding" process
  'severity:critical'     → severity (not an entity)
]
```

**Backward compatible**: Labels without `:` treated as system names:
```
labels: ['api'] → treated as 'system:api'
```

#### Configuration Schema

```typescript
interface PluginOptions {
  // Legacy (deprecated but supported)
  systemLabels?: string[];         // ['api', 'database']

  // New (recommended)
  entities?: Entity[];             // Flexible entity definitions

  // Label parsing
  labelScheme?: {
    separator: string;             // Default: ':'
    defaultType: EntityType;       // Default: 'system'
    allowUntyped: boolean;         // Default: true (for backward compat)
  };

  // ... existing options
}
```

### Implementation Phases (Simplified)

#### Phase 1: Direct Entity Model (v0.11.0)

**Goal**: Replace systemLabels with entities configuration

**Changes:**

- Add `Entity` type to `src/types.ts`
- **Remove** `systemLabels` from `PluginOptions` (breaking change)
- Add **required** `entities` config option
- Create `LabelParser` utility for namespaced labels
- Update GitHub service to use entities directly
- Create migration script (`scripts/migrate-config.js`)
- Update amiable-docusaurus configuration (one-time)

**Effort**: 3-4 weeks (~32 hours)
**Migration**: 15 minutes (automated via script)
**Data Migration**: NONE - existing data files compatible

#### Phase 2: Enhanced Features (v0.12.0)

**Goal**: Add entity type icons, grouping, and auto-discovery

**Changes:**

- Implement entity auto-discovery from GitHub issue labels
- Add entity type detection from labels
- Update UI with entity type icons (📊 system, 🔄 process, 🎯 project, etc.)
- Group status display by entity type
- Update theme components with entity-aware rendering

**Effort**: 2-3 weeks (~25 hours)

#### Phase 3: Custom Status Logic (v0.13.0)

**Goal**: Different status determination per entity type

**Changes:**

- Implement `StatusRuleEngine` for custom logic
- Add built-in status rules for common patterns
- Support entity-specific status indicators in UI
- Add status rule configuration examples

**Effort**: 3-4 weeks (~28 hours)

#### Phase 4: Advanced Features (v0.14.0+)

**Goal**: Rich entity models and relationships

- Entity dependencies (event depends on systems)
- Timeline visualization (project milestones, event schedule)
- Custom metrics per entity type
- Entity grouping/hierarchies
- Advanced routing (`/status/projects`, `/status/events`)

---

## Configuration Examples

### Example 1: Hybrid Model

```javascript
// docusaurus.config.js
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
      owner: 'mycompany',
      repo: 'status',

      // Legacy systems (still works)
      systemLabels: ['api', 'database', 'cdn'],

      // New entities (opt-in)
      entities: [
        {
          name: 'customer-onboarding',
          displayName: 'Customer Onboarding',
          type: 'process',
          description: 'End-to-end customer onboarding flow',
          statusLogic: {
            source: 'issues',
            rules: [
              { condition: 'severity:critical', status: 'down', priority: 3 },
              { condition: 'severity:major', status: 'degraded', priority: 2 },
              { condition: 'open_issues > 0', status: 'degraded', priority: 1 }
            ]
          },
          icon: '🔄'
        },
        {
          name: 'migration-aurora',
          displayName: 'Aurora Migration Project',
          type: 'project',
          statusLogic: {
            source: 'issues',
            rules: [
              { condition: 'label:blocker', status: 'down', priority: 3 },
              { condition: 'label:at-risk', status: 'degraded', priority: 2 }
            ]
          },
          tags: ['infrastructure', 'database'],
          links: [
            { url: 'https://docs.example.com/migration', label: 'Migration Guide' }
          ],
          icon: '🎯'
        }
      ]
    }]
  ]
}
```

### Example 2: GitHub Issues Setup

**Creating a Process Issue:**
```markdown
---
title: Onboarding Flow Delayed
labels: [process:customer-onboarding, severity:major, status]
---

The email verification step is experiencing delays due to...
```

**Creating a Project Blocker:**
```markdown
---
title: Aurora Migration Blocked - IAM Permissions
labels: [project:migration-aurora, blocker, status]
---

Migration testing blocked due to missing RDS IAM roles in staging...
```

### Example 3: Label Namespace Configuration

```javascript
{
  labelScheme: {
    separator: '/',              // Use / instead of :
    defaultType: 'system',       // Unlabeled = system
    allowUntyped: true           // 'api' → 'system/api'
  },

  entities: [/* ... */]
}
```

**GitHub labels:**
```
system/api → API system
process/onboarding → Onboarding process
project/migration → Migration project
api → system/api (fallback)
```

---

## UI/UX Considerations

### Display Grouping

**Current**: Single flat list of systems

**Proposed**: Group by entity type

```
📊 Systems
  ✅ API Service
  ✅ Database
  ⚠️ CDN (degraded)

🔄 Processes
  ✅ Customer Onboarding
  ⚠️ Support Response Times

🎯 Projects
  ⚠️ Aurora Migration (at risk)
  ✅ Dashboard Redesign

📅 Events
  🔜 Black Friday Sale (upcoming)
```

### Status Indicators

Different entity types may need different status visualizations:

| Entity Type | Status Display |
|-------------|---------------|
| System | Green/Yellow/Red dot + uptime % |
| Process | Status dot + open issues count |
| Project | Progress bar + milestone |
| Event | Timeline + dependency health |
| SLA | Gauge + current vs target |

### Filtering and Sorting

```
Filters:
  [ ] All Types
  [✓] Systems
  [✓] Processes
  [ ] Projects
  [ ] Events

Sort by:
  ( ) Name
  (•) Status (degraded first)
  ( ) Type
  ( ) Last Updated
```

---

## Migration Guide

### For amiable-docusaurus (One-Time Update)

**Current Configuration (v0.10.x):**

```javascript
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
      systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api'],
      // ... other options
    }]
  ]
}
```

**New Configuration (v0.11.0+):**

```javascript
{
  plugins: [
    ['@amiable-dev/docusaurus-plugin-stentorosaur', {
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

**Automated Migration:**

Use the provided migration script:

```bash
cd docusaurus-plugin-stentorosaur
node scripts/migrate-config.js /path/to/amiable-docusaurus/docusaurus.config.ts
```

The script:

1. Reads your current config
2. Extracts `systemLabels` array
3. Converts to `entities` format
4. Creates backup (`.backup` file)
5. Writes updated config

**Time Required**: 15 minutes (mostly reviewing the changes)

---

## Technical Challenges

### 1. Monitoring Non-Systems

**Challenge**: Monitoring workflow expects systems with URLs

**Solution**: Make monitoring optional per entity
```typescript
interface Entity {
  monitoring?: {
    enabled: boolean;
    url?: string;
    method?: string;
    // ... existing monitoring config
  };
}
```

Process/project entities simply don't define monitoring.

### 2. Performance Metrics Display

**Challenge**: Charts show uptime/response time - not applicable to processes

**Solution**: Entity-type-specific metrics
```typescript
interface EntityMetrics {
  system: {
    uptime: number;
    responseTime: number;
    // ... existing
  };
  process: {
    openIssues: number;
    avgResolutionTime: number;
    customMetrics?: Record<string, number>;
  };
  project: {
    milestonesCompleted: number;
    milestonesTotal: number;
    blockerCount: number;
  };
  // ...
}
```

### 3. Backward Compatibility

**Challenge**: Internal code assumes systems everywhere

**Solution**: Adapter pattern
```typescript
// Internal: Everything is an Entity
class EntityAdapter {
  static fromSystemLabel(label: string): Entity {
    return {
      name: label,
      type: 'system',
      monitoring: { enabled: true }
    };
  }

  static toStatusItem(entity: Entity): StatusItem {
    // Convert Entity → StatusItem for UI
  }
}
```

### 4. Label Collision

**Challenge**: `api` label could mean system or something else

**Solution**: Explicit namespace required for non-systems
```
'api' → treated as system:api (default)
'process:api' → process named 'api'
```

---

## Alternatives Considered

### Alternative 1: Multiple Plugin Instances

**Idea**: Use plugin multiple times for different entity types

```javascript
plugins: [
  ['stentorosaur', { id: 'systems', systemLabels: [...] }],
  ['stentorosaur', { id: 'processes', processLabels: [...] }]
]
```

**Pros**: No code changes
**Cons**: Duplicated monitoring, separate pages, confusing UX

**Verdict**: ❌ Rejected - Poor user experience

### Alternative 2: Generic "Items" with Tags

**Idea**: Everything is a generic "Item", use tags to categorize

```javascript
items: [
  { name: 'API', tags: ['system', 'critical'] },
  { name: 'Onboarding', tags: ['process', 'business'] }
]
```

**Pros**: Very flexible
**Cons**: Loses type safety, unclear semantics, hard to implement type-specific logic

**Verdict**: ❌ Rejected - Too loose, hard to evolve

### Alternative 3: Virtual "Systems" (Current Workaround)

**Idea**: Model everything as a system (current approach)

```javascript
systemLabels: [
  'api',
  'customer-onboarding',  // ← Fake system
  'migration-project'      // ← Fake system
]
```

**Pros**: Works today
**Cons**: Confusing terminology, monitoring doesn't fit, limited status logic

**Verdict**: ⚠️ Works but semantically wrong - motivates this proposal

### Alternative 4: Separate Status Types

**Idea**: Different config for each type

```javascript
{
  systems: [...],
  processes: [...],
  projects: [...],
  events: [...]
}
```

**Pros**: Clear separation
**Cons**: Duplicated logic, hard to maintain, doesn't scale to custom types

**Verdict**: ❌ Rejected - Not extensible

---

## Recommended Approach (Simplified)

### v0.11.0: Direct Entity Model (4 weeks)

**Breaking Changes:**

- Remove `systemLabels` configuration
- Add required `entities` configuration
- Create migration script for automated config conversion

**Implementation:**

1. Add `Entity` types and interfaces to `src/types.ts`
2. Create `LabelParser` utility for namespaced labels
3. Update GitHub service to use entities directly
4. Update tests to use entities
5. Create migration script (`scripts/migrate-config.js`)
6. **Migrate amiable-docusaurus** (one-time, 15 minutes)

**Effort**: ~32 hours
**Data Migration**: NONE

### v0.12.0: Enhanced Features (3 weeks)

**New Features:**

1. Entity auto-discovery from GitHub issue labels
2. Entity type icons and grouped display
3. UI updates for entity-aware rendering

**Effort**: ~25 hours

### v0.13.0: Custom Status Logic (4 weeks)

**New Features:**

1. Status rule engine for custom logic
2. Entity-specific status indicators
3. Configuration examples and documentation

**Effort**: ~28 hours

### v0.14.0+: Advanced Features (Future)

**Potential Features:**

1. Entity relationships and dependencies
2. Timeline visualizations
3. Custom metrics per entity type
4. Entity hierarchies

---

## Open Questions

1. **Should we support entity hierarchies?**
   - Example: `api/v1` and `api/v2` as sub-entities of `api`
   - **Recommendation**: Defer to v0.14.0+ based on user feedback

2. **How to handle monitoring for processes?**
   - Could monitor an endpoint that returns process health
   - **Recommendation**: Make monitoring optional per entity (some entities don't need it)

3. **Entity relationships/dependencies?**
   - Example: "Black Friday Sale depends on payment-system and inventory-api"
   - **Recommendation**: Add in v0.14.0 as advanced feature

4. **Custom metrics ingestion?**
   - Allow users to push custom metrics (completion rates, SLA %)
   - **Recommendation**: Start with issue-based metrics, add webhook support in v0.14.0+

---

## Next Steps

1. **Review Proposal**
   - Approve simplified approach (no backward compatibility)
   - Confirm breaking change acceptable for v0.11.0

2. **Begin Implementation**
   - Create GitHub issues for Phase 1 tasks
   - Set up feature branch for development
   - Run migration script on amiable-docusaurus

3. **Documentation**
   - Update README with entity configuration
   - Create entity type reference docs
   - Add configuration examples to ENTITY-MODEL-IMPLEMENTATION.md

4. **Release Plan**
   - v0.11.0: Direct entity model (4 weeks, ~32 hours)
   - v0.12.0: Enhanced features (3 weeks, ~25 hours)
   - v0.13.0: Custom status logic (4 weeks, ~28 hours)
   - v0.14.0+: Advanced features (future)

---

## Conclusion

The Entity model significantly expands the plugin's applicability beyond infrastructure monitoring to business processes, projects, events, and custom tracking.

**Key Success Factors:**

- ✅ **Simplified implementation** - No backward compatibility complexity
- ✅ **Minimal migration** - One config file update (15 minutes)
- ✅ **No data migration** - Existing status files work unchanged
- ✅ **Clean architecture** - Entity model from day one
- ✅ **Extensible design** - Supports future entity types and features

**Recommendation**: Proceed with **direct entity model approach** in v0.11.0, leveraging the fact that there are no external users to simplify implementation.

**Total Effort**: ~85 hours (vs ~120 hours with backward compatibility)

**Timeline**: ~11 weeks for first 3 phases

---

**End of Proposal**
