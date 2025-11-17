# Publishing Guide for docusaurus-plugin-stentorosaur

This guide outlines the process for publishing beta and stable releases to npm.

## Overview

Publishing is fully automated via GitHub Actions using a two-workflow system:

1. **release.yml** - Triggered on git tag push → Creates GitHub Release with changelog
2. **publish.yml** - Triggered when GitHub Release is published → Publishes to npm with trusted publishing

**You never run `npm publish` locally** - all publishing happens via GitHub Actions.

## Prerequisites

Before publishing, ensure you have:

1. **GitHub Repository Access**: Write access to push tags
2. **GitHub Personal Access Token (GH_PAT)**: Required for creating releases
   - Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Create token with "Contents" write permission for the repository
   - Add as repository secret: Settings → Secrets → Actions → New secret: `GH_PAT`
3. **npm Trusted Publishing**: Configured for @amiable-dev scope (see [TRUSTED_PUBLISHING_SETUP.md](./TRUSTED_PUBLISHING_SETUP.md))
4. **Clean Working Directory**: All changes committed and pushed

## Pre-Publishing Checklist

- [ ] All tests pass: `npm test`
- [ ] Coverage meets thresholds (>70% for all metrics)
- [ ] TypeScript compiles without errors: `npm run build`
- [ ] No uncommitted changes: `git status`
- [ ] Updated CHANGELOG (if exists)
- [ ] Version number is correct in `package.json`
- [ ] README.md is up to date

## Automated Release Process

### Overview of Workflow

```text
Developer creates tag → Push tag → release.yml runs → Creates GitHub Release
                                                    ↓
                                            publish.yml triggered
                                                    ↓
                                            Publishes to npm
```

### Step-by-Step Release Process

**1. Update version in package.json**

```bash
# Edit package.json manually or use npm version
# Example: "version": "0.14.0" → "0.15.0"
```

**2. Update CHANGELOG.md**

Add a new version section:

```markdown
## [0.15.0] - 2025-11-14

### Added
- New feature description

### Changed
- Updated behavior description

### Fixed
- Bug fix description
```

**3. Commit changes**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: Bump version to 0.15.0"
```

**4. Create and push git tag**

```bash
# Create tag matching package.json version
git tag v0.15.0

# Push commit and tag
git push origin main
git push origin v0.15.0
```

**5. GitHub Actions takes over**

- `release.yml` workflow triggers on tag push
- Extracts changelog for this version
- Creates GitHub Release (marked as pre-release if version < 1.0.0)
- `publish.yml` workflow triggers when release is published
- Runs tests, builds package, publishes to npm with trusted publishing

**6. Monitor workflow**

Go to repository → Actions tab → Watch workflows complete

**7. Verify publication**

```bash
# Check npm
npm view @amiable-dev/docusaurus-plugin-stentorosaur

# Check GitHub releases
# Visit: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/releases
```

### Testing Published Version

In a test project:

```bash
# Create test directory
mkdir /tmp/test-plugin-release
cd /tmp/test-plugin-release

# Initialize test project
npm init -y

# Install latest version
npm install @amiable-dev/docusaurus-plugin-stentorosaur

# Or install specific version
npm install @amiable-dev/docusaurus-plugin-stentorosaur@0.15.0

# Verify installation
npm list @amiable-dev/docusaurus-plugin-stentorosaur
```

## Stable Release Process (1.0.0+)

### When to Release Stable

Release 1.0.0 when:

- All planned features are complete
- Documentation is comprehensive
- No critical bugs remain
- Beta testing completed successfully (v0.x.x versions)
- Breaking API changes are finalized

### Releasing 1.0.0

Same process as above, but:

1. Update `package.json` version to `1.0.0`
2. Update CHANGELOG.md with comprehensive release notes
3. Commit changes: `git commit -m "chore: Release v1.0.0"`
4. Create tag: `git tag v1.0.0`
5. Push: `git push origin main && git push origin v1.0.0`
6. GitHub Actions automatically creates release and publishes to npm
7. Release will NOT be marked as pre-release (version >= 1.0.0)

### Post-1.0.0 Versioning

After 1.0.0, follow semantic versioning strictly:

- **Patch** (1.0.1): Bug fixes, no breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes

Same automated process for all versions - just create the tag.

## Version Management Strategy

### Pre-1.0.0 Versions (0.x.x)

- Use for development and testing
- Breaking changes allowed
- All releases marked as pre-release on GitHub
- Document changes in CHANGELOG.md

### Post-1.0.0 Versions

Follow strict semantic versioning:

- **Patch** (1.0.1): Bug fixes, no breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes

## Useful npm Commands

```bash
# View package info
npm view @amiable-dev/docusaurus-plugin-stentorosaur

# View all published versions
npm view @amiable-dev/docusaurus-plugin-stentorosaur versions

# View dist-tags
npm view @amiable-dev/docusaurus-plugin-stentorosaur dist-tags

# Deprecate a version (if needed)
npm deprecate @amiable-dev/docusaurus-plugin-stentorosaur@0.14.0 "Use 0.15.0 instead"
```

## GitHub Actions Workflows

### release.yml Workflow

**Trigger**: Push git tag matching `v*`

**What it does**:

1. Extracts version from tag (removes 'v' prefix)
2. Determines if pre-release (version < 1.0.0)
3. Extracts changelog section for this version from CHANGELOG.md
4. Creates GitHub Release with `gh release create`
5. Uses `GH_PAT` secret for authentication

**Required Secret**: `GH_PAT` (GitHub Personal Access Token with Contents write permission)

### publish.yml Workflow

**Trigger**: GitHub release published event

**What it does**:

1. Checks out code
2. Installs dependencies with `npm ci`
3. Runs tests with `npm test`
4. Builds package with `npm run build`
5. Publishes to npm using trusted publishing (OIDC)

**Required Setup**: npm trusted publishing configured for @amiable-dev scope

## Troubleshooting

### Workflow fails at "Create GitHub Release"

**Error**: `gh: error creating release: HTTP 401`

**Solution**: Check `GH_PAT` secret exists and has Contents write permission

### Workflow fails at "Publish to npm"

**Error**: `npm ERR! code EUNKNOWN`

**Solution**: Ensure npm trusted publishing is configured correctly (see [TRUSTED_PUBLISHING_SETUP.md](./TRUSTED_PUBLISHING_SETUP.md))

### Tag pushed but no release created

**Solution**: Check Actions tab for workflow errors. Ensure tag matches `v*` pattern.

### Release created but npm publish failed

**Solution**: Check publish.yml workflow logs. Common issues:
- Tests failing
- Build errors
- Trusted publishing not configured

### "Package not found" after publishing

- Wait a few minutes for npm CDN propagation
- Clear npm cache: `npm cache clean --force`
- Check unpkg: `https://unpkg.com/@amiable-dev/docusaurus-plugin-stentorosaur/`

## Post-Publishing Tasks

After successful publish:

- [ ] Update documentation website (if exists)
- [ ] Announce on GitHub Discussions/Issues
- [ ] Update examples to use new version
- [ ] Monitor npm download stats
- [ ] Watch for issues from early adopters

## Security Considerations

1. **GH_PAT Secret**: Store GitHub Personal Access Token only in repository secrets, never commit to git
2. **Trusted Publishing**: Uses OIDC tokens (no long-lived npm tokens needed)
3. **Use 2FA** on npm account (required for trusted publishing)
4. **Audit dependencies**: `npm audit` (runs in CI)
5. **Review package contents**: Check `.npmignore` to ensure only `lib/` and necessary files are included

## Resources

- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [Semantic Versioning](https://semver.org/)
- [npm version command](https://docs.npmjs.com/cli/v9/commands/npm-version)
- [npm dist-tags](https://docs.npmjs.com/cli/v9/commands/npm-dist-tag)
