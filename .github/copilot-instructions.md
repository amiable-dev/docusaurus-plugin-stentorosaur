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
    const service = new GitHubStatusService(token, owner, repo, statusLabel, systemLabels);
    const result = await service.fetchStatusData();
    // ... fallback to demo if no data found
  }
}
```
**Pattern**: Always provide usable demo data when GitHub token missing or API fails. This enables development/testing without credentials.

### Issue Label Mapping
GitHub Issues are converted to status using specific labels:

**Required**: `status` label identifies status-tracking issues
**Severity**: `critical`, `major`, `minor`, `maintenance` → determines StatusIncident.severity
**Systems**: Labels matching `systemLabels` config → affects which systems show "down"/"degraded"

```typescript
// src/github-service.ts convertIssueToIncident()
let severity: StatusIncident['severity'] = 'minor';
if (labels.includes('critical')) severity = 'critical';
// ... determines status badge color and priority
```

### Status Calculation Logic
```typescript
// src/github-service.ts generateStatusItems()
// 1. Initialize all systemLabels as 'up'
// 2. For each OPEN incident:
//    - If severity='critical' → status='down'
//    - If severity='major'/'minor' → status='degraded'
//    - If severity='maintenance' → status='maintenance'
// 3. Worst status wins (down > degraded > maintenance > up)
```

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
1. Update `version` in `package.json` (e.g., `0.1.5`)
2. Update `CHANGELOG.md`:
   - Move `[Unreleased]` section to new version heading
   - Add version link at bottom
3. Commit: `git commit -m "chore: Bump version to X.Y.Z"`
4. Create and push tag: `git tag vX.Y.Z && git push && git push --tags`
5. **GitHub Actions automatically publishes to npm** - no manual `npm publish` needed!

**Trusted Publishing**: Uses npm OIDC tokens (requires npm 11.5.1+ in workflow). No manual npm tokens needed.

**Important**: 
- Never run `npm publish` locally - always use GitHub Actions workflow
- Tag must match version in package.json (e.g., tag `v0.1.5` for version `"0.1.5"`)
- Workflow triggered only on tag push, not regular commits

## Key Documentation Files
- `README.md` - User-facing installation/configuration guide
- `CONFIGURATION.md` - Detailed config examples
- `PROJECT_SUMMARY.md` - Architecture diagrams and file structure
- `TESTING.md` - Test scenarios for configuration options
- `QUICKSTART.md` - Minimal setup guide

When answering questions, reference these docs for authoritative information.
