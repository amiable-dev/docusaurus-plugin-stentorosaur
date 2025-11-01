# Contributing to Docusaurus Status Plugin

Thank you for your interest in contributing to the Docusaurus Status Plugin! This guide will help you get started with development and testing.

## Development Setup

### Prerequisites

- Node.js 18.x or 20.x
- npm or yarn
- Git

### Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/your-username/docusaurus-plugin-stentorosaur.git
cd docusaurus-plugin-stentorosaur
```

2. **Install dependencies**

```bash
npm install
```

3. **Build the project**

```bash
npm run build
```

This runs two steps:
- `tsc --build` - Compiles TypeScript to JavaScript in `lib/`
- `node copyUntypedFiles.js` - Copies CSS files to `lib/`

**Important**: Never edit files in `lib/` directly - they're generated. Always edit `src/` and rebuild.

4. **Run tests**

```bash
npm test                 # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

## Project Structure

```
docusaurus-plugin-stentorosaur/
├── src/                           # Source code
│   ├── index.ts                   # Plugin lifecycle and orchestration
│   ├── github-service.ts          # GitHub API integration
│   ├── demo-data.ts              # Demo/fallback data
│   ├── types.ts                  # TypeScript interfaces
│   ├── options.ts                # Configuration schema
│   └── theme/                    # React components
│       ├── StatusPage/
│       ├── StatusBoard/
│       ├── StatusItem/
│       └── IncidentHistory/
├── scripts/                      # CLI tools
│   └── update-status.cjs         # Status update CLI
├── templates/                    # User-facing templates
│   ├── workflows/                # GitHub Actions workflows
│   └── ISSUE_TEMPLATE/           # GitHub issue templates
├── __tests__/                    # Test suites
│   ├── demo-data.test.ts
│   ├── options.test.ts
│   ├── github-service.test.ts
│   ├── plugin.test.ts
│   └── update-status.test.ts
└── lib/                          # Generated build output (git ignored)
```

## Testing

### Test Coverage Requirements

The project maintains high test coverage standards enforced in CI:

- **Minimum**: 70% for all metrics (branches, functions, lines, statements)
- **Current**: ~95% overall coverage

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- __tests__/plugin.test.ts

# Run tests in watch mode during development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Structure

Tests are organized into focused suites:

1. **Demo Data Tests** (`demo-data.test.ts`)
   - Validates demo data structure
   - Ensures realistic test scenarios

2. **Plugin Options Tests** (`options.test.ts`)
   - Validates configuration schemas
   - Tests option combinations and edge cases

3. **GitHub Service Tests** (`github-service.test.ts`)
   - Mocks GitHub API interactions
   - Tests data fetching and transformation

4. **Plugin Integration Tests** (`plugin.test.ts`)
   - Tests full plugin lifecycle
   - Validates Docusaurus integration points

5. **CLI Script Tests** (`update-status.test.ts`)
   - Tests standalone CLI tool
   - Validates command-line arguments and behavior

### Writing Tests

When adding new features:

1. Add tests before implementing the feature (TDD approach recommended)
2. Mock external services (GitHub API, file system when appropriate)
3. Test both success and error scenarios
4. Maintain or improve code coverage
5. Use descriptive test names that explain the scenario

Example test structure:

```typescript
describe('Feature Name', () => {
  describe('specific scenario', () => {
    it('should behave in expected way', () => {
      // Arrange
      const input = setupTestData();
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

## Continuous Integration

GitHub Actions CI runs on every push and pull request:

- ✅ Tests against Node.js 18.x and 20.x
- ✅ Enforces code coverage thresholds (70% minimum)
- ✅ Validates TypeScript compilation
- ✅ Runs on Ubuntu latest

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for CI configuration.

CI must pass before pull requests can be merged.

## Development Workflow

### Making Changes

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

Edit files in `src/` (never edit `lib/` directly)

3. **Add/update tests**

Ensure your changes are covered by tests in `__tests__/`

4. **Run tests locally**

```bash
npm test
```

5. **Build the project**

```bash
npm run build
```

6. **Verify everything works**

```bash
# Run all tests with coverage
npm run test:coverage

# Check TypeScript compilation
npx tsc --noEmit
```

7. **Commit your changes**

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in status calculation"
git commit -m "docs: update configuration examples"
```

8. **Push and create a pull request**

```bash
git push origin feature/your-feature-name
```

### Testing Your Changes Locally

To test the plugin in a real Docusaurus project:

1. **Build the plugin**

```bash
npm run build
```

2. **Link the package locally**

```bash
npm link
```

3. **In your Docusaurus test project**

```bash
cd /path/to/your/docusaurus/project
npm link @amiable-dev/docusaurus-plugin-stentorosaur
```

4. **Configure and test**

Add the plugin to your `docusaurus.config.js` and run:

```bash
npm start  # Development server
npm run build  # Production build
```

## Code Style

- **TypeScript**: Use TypeScript for all new code
- **Strict mode**: Code must compile with `strict: true`
- **Formatting**: Follow existing code style
- **Comments**: Add JSDoc comments for public APIs
- **Naming**: Use descriptive variable and function names

## Plugin Architecture

### Docusaurus Plugin Lifecycle

The plugin follows standard Docusaurus plugin architecture with three critical phases:

1. **`loadContent()`** - Fetches GitHub Issues via Octokit, transforms to StatusData, writes to `status.json`
2. **`contentLoaded()`** - Creates `/status` route, passes data as props to React components
3. **`postBuild()`** - Copies status data to build output for client-side access

### Key Files

- **`src/index.ts`** - Plugin orchestration and lifecycle hooks
- **`src/github-service.ts`** - GitHub API integration (Octokit wrapper)
- **`src/types.ts`** - TypeScript interfaces for StatusItem, StatusIncident, StatusData
- **`src/theme/*`** - Swizzleable React components (StatusPage, StatusBoard, StatusItem, IncidentHistory)

### Adding New Configuration Options

1. Add to `PluginOptions` interface in `src/types.ts`
2. Add default value in `src/options.ts` DEFAULT_OPTIONS
3. Add Joi validation in `src/options.ts` pluginOptionsSchema
4. Use in `src/index.ts` plugin lifecycle
5. Add tests in `__tests__/options.test.ts`
6. Document in README.md

### Creating New Theme Components

1. Create in `src/theme/ComponentName/index.tsx` + `styles.module.css`
2. Export component with proper TypeScript types
3. Add to `getSwizzleComponentList()` in `src/index.ts` for user customization
4. CSS files MUST use `.module.css` extension (CSS Modules)
5. Remember: Build copies CSS via `copyUntypedFiles.js`

## Pull Request Process

1. **Ensure CI passes**: All tests must pass and coverage requirements met
2. **Update documentation**: Update README.md, CONFIGURATION.md, or other docs as needed
3. **Add changelog entry**: Add your changes to CHANGELOG.md under `[Unreleased]`
4. **Request review**: Tag maintainers for review
5. **Address feedback**: Make requested changes and push updates
6. **Squash commits**: Maintainers will squash commits when merging

## Release Process

Releases are handled by maintainers using an automated GitHub Actions workflow.

### Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes to public API
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, backward compatible

### Publishing Workflow

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format
3. Commit: `git commit -m "chore: Release vX.Y.Z"`
4. Tag: `git tag vX.Y.Z && git push && git push --tags`
5. GitHub Actions automatically publishes to npm

**Note**: Never run `npm publish` locally - always use the automated workflow.

## Getting Help

- **Issues**: Open an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check README.md, CONFIGURATION.md, and inline code comments

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
