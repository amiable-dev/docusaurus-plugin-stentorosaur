# Publishing Guide for docusaurus-plugin-stentorosaur

This guide outlines the process for publishing beta and stable releases to npm.

## Prerequisites

Before publishing, ensure you have:

1. **npm Account**: Create an account at <https://www.npmjs.com> if you don't have one
2. **npm Authentication**: Be logged in via `npm login`
3. **Repository Access**: Write access to the GitHub repository
4. **Clean Working Directory**: All changes committed and pushed

## Pre-Publishing Checklist

- [ ] All tests pass: `npm test`
- [ ] Coverage meets thresholds (>70% for all metrics)
- [ ] TypeScript compiles without errors: `npm run build`
- [ ] No uncommitted changes: `git status`
- [ ] Updated CHANGELOG (if exists)
- [ ] Version number is correct in `package.json`
- [ ] README.md is up to date

## Beta Release Process (Pre-1.0.0)

### 1. Verify Current State

```bash
# Ensure you're on the main branch
git checkout main
git pull origin main

# Verify clean state
git status

# Check current version
npm version
```

### 2. Run Tests and Build

```bash
# Run full test suite
npm test

# Run with coverage to verify thresholds
npm run test:coverage

# Build the package
npm run build

# Verify build output
ls -la lib/
```

### 3. Update Version for Beta

Current version: `0.1.0-beta.0`

For subsequent beta releases:

```bash
# For bug fixes: 0.1.0-beta.0 → 0.1.0-beta.1
npm version prerelease --preid=beta

# For new features: 0.1.0-beta.0 → 0.2.0-beta.0
npm version preminor --preid=beta

# For breaking changes: 0.1.0-beta.0 → 0.2.0-beta.0
npm version premajor --preid=beta
```

This will:

- Update `package.json` version
- Create a git commit
- Create a git tag

### 4. Verify Package Contents

Before publishing, check what will be included:

```bash
# Dry run to see what would be published
npm pack --dry-run

# Create actual tarball for inspection
npm pack

# Extract and inspect
tar -xzf docusaurus-plugin-stentorosaur-*.tgz
ls -la package/
```

Verify that:

- `lib/` directory is included
- `src/` directory is NOT included
- `__tests__/` is NOT included
- `coverage/` is NOT included
- Only `README.md` is included (no other .md files)

### 5. Publish Beta to npm

```bash
# Publish with beta tag
npm publish --tag beta --access public

# Verify publication
npm view docusaurus-plugin-stentorosaur
npm view docusaurus-plugin-stentorosaur dist-tags
```

### 6. Push Git Changes

```bash
# Push commits and tags
git push origin main
git push origin --tags
```

### 7. Test Beta Installation

In a separate test project:

```bash
# Create test directory
mkdir /tmp/test-plugin-beta
cd /tmp/test-plugin-beta

# Initialize test project
npm init -y

# Install beta version
npm install @amiable-dev/docusaurus-plugin-stentorosaur@beta

# Verify installation
npm list @amiable-dev/docusaurus-plugin-stentorosaur
```

Test in actual Docusaurus project:

```bash
# In your Docusaurus project
npm install @amiable-dev/docusaurus-plugin-stentorosaur@beta

# Or specify exact version
npm install @amiable-dev/docusaurus-plugin-stentorosaur@0.1.0-beta.0
```

## Stable Release Process (1.0.0+)

### When to Release Stable

Release 1.0.0 when:

- All planned features are complete
- Documentation is comprehensive
- No critical bugs remain
- Beta testing completed successfully
- Breaking API changes are finalized

### 1. Update to Stable Version

```bash
# Remove beta designation
npm version 1.0.0

# Or use npm's versioning
npm version major  # For 1.0.0
```

### 2. Update Package Metadata

Ensure `package.json` has:

- Correct `version` (without -beta)
- Updated `description`
- All `keywords` relevant for npm search
- Valid `repository`, `bugs`, `homepage` URLs

### 3. Publish to Latest Tag

```bash
# Build
npm run build

# Publish as latest (default tag)
npm publish --access public

# Verify
npm view docusaurus-plugin-stentorosaur
```

### 4. Create GitHub Release

1. Go to GitHub repository
2. Click "Releases" → "Draft a new release"
3. Tag: `v1.0.0`
4. Title: "v1.0.0 - Initial Stable Release"
5. Description: Include changelog, breaking changes, migration guide
6. Publish release

## Version Management Strategy

### Beta Versions (0.x.x-beta.x)

- Use for testing and feedback
- Breaking changes allowed
- Document changes in commit messages
- Tag with `beta` on npm

### Stable Versions (1.x.x)

After 1.0.0, follow semantic versioning:

- **Patch** (1.0.1): Bug fixes, no breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes

## npm Commands Reference

```bash
# Login to npm
npm login

# Check login status
npm whoami

# View package info
npm view @amiable-dev/docusaurus-plugin-stentorosaur

# View all versions
npm view @amiable-dev/docusaurus-plugin-stentorosaur versions

# View dist-tags
npm view @amiable-dev/docusaurus-plugin-stentorosaur dist-tags

# Unpublish (within 72 hours)
npm unpublish @amiable-dev/docusaurus-plugin-stentorosaur@0.1.0-beta.0

# Deprecate a version
npm deprecate @amiable-dev/docusaurus-plugin-stentorosaur@0.1.0-beta.0 "Use 0.1.0-beta.1 instead"
```

## Troubleshooting

### "You do not have permission to publish"

- Verify you're logged in: `npm whoami`
- Check you have access to the package scope
- For first publish, package name might be taken

### "Version already exists"

- You cannot republish the same version
- Increment version: `npm version patch`

### "Package not found" after publishing

- Wait a few minutes for npm CDN propagation
- Clear npm cache: `npm cache clean --force`
- Try accessing via unpkg: `https://unpkg.com/@amiable-dev/docusaurus-plugin-stentorosaur@beta/`

### Build files missing from package

- Check `.npmignore` is correct
- Ensure `lib/` is not ignored
- Run `npm pack --dry-run` to preview contents

## Post-Publishing Tasks

After successful publish:

- [ ] Update documentation website (if exists)
- [ ] Announce on GitHub Discussions/Issues
- [ ] Update examples to use new version
- [ ] Monitor npm download stats
- [ ] Watch for issues from early adopters

## Security Considerations

1. **Never commit** npm tokens to git
2. **Use 2FA** on npm account
3. **Audit dependencies**: `npm audit`
4. **Review package contents** before publishing
5. **Unpublish quickly** if credentials leaked

## Resources

- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [Semantic Versioning](https://semver.org/)
- [npm version command](https://docs.npmjs.com/cli/v9/commands/npm-version)
- [npm dist-tags](https://docs.npmjs.com/cli/v9/commands/npm-dist-tag)
