# Migration Assessment - Visual Summary

## Current Test Site Configuration

```
test-status-site/docusaurus.config.ts
│
└─ Plugin Configuration
   │
   └─ systemLabels: ['website', 'documentation', 'build-system', 'ci-cd', 'api']
      │
      ├─ 5 tracked systems
      ├─ Configuration string format
      └─ Needs conversion to Entity[]
```

## Status Data Files (No Migration Needed)

```
test-status-site/status-data/
│
├─ current.json          → Uses 'svc' field (service names)
│  └─ 10 readings       → No systemLabels dependency
│
├─ incidents.json        → Uses 'affectedSystems' array
│  └─ 2 incidents       → No systemLabels dependency
│
└─ maintenance.json      → Uses 'affectedSystems' array
   └─ 1 maintenance     → No systemLabels dependency

✅ All files are system-agnostic - Ready for entity migration
```

## systemLabels Usage Map

```
Plugin Code Impact:
├─ src/types.ts
│  └─ PluginOptions.systemLabels?: string[]        [CONFIG INPUT]
│
├─ src/options.ts
│  ├─ DEFAULT_OPTIONS.systemLabels = []             [DEFAULTS]
│  └─ pluginOptionsSchema validation                [VALIDATION]
│
├─ src/index.ts
│  ├─ Line 166: Destructure systemLabels           [EXTRACTION]
│  ├─ Line 340: Pass to GitHubStatusService        [API FETCH]
│  └─ Line 399: Pass to GitHubStatusService        [FALLBACK]
│
└─ src/github-service.ts
   ├─ Line 52: Constructor parameter               [INITIALIZATION]
   ├─ Line 107: Filter issue labels                [LABEL MATCHING]
   ├─ Line 140: Initialize status items            [SYSTEM INIT]
   └─ Line 273: Extract maintenance systems        [MAINTENANCE]

Scripts:
└─ scripts/update-status.cjs
   └─ CLI argument parsing --system-labels         [CLI ARGS]
```

## Migration Path: systemLabels → entities

```
BEFORE (Current):
┌──────────────────────────────────────────────┐
│ systemLabels: [                              │
│   'website',                                 │
│   'documentation',                           │
│   'build-system',                            │
│   'ci-cd',                                   │
│   'api'                                      │
│ ]                                            │
└──────────────────────────────────────────────┘

AFTER (Proposed):
┌──────────────────────────────────────────────────────────┐
│ entities: [                                              │
│   {                                                      │
│     name: 'website',                                    │
│     type: 'system',                                     │
│     displayName: 'Website'                              │
│   },                                                     │
│   {                                                      │
│     name: 'documentation',                              │
│     type: 'system',                                     │
│     displayName: 'Documentation'                        │
│   },                                                     │
│   {                                                      │
│     name: 'build-system',                               │
│     type: 'system',                                     │
│     displayName: 'Build System'                         │
│   },                                                     │
│   {                                                      │
│     name: 'ci-cd',                                      │
│     type: 'system',                                     │
│     displayName: 'CI/CD Pipeline'                       │
│   },                                                     │
│   {                                                      │
│     name: 'api',                                        │
│     type: 'system',                                     │
│     displayName: 'API Service'                          │
│   }                                                      │
│ ]                                                        │
└──────────────────────────────────────────────────────────┘

Migration Effort: ~15 minutes
```

## GitHub Workflows (No Changes Needed)

```
monitor-systems.yml
├─ Uses .monitorrc.json configuration          ✅ No systemLabels dependency
├─ Creates issues with system name labels      ✅ Independent of systemLabels
└─ No configuration update needed

status-update.yml
├─ Fetches issues with 'status' label          ✅ No systemLabels dependency
├─ Processes issues from GitHub API            ✅ System names from labels
└─ No configuration update needed

.monitorrc.json (template)
├─ Defines systems independently                ✅ No systemLabels dependency
└─ No changes needed
```

## Label Matching Flow (Before vs After)

```
BEFORE (systemLabels):
┌────────────────────────────────────────────────┐
│ GitHub Issue                                   │
│ Labels: ['status', 'website', 'critical']     │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│ Filter against systemLabels:                   │
│ ['website', 'documentation', 'build-system',   │
│  'ci-cd', 'api']                               │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│ Result: affectedSystems: ['website']           │
└────────────────────────────────────────────────┘

AFTER (entities):
┌────────────────────────────────────────────────┐
│ GitHub Issue                                   │
│ Labels: ['status', 'website', 'critical']     │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│ Filter against entity names:                   │
│ Entity[].map(e => e.name) = ['website',        │
│   'documentation', 'build-system', 'ci-cd',   │
│   'api']                                       │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────┐
│ Result: affectedSystems: ['website']           │
└────────────────────────────────────────────────┘

Logic identical - just source is different
```

## Implementation Phases

```
PHASE 1: Foundation (v0.11.0)
├─ ✅ Add Entity type definitions
├─ ✅ Create EntityAdapter for conversion
├─ ✅ Support both systemLabels and entities
├─ ✅ Deprecation warnings for systemLabels
└─ ✅ No breaking changes for users

PHASE 2: Full Support (v0.12.0)
├─ ✅ Update all documentation
├─ ✅ Provide migration tooling
├─ ✅ Both formats work identically
└─ ✅ Continue warnings in logs

PHASE 3: Cleanup (v0.13.0+)
├─ ✅ Remove systemLabels support
├─ ✅ entities only
└─ ✅ Breaking change (but 2-3 releases for migration)
```

## Migration Impact by Component

```
HIGH PRIORITY (Need updates):
├─ test-site/docusaurus.config.ts          [15 min - straightforward config change]
├─ src/types.ts                            [1h - add Entity types]
└─ src/options.ts                          [30 min - update schema]

MEDIUM PRIORITY (Moderate effort):
├─ src/index.ts                            [1h - adapt to entities]
├─ src/github-service.ts                   [30 min - accept systemNames array]
└─ Tests                                   [1h - update fixtures]

LOW PRIORITY (No changes):
├─ .monitorrc.json                         [✅ No changes]
├─ GitHub workflows                        [✅ No changes]
├─ status-data/ files                      [✅ No changes]
└─ CLI scripts (initially)                 [⚠️ Support both formats]

Total Effort: 4-5 hours for full migration + testing
```

## Critical Files Summary

```
File Location                           Current Role              Migration Status
────────────────────────────────────────────────────────────────────────────────
docusaurus.config.ts (test-site)        Config entry point        ⚠️ UPDATE
src/types.ts                            Type definitions          ⚠️ ADD TYPES
src/options.ts                          Validation schema         ⚠️ UPDATE
src/index.ts                            Plugin orchestration      ⚠️ REFACTOR
src/github-service.ts                   Core logic                ✅ Minimal change
scripts/update-status.cjs               CLI tool                  ✅ Minimal change
.monitorrc.json (template)              Monitoring config         ✅ No change
status-data/*.json                      Data files                ✅ No change
monitor-systems.yml (template)          GitHub workflow           ✅ No change
status-update.yml (template)            GitHub workflow           ✅ No change
────────────────────────────────────────────────────────────────────────────────
```

## Data Compatibility Matrix

```
                    current.json  incidents.json  maintenance.json
systemLabels-based      ✅             ✅              ✅
entity-based            ✅             ✅              ✅
hybrid configs          ✅             ✅              ✅

Legend: ✅ = Fully compatible, no migration needed
```

## Risk Assessment

```
RISK: Configuration Breaking Change
├─ Severity: HIGH
├─ Impact: Users must update docusaurus.config.ts
├─ Mitigation: Soft deprecation + migration script
└─ Effort to fix: ~15 minutes per user

RISK: Issue Label Matching
├─ Severity: MEDIUM
├─ Impact: Labels must match entity names
├─ Mitigation: Clear migration guide + validation
└─ Effort to fix: ~5 minutes per repo

RISK: Data Loss
├─ Severity: LOW
├─ Impact: None - data files are system-agnostic
├─ Mitigation: N/A - automatic compatibility
└─ Effort to fix: N/A

RISK: Workflow Breaking
├─ Severity: LOW
├─ Impact: Workflows continue working unchanged
├─ Mitigation: N/A - backward compatible
└─ Effort to fix: N/A
```

## Decision Matrix

```
If dropping backward compatibility immediately:
├─ User friction: HIGH
├─ Implementation time: 4-5 hours
├─ Testing burden: HIGH
├─ Support requests: HIGH
└─ Risk of breakage: MEDIUM

If soft deprecation (2-3 releases):
├─ User friction: LOW
├─ Implementation time: 6-8 hours (phased)
├─ Testing burden: MEDIUM
├─ Support requests: LOW
└─ Risk of breakage: LOW

RECOMMENDATION: ✅ Soft deprecation approach
```

## Files to Create/Modify Summary

```
NEW Files:
├─ src/entity-adapter.ts                 [conversion logic]
├─ src/entity-manager.ts                 [entity operations]
├─ __tests__/entity-adapter.test.ts      [test coverage]
├─ MIGRATION_GUIDE.md                    [user documentation]
└─ MIGRATION_ASSESSMENT.md               [this analysis]

MODIFIED Files:
├─ src/types.ts                          [+Entity interface]
├─ src/options.ts                        [+entities schema]
├─ src/index.ts                          [+EntityAdapter usage]
├─ src/github-service.ts                 [param rename]
├─ test-status-site/docusaurus.config.ts [systemLabels→entities]
├─ __tests__/plugin.test.ts              [update fixtures]
├─ README.md                             [document entities]
└─ QUICKSTART.md                         [update examples]

UNCHANGED Files:
├─ scripts/update-status.cjs             [supports both]
├─ .monitorrc.json (template)            [independent]
├─ test-status-site/status-data/*        [system-agnostic]
├─ templates/workflows/*                 [label-based]
└─ [all other files]
```

## Quick Reference: What Breaks?

```
✅ What STILL WORKS after migration:
├─ All status data files (current.json, incidents.json, maintenance.json)
├─ GitHub workflows (monitor-systems.yml, status-update.yml)
├─ .monitorrc.json configuration
├─ CLI tools (with backward compat)
├─ Issue label system
└─ Monitoring and incident tracking

❌ What BREAKS if you drop backward compat immediately:
├─ docusaurus.config.ts files using systemLabels
├─ Custom plugins depending on systemLabels parameter
└─ Any hardcoded systemLabels references

✅ What WE CAN PROTECT with soft deprecation:
├─ Gradual migration over 2-3 releases
├─ Automatic conversion with EntityAdapter
├─ Clear migration guides and warnings
├─ Backward compatibility fallback
└─ Zero data loss or workflow changes
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Current test site systems | 5 |
| Test site config size | ~500 bytes |
| Status data files affected | 0 of 3 |
| Core plugin files affected | 4 |
| Test files affected | 2 |
| Migration effort (test site) | ~15 minutes |
| Total migration effort | 4-5 hours |
| Risk level | LOW |
| User impact | LOW-MEDIUM |
| Data loss risk | NONE |

