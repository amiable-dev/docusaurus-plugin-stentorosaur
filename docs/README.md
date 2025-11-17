# Documentation Index

This directory contains comprehensive documentation for the Docusaurus Status Plugin (Stentorosaur).

## Quick Access

**New to the project?** Start with the root-level documentation:
- [README.md](../README.md) - Project overview and installation
- [QUICKSTART.md](../QUICKSTART.md) - Get started in 5 minutes
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute
- [CHANGELOG.md](../CHANGELOG.md) - Version history

## Directory Structure

### `/architecture` - System Design Documentation

Understanding how the plugin works internally:

- [ARCHITECTURE-INDEX.md](./architecture/ARCHITECTURE-INDEX.md) - Overview of architectural documentation
- [ARCHITECTURE-SUMMARY.md](./architecture/ARCHITECTURE-SUMMARY.md) - High-level system design
- [ARCHITECTURE-ANALYSIS.md](./architecture/ARCHITECTURE-ANALYSIS.md) - Detailed technical analysis

**When to read:** Understanding internal design, making architectural decisions, or contributing significant features.

### `/setup` - Advanced Setup Guides

Step-by-step guides for specific deployment scenarios:

- [ORPHANED_BRANCH_SETUP.md](./setup/ORPHANED_BRANCH_SETUP.md) - Upptime-style status-data branch configuration
- [TRUSTED_PUBLISHING_SETUP.md](./setup/TRUSTED_PUBLISHING_SETUP.md) - npm OIDC publishing configuration
- [PUBLISHING.md](./setup/PUBLISHING.md) - Release and publishing workflow

**When to read:** Setting up production deployments, configuring CI/CD, or preparing for release.

### `/reference` - Feature Documentation

Detailed documentation for specific features:

- [CONFIGURATION.md](./reference/CONFIGURATION.md) - Complete configuration options reference
- [TESTING.md](./reference/TESTING.md) - Testing strategy and guidelines
- [MONITORING_SYSTEM.md](./reference/MONITORING_SYSTEM.md) - Automated monitoring architecture
- [NOTIFICATIONS.md](./reference/NOTIFICATIONS.md) - Real-time notification system (Slack, Telegram, Email, Discord)

**When to read:** Implementing specific features, configuring advanced options, or troubleshooting.

### `/archive` - Historical Documentation

Legacy documentation preserved for reference:

- [CODE-REFERENCE-GUIDE.md](./archive/CODE-REFERENCE-GUIDE.md) - Legacy code navigation guide
- [PROJECT_SUMMARY.md](./archive/PROJECT_SUMMARY.md) - Original project summary (superseded by README)
- [NOTIFICATION-SYSTEM-SUMMARY.md](./archive/NOTIFICATION-SYSTEM-SUMMARY.md) - Notification implementation notes
- [UPPTIME_CONFIGURATION_COMPARISON.md](./archive/UPPTIME_CONFIGURATION_COMPARISON.md) - Upptime vs Stentorosaur comparison

**When to read:** Historical context, understanding legacy design decisions, or migration reference.

## Documentation by Use Case

### I want to...

**Get started quickly**
→ [QUICKSTART.md](../QUICKSTART.md)

**Understand what the plugin does**
→ [README.md](../README.md)

**Configure all available options**
→ [docs/reference/CONFIGURATION.md](./reference/CONFIGURATION.md)

**Set up automated monitoring**
→ [docs/reference/MONITORING_SYSTEM.md](./reference/MONITORING_SYSTEM.md)

**Add notification alerts**
→ [docs/reference/NOTIFICATIONS.md](./reference/NOTIFICATIONS.md)

**Deploy to production with GitHub Pages**
→ [README.md#github-actions-setup](../README.md#github-actions-setup)

**Use an orphaned branch for status data**
→ [docs/setup/ORPHANED_BRANCH_SETUP.md](./setup/ORPHANED_BRANCH_SETUP.md)

**Contribute to the project**
→ [CONTRIBUTING.md](../CONTRIBUTING.md)

**Understand the architecture**
→ [docs/architecture/ARCHITECTURE-INDEX.md](./architecture/ARCHITECTURE-INDEX.md)

**Write tests**
→ [docs/reference/TESTING.md](./reference/TESTING.md)

**Publish a new version**
→ [docs/setup/PUBLISHING.md](./setup/PUBLISHING.md)

## Maintenance

### Keeping Documentation Current

Documentation should be updated whenever:
- ✅ New features are added
- ✅ Configuration options change
- ✅ Workflows are modified
- ✅ Breaking changes occur
- ✅ Best practices evolve

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on updating documentation.

### Documentation Standards

All documentation in this repository follows these standards:

1. **Markdown Format** - GitHub-flavored markdown
2. **Clear Headers** - Hierarchical structure with descriptive titles
3. **Code Examples** - Working examples for all features
4. **Cross-References** - Links to related documentation
5. **Version Context** - Note when features were added (e.g., "v0.5.0+")
6. **Current State** - Reflect the actual implementation, not future plans

## Need Help?

- **Issues**: [GitHub Issues](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues)
- **Discussions**: [GitHub Discussions](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/discussions)
- **Support**: See [SUPPORT.md](../SUPPORT.md)
