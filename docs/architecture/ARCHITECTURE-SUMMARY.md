# Stentorosaur Architecture Analysis - Executive Summary

## Document Overview

This folder contains a comprehensive analysis of the Stentorosaur plugin's system-centric architecture:

1. **ARCHITECTURE-ANALYSIS.md** - Detailed breakdown of design patterns, assumptions, and constraints
2. **ARCHITECTURE-DIAGRAM.txt** - Visual diagrams showing data flow and component relationships
3. **CODE-REFERENCE-GUIDE.md** - Line-by-line code locations for every system-centric assumption
4. **ARCHITECTURE-SUMMARY.md** - This document

## Quick Summary

The `docusaurus-plugin-stentorosaur` plugin is **fundamentally organized around systems as first-class entities**. Every component assumes:

### Core Principle
- Systems are defined upfront via `systemLabels` configuration
- Each system has a unique name that serves as a global identifier
- GitHub issues link to systems via label matching
- Incidents/maintenance affect systems by referencing their names
- Status is calculated per-system from incident severity

### Data Model
```typescript
StatusItem {
  name: string,              // System identifier (REQUIRED)
  status: StatusItemStatus,
  ...metrics
}

StatusIncident {
  affectedSystems: string[], // References system names
  ...
}

ScheduledMaintenance {
  affectedSystems: string[], // References system names
  ...
}
```

### Data Flow
```
systemLabels (config)
    ↓
GitHub Issues with labels
    ↓
convertIssueToIncident() [Label matching]
    ↓
generateStatusItems() [Initialize from systemLabels]
    ↓
StatusItem[] with status based on incidents
    ↓
Monitoring data grouped by system
    ↓
Routes created for each system
    ↓
Components display system-specific data
```

## What's System-Centric

### 1. Configuration
- `systemLabels: string[]` defines all possible systems
- Empty array = no systems configured
- No alternative definition mechanism (except direct `sites` config)

### 2. GitHub Integration
- Issue labels matched against `systemLabels` exactly
- Matching labels → `affectedSystems` field
- Issues without system labels ignored for status

### 3. Status Calculation
- All systems from `systemLabels` always appear
- Only open incidents affect status
- Severity hierarchy: critical > major/minor > maintenance > up
- Closed incidents ignored

### 4. Monitoring Data
- Readings grouped by `svc` (service/system name)
- Must match a system name or appear orphaned
- One set of metrics per system

### 5. File Organization
- `status-data/systems/{system-name}.json` per system
- `current.json` with `svc` field for grouping
- One route per system: `/status/history/{slug}`

### 6. UI Components
- `StatusBoard`: Iterates over systems
- `StatusPage`: Loads data for each system
- `StatusHistory`: Displays single system
- `PerformanceMetrics`: Charts for one system

## Key Hard Constraints

### Constraint 1: Name-Based Identification
System names are used as:
- GitHub label values (must match exactly)
- File names (sanitized with slug conversion)
- Route parameters
- Monitoring data keys (the `svc` field)
- Property lookups in maps

If ANY of these don't match, data fragments.

### Constraint 2: Label-Based Linking
- Only mechanism to link issues to systems
- Exact match required (case-sensitive)
- No hierarchical labels
- No alternative linking mechanism

### Constraint 3: Single-Level Hierarchy
- Systems are atomic units
- No grouping into categories
- No subsystems or versions
- Flat array of StatusItems

### Constraint 4: Configuration Time Definition
- All systems must be defined in config
- No dynamic system creation
- Cannot add systems at runtime
- Systems without incidents still appear

### Constraint 5: Per-System Performance Files
- Each system expects one historical data file
- File must exist for system to have charts
- Chart data keyed by system name
- No aggregation across systems

## Extension Points (What You Can Change)

### Current Extension Points
1. **Swizzle Components** - Customize UI for systems
2. **Direct Site Config** - Define systems via `sites` array instead of labels
3. **Chart Annotations** - Overlay events on charts
4. **Demo Data** - Provide custom demo systems

### What's NOT Easily Extensible
1. **Data Model** - `affectedSystems` hardcoded throughout
2. **Issue Linking** - Always label-based
3. **Routing** - Always system-specific pages
4. **Monitoring** - Always keyed by system name
5. **Status Calculation** - Always from open incidents

## To Support Alternative Models

To use this plugin for tracking things OTHER than systems (e.g., business processes, features, deployments), you would need to:

1. **Redesign data structures**
   - Add indirection layer: Entity → System(s) → Incidents
   - Create generic entity type

2. **Redesign GitHub integration**
   - Support hierarchical labels (e.g., "process/onboarding")
   - Parse labels to extract entity → systems mapping
   - Or use issue body parsing instead of labels

3. **Redesign routing**
   - Support entity-specific routes beyond `/status/history/{slug}`
   - Handle entities that aggregate multiple systems

4. **Redesign file organization**
   - Support grouping that cuts across systems
   - Create composite views

5. **Redesign components**
   - Make StatusBoard/StatusPage generic entity-aware
   - Support nested display (entity → systems → metrics)

## Code Locations Quick Reference

| What | Where | Lines |
|------|-------|-------|
| Configuration Schema | src/options.ts | 14, 57 |
| Type Definitions | src/types.ts | 33-77 |
| GitHub Linking | src/github-service.ts | 106-108 |
| Status Generation | src/github-service.ts | 136-178 |
| Monitoring Grouping | src/index.ts | 79-89, 247-257 |
| Route Creation | src/index.ts | 547-562 |
| Component Display | src/theme/StatusBoard/index.tsx | 61-72 |
| System File Loading | src/theme/StatusPage/index.tsx | 41-127 |
| Route-to-File Mapping | src/theme/StatusHistory/index.tsx | 28-53 |
| Metrics Display | src/theme/PerformanceMetrics/index.tsx | 69-80 |

## Files Included

```
docusaurus-plugin-stentorosaur/
├── ARCHITECTURE-ANALYSIS.md      ← Full analysis of design patterns
├── ARCHITECTURE-DIAGRAM.txt      ← Visual data flow diagrams
├── CODE-REFERENCE-GUIDE.md       ← Line-by-line code locations
├── ARCHITECTURE-SUMMARY.md       ← This file
│
├── src/
│   ├── types.ts                 ← StatusItem, StatusIncident types
│   ├── options.ts               ← systemLabels configuration
│   ├── github-service.ts        ← GitHub issue to system linking
│   ├── index.ts                 ← Plugin orchestration
│   └── theme/
│       ├── StatusBoard/         ← System list display
│       ├── StatusPage/          ← Main status page
│       ├── StatusHistory/       ← System-specific history
│       └── PerformanceMetrics/  ← System metrics charts
│
└── ... (other files)
```

## Key Takeaways

1. **The plugin is optimized for monitoring technical systems/services**
   - Assumes one-to-one mapping between label and system
   - Assumes systems are the primary entity
   - Designed around HTTP health checks

2. **Systems are the primary organizing principle**
   - Configuration: systemLabels
   - Data model: StatusItem.name
   - GitHub linking: issue labels → system names
   - Monitoring: readings grouped by svc
   - Routing: one route per system
   - UI: one card per system

3. **Name matching is critical**
   - System name must match everywhere
   - Label must match systemLabel exactly
   - Slug must derive from system name deterministically
   - File must be named after system

4. **Status is always system-centric**
   - Incidents reference affected systems
   - Status calculated per-system
   - Charts show system's historical data
   - Severity hierarchy applied per-system

5. **To extend beyond systems, significant refactoring needed**
   - Not designed for nested entities
   - Not designed for non-name-based linking
   - Not designed for dynamic entity creation
   - Would require new data model and workflows

## Recommendations for Users

### If You Want to Track Systems
- This plugin is perfect for you
- Configure `systemLabels` with your systems
- Create GitHub issues with system labels and severity labels
- Set up monitoring that generates `current.json`

### If You Want to Track Business Processes
- Consider whether processes can be modeled as "systems"
- Or create one "fake system" per process and track manually
- This plugin likely needs significant extension

### If You Want Dynamic Entity Creation
- You'll need to fork and refactor significantly
- Create your own entity management system
- Redesign GitHub integration

### If You Want Multiple Levels of Hierarchy
- Not well-supported by current architecture
- Would need major changes to data model, routing, and components
- Consider workarounds (e.g., nested naming: "api-v1", "api-v2")

## Related Documents

See the companion documents for detailed information:

- **ARCHITECTURE-ANALYSIS.md** - Full technical breakdown
- **ARCHITECTURE-DIAGRAM.txt** - Visual representations of data flow
- **CODE-REFERENCE-GUIDE.md** - Specific code locations and line numbers
