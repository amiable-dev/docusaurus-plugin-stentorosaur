# Docusaurus Status Plugin - AI Agent Instructions

## Project Overview
This is a **Docusaurus v3 plugin** that creates an Upptime-style status monitoring dashboard powered by GitHub Issues and Actions. It's distributed as `@amiable-dev/docusaurus-plugin-stentorosaur` on npm.

**Core Purpose**: Enable teams to track both technical system status (APIs, databases) AND business process issues (onboarding, deployments) directly in their Docusaurus documentation sites.

## Architecture Pattern: Docusaurus Plugin Lifecycle

This plugin follows the standard Docusaurus plugin architecture with three critical phases:

1. **`loadContent()`** - Fetches GitHub Issues via Octokit, transforms to StatusData, writes to `status.json`
2. **`contentLoaded()`** - Creates `/status` route, passes data as props to React components
3. **`postBuild()`** - Copies status data to build output for client-side access

**Key Files**:
- `src/index.ts` - Plugin orchestration and lifecycle hooks
- `src/github-service.ts` - GitHub API integration (Octokit wrapper)
- `src/types.ts` - TypeScript interfaces for StatusItem, StatusIncident, StatusData
- `src/theme/*` - Swizzleable React components (StatusPage, StatusBoard, StatusItem, IncidentHistory)

## Critical Conventions

### Build Process
```bash
npm run build  # Compiles TypeScript AND copies CSS files
```
**Important**: Build is TWO steps:
1. `tsc --build` → Compiles `.ts` to `lib/`
2. `node copyUntypedFiles.js` → Copies `.css` files (TypeScript ignores these)

Never modify `lib/` directly - it's generated. Always edit `src/` and rebuild.

### Demo Data Fallback Pattern
```typescript
// src/index.ts loadContent()
let shouldUseDemoData = useDemoData ?? !token;  // Default: true if no token

if (shouldUseDemoData) {
  const demoData = getDemoStatusData();
  items = showServices ? demoData.items : [];
  incidents = showIncidents ? demoData.incidents : [];
} else {
  try {
    const service = new GitHubStatusService(token, owner, repo, statusLabel, entities, labelScheme);
    const result = await service.fetchStatusData();
    // ... fallback to demo if no data found
  }
}
```
**Pattern**: Always provide usable demo data when GitHub token missing or API fails. This enables development/testing without credentials.

### Issue Label Mapping (v0.11.0+)
GitHub Issues are converted to status using specific labels:

**Required**: `status` label identifies status-tracking issues
**Severity**: `critical`, `major`, `minor`, `maintenance` → determines StatusIncident.severity
**Entities**: Labels matching entity names (namespaced like `system:api` or legacy like `api`) → affects which entities show "down"/"degraded"

```typescript
// src/github-service.ts convertIssueToIncident()
let severity: StatusIncident['severity'] = 'minor';
if (labels.includes('critical')) severity = 'critical';
// ... determines status badge color and priority

// v0.11.0+: LabelParser extracts entities from labels
const labelParser = new LabelParser(entities, labelScheme);
const affectedEntities = labelParser.parseIssueLabels(labels);
// Returns: ['api', 'database'] if labels include 'system:api', 'system:database'
```

### Status Calculation Logic (v0.11.0+)
```typescript
// src/github-service.ts generateStatusItems()
// 1. Initialize all entities as 'up'
// 2. For each OPEN incident:
//    - Extract affected entities via LabelParser
//    - If severity='critical' → status='down'
//    - If severity='major'/'minor' → status='degraded'
//    - If severity='maintenance' → status='maintenance'
// 3. Worst status wins (down > degraded > maintenance > up)
```

## Scheduled Maintenance System

### Maintenance Data Flow
```
GitHub Issue (with maintenance label + YAML frontmatter)
  ↓
GitHubStatusService.fetchScheduledMaintenance()
  ↓
Parse YAML frontmatter (extractFrontmatter in maintenance-utils.ts)
  ↓
Determine status (getMaintenanceStatus in maintenance-utils.ts)
  ↓
Generate maintenance.json
  ↓
Plugin loads and filters by config (enabled, displayDuration)
  ↓
Display in MaintenanceList/MaintenanceItem components
```

### Maintenance Issue Format
```yaml
---
start: 2025-01-12T02:00:00Z  # ISO 8601 format, UTC recommended
end: 2025-01-12T04:00:00Z
systems:
  - api
  - database
---

Maintenance description...
```

**Labels**: `maintenance` (or custom labels from `scheduledMaintenance.labels` config)

### Maintenance Status Determination
```typescript
// src/maintenance-utils.ts getMaintenanceStatus()
// If issue.state === 'closed' → 'completed'
// Else if now >= start && now <= end → 'in-progress'
// Else if now < start → 'upcoming'
// Else → 'completed'
```

### Maintenance-Aware Monitoring
**Key Implementation**: During active maintenance windows (status='in-progress'):
- `scripts/monitor.js` skips uptime monitoring for affected systems
- `templates/workflows/monitor-systems.yml` prevents incident creation
- Avoids polluting performance data with abnormal metrics

```typescript
// scripts/monitor.js checkMaintenanceWindow()
function checkMaintenanceWindow(systemName, outputDir) {
  // Reads maintenance.json
  // Checks if system is in active maintenance (status='in-progress')
  // Returns { inMaintenance: boolean, maintenanceId, maintenanceTitle }
}
```

### Configuration Options
```typescript
scheduledMaintenance: {
  enabled: true,                    // Enable/disable maintenance tracking
  label: 'maintenance',             // Single label (deprecated)
  labels: ['maintenance', 'planned'], // Multiple labels (preferred)
  displayDuration: 30,              // Show completed maintenance for N days
  timezone: 'America/New_York',     // Display timezone (default: 'UTC')
}
```

**Implementation Details**:
- `enabled: false` → maintenance array set to `[]` in plugin
- `displayDuration` → filters completed maintenance older than N days
- `timezone` → used by `formatDateInTimezone()` and `formatShortDate()` utilities
- `labels` takes precedence over `label`

### Key Files for Maintenance
- `src/maintenance-utils.ts` - Utility functions (frontmatter parsing, status determination, timezone formatting)
- `src/github-service.ts` - `fetchScheduledMaintenance()`, `fetchMaintenanceIssues()`
- `src/theme/Maintenance/MaintenanceList/` - List component
- `src/theme/Maintenance/MaintenanceItem/` - Individual maintenance card
- `scripts/monitor.js` - Maintenance window awareness
- `templates/workflows/monitor-systems.yml` - Skip monitoring during maintenance

## Testing Requirements

**Coverage Thresholds**: 70% for branches/functions/lines/statements (enforced in CI)
**Current Coverage**: ~95% overall (see `jest.config.js`)

### Test Structure
```bash
__tests__/
├── demo-data.test.ts      # Validates demo data structure
├── options.test.ts        # Plugin configuration schema
├── github-service.test.ts # GitHub API mocking
└── plugin.test.ts         # Full plugin lifecycle
```

**When modifying code**:
1. Run `npm test` locally before pushing
2. Update mocks in tests if changing GitHub API calls
3. Theme components (`.tsx` in `src/theme/`) are excluded from coverage (need jsdom)

### Mock Pattern
```typescript
// __tests__/github-service.test.ts
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    issues: {
      listForRepo: jest.fn().mockResolvedValue({data: mockIssues}),
    },
  })),
}));
```
Always mock `@octokit/rest` - never make real API calls in tests.

## Common Development Tasks

### Adding a New Configuration Option
1. Add to `PluginOptions` interface in `src/types.ts`
2. Add default value in `src/options.ts` DEFAULT_OPTIONS
3. Add Joi validation in `src/options.ts` pluginOptionsSchema
4. Use in `src/index.ts` plugin lifecycle
5. Add tests in `__tests__/options.test.ts`

Example: The `showServices` option is consumed in:
```typescript
// src/index.ts loadContent()
const statusData: StatusData = {
  items,
  incidents,
  lastUpdated: new Date().toISOString(),
  showServices,  // ← passed to StatusData
  showIncidents,
};
```

### Creating a New Theme Component
1. Create in `src/theme/ComponentName/index.tsx` + `styles.module.css`
2. Export component with proper TypeScript types
3. Add to `getSwizzleComponentList()` in `src/index.ts` for user customization
4. CSS files MUST use `.module.css` extension (CSS Modules)
5. Remember: Build copies CSS via `copyUntypedFiles.js`

### Modifying GitHub Data Fetching
Edit `src/github-service.ts` GitHubStatusService class:
- `fetchStatusIssues()` - Octokit API call
- `convertIssueToIncident()` - Issue → StatusIncident transform
- `generateStatusItems()` - Aggregate logic for system status

**Always maintain demo data compatibility** - update `src/demo-data.ts` if changing data structure.

## External Dependencies

**Docusaurus-Specific**:
- `@docusaurus/core`, `@docusaurus/types` - Plugin API
- `@docusaurus/utils` - `normalizeUrl()` for route creation
- Must use `@theme/Layout` wrapper for pages

**External Services**:
- `@octokit/rest` v20+ - GitHub API client
- Requires `GITHUB_TOKEN` env var or `token` config for private repos
- Rate limit: 5000/hour authenticated, 60/hour unauthenticated

**Build Tools**:
- TypeScript 5.x with `strict: true`
- Jest 30.x with ts-jest preset
- `fs-extra` for file operations (async preferred: `ensureDir`, `writeJson`)

## Debugging Tips

**Plugin not loading**:
- Check `owner`/`repo` config - falls back to `siteConfig.organizationName`/`projectName`
- Verify TypeScript compilation succeeded: `npm run build`

**Status data not updating**:
- Check generated file: `.docusaurus/docusaurus-plugin-stentorosaur/status.json`
- Verify GitHub token has repo access
- Look for `[docusaurus-plugin-stentorosaur]` console logs during build

**CSS not applied**:
- Ensure `copyUntypedFiles.js` ran after TypeScript compilation
- Check `lib/theme/**/*.css` files exist
- CSS Modules: Use `import styles from './styles.module.css'` pattern

## Publishing Workflow

**Automated Publishing via GitHub Actions** - `.github/workflows/publish.yml` automatically publishes to npm when a git tag is pushed.

### Release Process
1. Update `version` in `package.json` following Semantic Versioning rules
2. Update `CHANGELOG.md` following Keep a Changelog format:
   - Move `[Unreleased]` section items to new version heading `## [X.Y.Z] - YYYY-MM-DD`
   - Add version comparison link at bottom
   - Keep `[Unreleased]` section for future changes
3. Commit: `git commit -m "chore: Bump version to X.Y.Z"` or `git commit -m "fix: ..."` / `git commit -m "feat: ..."`
4. Create and push tag: `git tag vX.Y.Z && git push && git push --tags`
5. **GitHub Actions automatically publishes to npm** - no manual `npm publish` needed!

**Trusted Publishing**: Uses npm OIDC tokens (requires npm 11.5.1+ in workflow). No manual npm tokens needed.

**Important**: 
- Never run `npm publish` locally - always use GitHub Actions workflow
- Tag must match version in package.json (e.g., tag `v0.1.5` for version `"0.1.5"`)
- Workflow triggered only on tag push, not regular commits

### Semantic Versioning (SemVer) Rules

Given version number **MAJOR.MINOR.PATCH** (e.g., `2.3.1`):

1. **MAJOR** (X.0.0) - Increment when making **incompatible API changes**
   - Breaking changes to public API
   - Removing features or functionality
   - Changing behavior in backward-incompatible ways
   - Example: Removing a plugin option, changing required parameters
   - Reset MINOR and PATCH to 0

2. **MINOR** (x.Y.0) - Increment when adding **functionality in backward compatible manner**
   - New features or options added
   - Deprecating functionality (without removing it)
   - Substantial improvements to internal code
   - Example: Adding new CLI flags, new configuration options
   - Reset PATCH to 0

3. **PATCH** (x.y.Z) - Increment when making **backward compatible bug fixes**
   - Bug fixes that don't change API
   - Internal refactoring
   - Documentation updates
   - Example: Fixing workflow templates, ES module compatibility

**Pre-release versions**: Use hyphen suffix (e.g., `1.0.0-alpha`, `1.0.0-beta.1`, `2.0.0-rc.1`)
- Lower precedence than normal versions
- Indicates unstable, might not satisfy compatibility requirements

**Initial development**: Major version zero (`0.y.z`) is for initial development
- Anything may change at any time
- Public API should not be considered stable
- Version `1.0.0` defines the first stable public API

**Version `1.0.0`**: Release when:
- Software is used in production
- Stable API exists that users depend on
- Backward compatibility becomes important

### CHANGELOG.md Best Practices

**Format**: Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

**Structure**:
```markdown
# Changelog

## [Unreleased]
### Added
- New feature coming soon

## [1.2.0] - 2025-11-01
### Added
- New feature description
### Changed
- Changes to existing functionality
### Deprecated
- Soon-to-be removed features
### Removed
- Now removed features
### Fixed
- Bug fixes
### Security
- Security vulnerability fixes

[Unreleased]: https://github.com/owner/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/owner/repo/compare/v1.1.0...v1.2.0
```

**Change Types** (in order):
1. `Added` - New features
2. `Changed` - Changes in existing functionality
3. `Deprecated` - Soon-to-be removed features (use before Removed)
4. `Removed` - Now removed features
5. `Fixed` - Bug fixes
6. `Security` - Vulnerability fixes

**Guiding Principles**:
- Changelogs are for **humans, not machines**
- One entry per version
- Group same types of changes together
- Versions and sections should be linkable
- Latest version comes first (reverse chronological)
- Use ISO 8601 date format: `YYYY-MM-DD`
- Reference issue numbers: `(#123)` or `(GH-123)`

**What NOT to include**:
- Git commit logs or diffs (too noisy)
- Typo fixes or minor documentation tweaks (unless significant)
- Internal refactoring that doesn't affect users
- Changes to test files (unless affecting API)

**Unreleased section**:
- Keep at top to track upcoming changes
- Helps people see what's coming
- Easy to move to new version section at release time

**Version links**:
- Always include comparison links at bottom
- Format: `[version]: https://github.com/owner/repo/compare/vPREV...vCURRENT`
- Makes it easy to see exact code changes

## Workflow Templates

The plugin provides GitHub Actions workflow templates in `templates/workflows/` that users can copy to their `.github/workflows/` directory:

- `monitor-systems.yml` - Automated health check monitoring for systems/endpoints
- `status-update.yml` - Updates status data files in build directory

**Important**: These templates include required `permissions:` block:
```yaml
permissions:
  issues: write   # Required for creating/closing issues and adding comments
  contents: read  # Required for checking out repository
```

Without `issues: write` permission, workflows will fail with "Resource not accessible by integration" error when attempting to create issues, add comments, or close issues.

**Template Usage**:
1. Users copy template from `node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/`
2. Customize system URLs, labels, and cron schedules
3. Ensure `permissions:` block is included in workflow file
4. Commit to `.github/workflows/` in their project

## Documentation Structure and Rules

**IMPORTANT**: All code changes require documentation review and updates. Follow the documentation organization rules defined in `DOCUMENTATION_REORGANIZATION_SUMMARY.md`.

### Documentation Organization (v0.14.0+)

The project follows a structured documentation layout:

```text
Root Directory (Collaboration & Quick Start)
├── README.md ⭐ Main documentation
├── QUICKSTART.md ⭐ 5-minute setup guide
├── CONTRIBUTING.md ⭐ Contribution guidelines
├── DOCS.md ⭐ Navigation hub
├── CODE_OF_CONDUCT.md, SECURITY.md, SUPPORT.md
├── CHANGELOG.md, CLAUDE.md

docs/
├── README.md - Directory index
├── reference/ - Feature documentation (CONFIGURATION, MONITORING_SYSTEM, NOTIFICATIONS, TESTING)
├── setup/ - Advanced setup guides (ORPHANED_BRANCH_SETUP, PUBLISHING, TRUSTED_PUBLISHING_SETUP)
├── architecture/ - System design docs (ARCHITECTURE-INDEX, ARCHITECTURE-SUMMARY, ARCHITECTURE-ANALYSIS)
└── archive/ - Legacy documentation
```

### Documentation Update Rules

**When adding new code features:**

1. **Update relevant documentation** based on change type:
   - New features → Update `README.md` + `docs/reference/CONFIGURATION.md`
   - New configuration options → Update `docs/reference/CONFIGURATION.md`
   - Monitoring changes → Update `docs/reference/MONITORING_SYSTEM.md`
   - Notification changes → Update `docs/reference/NOTIFICATIONS.md`
   - Testing changes → Update `docs/reference/TESTING.md`
   - Breaking changes → Update `README.md` + `CHANGELOG.md` + affected reference docs

2. **Add version notes** for new features:
   ```markdown
   **New in v0.15.0**: Description of feature
   ```

3. **Update CHANGELOG.md** under `[Unreleased]` section:
   - `Added` - New features
   - `Changed` - Changes to existing functionality
   - `Fixed` - Bug fixes
   - `Deprecated` - Soon-to-be removed features
   - `Removed` - Removed features
   - `Security` - Security fixes

4. **Check and update cross-references**:
   - Verify all internal links still work
   - Update links if files moved or renamed
   - Use relative paths: `./docs/reference/CONFIGURATION.md`

5. **Update code examples**:
   - Ensure all examples in documentation reflect current implementation
   - Test examples actually work
   - Include TypeScript types where applicable

### Where to Add New Documentation

**Reference Documentation** (features, APIs, configuration):
- Add to `docs/reference/`
- Examples: New plugin options, API methods, feature guides

**Setup Guides** (deployment, CI/CD, advanced configuration):
- Add to `docs/setup/`
- Examples: New workflow templates, deployment strategies, environment setup

**Architecture Documentation** (design, technical analysis):
- Add to `docs/architecture/`
- Examples: Design decisions, system architecture changes, technical deep-dives

**Collaboration Documentation** (CODE_OF_CONDUCT, SECURITY, etc.):
- Keep in root directory
- Examples: Governance, security policies, contribution guidelines

### Documentation Review Checklist

Before committing code changes, verify:

- [ ] All affected documentation files updated
- [ ] Version notes added for new features
- [ ] CHANGELOG.md updated under `[Unreleased]`
- [ ] Code examples tested and working
- [ ] Cross-references verified (no broken links)
- [ ] DOCS.md updated if adding new doc files
- [ ] Markdownlint issues resolved

### Key Documentation Files

**Root Level (Always Check First)**:
- `README.md` - Main documentation, installation, configuration
- `QUICKSTART.md` - Getting started guide
- `CHANGELOG.md` - Version history (update with every change)
- `DOCS.md` - Navigation hub for all documentation

**Reference Documentation (`docs/reference/`)**:
- `CONFIGURATION.md` - Complete configuration options
- `MONITORING_SYSTEM.md` - Monitoring architecture and setup
- `NOTIFICATIONS.md` - Alert system configuration
- `TESTING.md` - Testing guidelines and scenarios

**Setup Guides (`docs/setup/`)**:
- `ORPHANED_BRANCH_SETUP.md` - Status data branch configuration
- `TRUSTED_PUBLISHING_SETUP.md` - npm publishing setup
- `PUBLISHING.md` - Release workflow

**Architecture (`docs/architecture/`)**:
- `ARCHITECTURE-INDEX.md` - Architecture overview
- `ARCHITECTURE-SUMMARY.md` - High-level design
- `ARCHITECTURE-ANALYSIS.md` - Technical analysis

### Documentation Standards

All documentation must follow these standards:

1. **GitHub-flavored Markdown** with proper formatting
2. **Clear hierarchical headers** with descriptive titles
3. **Working code examples** for all features
4. **Cross-references** to related documentation
5. **Version context** for new features (e.g., "v0.5.0+")
6. **Current implementation** - reflect actual codebase state
7. **Markdownlint compliance** - no linting errors

### Common Documentation Update Scenarios

**Adding a new configuration option:**
1. Update `docs/reference/CONFIGURATION.md` with option details
2. Update `README.md` if it's a major feature
3. Add example usage
4. Update CHANGELOG.md
5. Add version note

**Adding a new feature:**
1. Update `README.md` features list
2. Create or update relevant reference doc
3. Add to QUICKSTART.md if simple to use
4. Update CHANGELOG.md
5. Add version note

**Fixing a bug:**
1. Update CHANGELOG.md under `### Fixed`
2. Update docs if behavior changed
3. No version note needed for bug fixes

**Breaking change:**
1. Update all affected documentation
2. Add migration guide in CHANGELOG.md
3. Update SEMVER (bump MAJOR version)
4. Add prominent warning in README.md

### Documentation Maintenance

**Before Every Commit:**
- Review documentation changes alongside code changes
- Test all code examples in documentation
- Verify no broken links introduced
- Run markdownlint to catch formatting issues

**Before Every Release:**
- Move `[Unreleased]` items in CHANGELOG.md to new version
- Update version notes throughout documentation
- Verify all examples work with new version
- Check DOCS.md navigation is current

When answering questions, reference these docs for authoritative information.
