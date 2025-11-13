# Contributing to Stentorosaur

First off, thank you for considering contributing to Stentorosaur! It's people like you that make open source such a great community.

## Quick Links

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Workflow](#development-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@amiable.dev](mailto:conduct@amiable.dev).

## Acknowledgment: Built on Upptime

Stentorosaur is built on the foundation of [Upptime](https://github.com/upptime/upptime) by [Anand Chowdhary](https://github.com/AnandChowdhary). We've ported and extended their brilliant work for Docusaurus integration. If you're interested in standalone status pages, consider contributing to Upptime directly.

## Getting Started

### Prerequisites

- **Node.js** 20.0 or higher
- **npm** or **yarn**
- **Git**
- Basic knowledge of TypeScript, React, and Docusaurus

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/docusaurus-plugin-stentorosaur.git
cd docusaurus-plugin-stentorosaur

# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test

# Test in the example site
cd ../test-status-site
npm install
npm start
```

### Repository Structure

```
docusaurus-plugin-stentorosaur/
├── src/                    # TypeScript source code
│   ├── theme/             # React components
│   ├── notifications/     # Notification providers
│   └── index.ts          # Plugin entry point
├── __tests__/             # Jest tests
├── scripts/               # CLI tools
├── templates/             # Workflow templates
└── lib/                   # Compiled output (generated)
```

See [CLAUDE.md](CLAUDE.md) for detailed developer documentation.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues) to avoid duplicates.

**When filing a bug report, include:**

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Environment details:**
  - Plugin version
  - Docusaurus version
  - Node.js version
  - Operating system
- **Screenshots** if applicable
- **Error messages** or logs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml).

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml).

**Include:**

- **Clear use case** - Why is this enhancement needed?
- **Proposed solution** - How should it work?
- **Alternatives considered** - What other approaches did you think about?
- **Additional context** - Screenshots, examples, etc.

### Your First Contribution

Look for issues labeled:
- [`good first issue`](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/labels/good%20first%20issue) - Good for newcomers
- [`help wanted`](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/labels/help%20wanted) - Extra attention needed
- [`documentation`](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/labels/documentation) - Improve docs

### Pull Requests

We actively welcome your pull requests!

**Before submitting:**
1. Search existing PRs to avoid duplicates
2. For large changes, open an issue first to discuss
3. Fork the repo and create your branch from `main`
4. Follow the [Development Workflow](#development-workflow)

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

Use prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `test/` - Test improvements
- `refactor/` - Code refactoring

### 2. Make Changes

- Write clear, documented code
- Add tests for new functionality
- Update documentation as needed
- Follow [Coding Guidelines](#coding-guidelines)

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Build the plugin
npm run build

# Test in example site
cd ../test-status-site
npm start
```

### 4. Commit Changes

Follow [Commit Guidelines](#commit-guidelines):

```bash
git add .
git commit -m "feat: Add notification retry logic"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Coding Guidelines

### TypeScript

- **Strict mode enabled** - No implicit `any`
- **Prefer interfaces over types** for object shapes
- **Use discriminated unions** for type-safe event handling
- **Document complex logic** with JSDoc comments
- **Avoid non-null assertions** (`!`) unless absolutely necessary

```typescript
// Good
interface StatusItem {
  name: string;
  status: 'up' | 'down' | 'degraded';
  lastCheck: string;
}

// Avoid
type StatusItem = {
  name: any; // ❌ Use specific types
  status: string; // ❌ Use literal types
};
```

### React Components

- **Functional components only** - No class components
- **Use hooks** - `useState`, `useEffect`, etc.
- **CSS Modules** for styling (`styles.module.css`)
- **Accessibility** - Include ARIA labels, keyboard navigation
- **Props interfaces** - Always define prop types

```tsx
// Good
interface StatusCardProps {
  name: string;
  status: 'up' | 'down';
  onRefresh?: () => void;
}

export function StatusCard({ name, status, onRefresh }: StatusCardProps) {
  return (
    <div className={styles.card} role="status" aria-label={`${name} status`}>
      {/* ... */}
    </div>
  );
}
```

### Testing

- **Jest + ts-jest** for testing
- **Mock external APIs** - Never make real API calls
- **Aim for 80%+ coverage**
- **Test edge cases** and error conditions
- **Clear test names** - Describe what's being tested

```typescript
// Good
describe('GitHubStatusService', () => {
  describe('fetchStatusIssues()', () => {
    it('should return empty array when no issues exist', async () => {
      // Test implementation
    });

    it('should handle API errors gracefully', async () => {
      // Test implementation
    });
  });
});
```

### File Organization

- **One component per file** - `StatusCard.tsx`, not `Components.tsx`
- **Co-locate styles** - `StatusCard.tsx` + `styles.module.css` in same folder
- **Group related code** - Keep notifications code in `src/notifications/`
- **Tests mirror source** - `src/foo.ts` → `__tests__/foo.test.ts`

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Build process, tooling, dependencies

### Examples

```bash
feat(notifications): Add Telegram provider
fix(charts): Handle DST transitions correctly
docs(readme): Update installation instructions
test(github-service): Add tests for maintenance parsing
chore(deps): Upgrade Chart.js to v4.5.0
```

### Scope

Use component/module names:
- `notifications`
- `charts`
- `github-service`
- `monitoring`
- `workflows`

### Subject

- Use imperative mood ("Add feature" not "Added feature")
- Don't capitalize first letter
- No period at the end
- Keep under 72 characters

### Body (optional)

- Explain *why* not *what*
- Wrap at 72 characters
- Reference issues: `Fixes #123`, `Closes #456`

### Breaking Changes

Indicate breaking changes in footer:

```
feat(config): Change entities config format

BREAKING CHANGE: The `systemLabels` config option has been removed.
Use `entities` instead. Migration script: `scripts/migrate-config.js`
```

## Pull Request Process

### PR Checklist

Before submitting, ensure:

- [ ] Tests added/updated and passing (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] TypeScript types correct (no `any`, proper exports)
- [ ] Documentation updated (README, CHANGELOG, JSDoc)
- [ ] Commit messages follow conventions
- [ ] No merge conflicts with `main`
- [ ] PR description explains changes clearly

### PR Template

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) which includes:

- **Type of change** (bug fix, feature, docs, etc.)
- **Related issue(s)**
- **Description** of changes
- **Testing** performed
- **Screenshots** (if UI changes)
- **Checklist** of requirements

### Review Process

1. **Automated checks** - CI must pass (tests, build, linting)
2. **Code review** - Maintainers review code, architecture, tests
3. **Feedback** - Address review comments, iterate as needed
4. **Approval** - At least one maintainer approval required
5. **Merge** - Maintainers merge approved PRs

### After Merge

- Your contribution will be mentioned in the next release notes
- Significant contributors may be invited to the maintainers team
- Thank you! 🎉

## Recognition

Contributors are:
- Listed in [README.md](README.md#contributors)
- Mentioned in [CHANGELOG.md](CHANGELOG.md) release notes
- Given co-author credit in commits
- Thanked in release announcements

## Questions?

- Read [CLAUDE.md](CLAUDE.md) for developer documentation
- Check [existing issues](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues)
- Ask in [GitHub Discussions](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/discussions)
- Email maintainers: [maintainers@amiable.dev](mailto:maintainers@amiable.dev)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Stentorosaur! 🦖
