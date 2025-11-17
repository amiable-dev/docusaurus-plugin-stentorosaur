# Documentation Guide

Welcome to the Docusaurus Status Plugin (Stentorosaur) documentation! This guide will help you find the information you need.

## 🚀 Quick Start

**New to Stentorosaur?** Start here:

1. **[README.md](./README.md)** - Project overview, features, and installation
2. **[QUICKSTART.md](./QUICKSTART.md)** - Get your status page running in 5 minutes
3. **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Want to contribute? Start here

## 📚 Documentation Structure

### Root-Level Documentation (Start Here)

Essential documentation for all users:

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [README.md](./README.md) | Complete feature guide, installation, and configuration | First read for new users |
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute setup guide | When you want to get started fast |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Development setup and contribution guidelines | Before contributing code |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Community standards | Before participating in the project |
| [SECURITY.md](./SECURITY.md) | Security policy and vulnerability reporting | When reporting security issues |
| [SUPPORT.md](./SUPPORT.md) | Getting help and support channels | When you need assistance |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and release notes | Upgrading or checking what's new |
| [CLAUDE.md](./CLAUDE.md) | AI assistant development instructions | Using Claude Code or GitHub Copilot |

### `/docs` Directory - Comprehensive Documentation

Detailed documentation organized by topic:

#### 📖 [Reference Documentation](./docs/reference/)

In-depth feature documentation:

- **[CONFIGURATION.md](./docs/reference/CONFIGURATION.md)** - Complete configuration options reference
- **[MONITORING_SYSTEM.md](./docs/reference/MONITORING_SYSTEM.md)** - Automated monitoring architecture and setup
- **[NOTIFICATIONS.md](./docs/reference/NOTIFICATIONS.md)** - Real-time alerts (Slack, Telegram, Email, Discord)
- **[TESTING.md](./docs/reference/TESTING.md)** - Testing strategy, guidelines, and running tests

#### 🔧 [Setup Guides](./docs/setup/)

Advanced deployment and configuration guides:

- **[ORPHANED_BRANCH_SETUP.md](./docs/setup/ORPHANED_BRANCH_SETUP.md)** - Upptime-style status-data branch configuration
- **[TRUSTED_PUBLISHING_SETUP.md](./docs/setup/TRUSTED_PUBLISHING_SETUP.md)** - npm OIDC trusted publishing setup
- **[PUBLISHING.md](./docs/setup/PUBLISHING.md)** - Release workflow and version publishing

#### 🏗️ [Architecture Documentation](./docs/architecture/)

Understanding internal design and structure:

- **[ARCHITECTURE-INDEX.md](./docs/architecture/ARCHITECTURE-INDEX.md)** - Overview of architectural documentation
- **[ARCHITECTURE-SUMMARY.md](./docs/architecture/ARCHITECTURE-SUMMARY.md)** - High-level system design
- **[ARCHITECTURE-ANALYSIS.md](./docs/architecture/ARCHITECTURE-ANALYSIS.md)** - Detailed technical analysis

#### 📦 [Archive](./docs/archive/)

Historical and legacy documentation:

- **[CODE-REFERENCE-GUIDE.md](./docs/archive/CODE-REFERENCE-GUIDE.md)** - Legacy code navigation guide
- **[PROJECT_SUMMARY.md](./docs/archive/PROJECT_SUMMARY.md)** - Original project summary
- **[NOTIFICATION-SYSTEM-SUMMARY.md](./docs/archive/NOTIFICATION-SYSTEM-SUMMARY.md)** - Notification implementation notes
- **[UPPTIME_CONFIGURATION_COMPARISON.md](./docs/archive/UPPTIME_CONFIGURATION_COMPARISON.md)** - Upptime comparison

## 🎯 Find What You Need

### By Task

**I want to...**

- **Install the plugin** → [README.md - Installation](./README.md#installation)
- **Get started quickly** → [QUICKSTART.md](./QUICKSTART.md)
- **Configure options** → [docs/reference/CONFIGURATION.md](./docs/reference/CONFIGURATION.md)
- **Set up automated monitoring** → [docs/reference/MONITORING_SYSTEM.md](./docs/reference/MONITORING_SYSTEM.md)
- **Add notification alerts** → [docs/reference/NOTIFICATIONS.md](./docs/reference/NOTIFICATIONS.md)
- **Deploy to GitHub Pages** → [README.md - GitHub Actions Setup](./README.md#github-actions-setup)
- **Use orphaned branch** → [docs/setup/ORPHANED_BRANCH_SETUP.md](./docs/setup/ORPHANED_BRANCH_SETUP.md)
- **Track maintenance windows** → [README.md - Maintenance Tickets](./README.md#creating-maintenance-tickets)
- **Understand architecture** → [docs/architecture/ARCHITECTURE-INDEX.md](./docs/architecture/ARCHITECTURE-INDEX.md)
- **Contribute code** → [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Run tests** → [docs/reference/TESTING.md](./docs/reference/TESTING.md)
- **Publish a release** → [docs/setup/PUBLISHING.md](./docs/setup/PUBLISHING.md)

### By Role

**Developers**
1. [QUICKSTART.md](./QUICKSTART.md) - Quick setup
2. [CONTRIBUTING.md](./CONTRIBUTING.md) - Development workflow
3. [docs/reference/TESTING.md](./docs/reference/TESTING.md) - Testing guidelines
4. [CLAUDE.md](./CLAUDE.md) - AI-assisted development

**DevOps/Platform Engineers**
1. [docs/reference/MONITORING_SYSTEM.md](./docs/reference/MONITORING_SYSTEM.md) - Monitoring setup
2. [docs/setup/ORPHANED_BRANCH_SETUP.md](./docs/setup/ORPHANED_BRANCH_SETUP.md) - Branch strategy
3. [docs/reference/NOTIFICATIONS.md](./docs/reference/NOTIFICATIONS.md) - Alert configuration
4. [README.md - GitHub Actions](./README.md#github-actions-setup) - CI/CD workflows

**Site Administrators**
1. [README.md](./README.md) - Complete feature overview
2. [docs/reference/CONFIGURATION.md](./docs/reference/CONFIGURATION.md) - Configuration options
3. [README.md - Maintenance Tickets](./README.md#creating-maintenance-tickets) - Scheduling maintenance

**Architects**
1. [docs/architecture/ARCHITECTURE-INDEX.md](./docs/architecture/ARCHITECTURE-INDEX.md) - System design
2. [docs/architecture/ARCHITECTURE-SUMMARY.md](./docs/architecture/ARCHITECTURE-SUMMARY.md) - High-level overview
3. [docs/archive/UPPTIME_CONFIGURATION_COMPARISON.md](./docs/archive/UPPTIME_CONFIGURATION_COMPARISON.md) - Upptime comparison

## 🔍 Search Tips

All documentation is in Markdown format and searchable via:
- **GitHub's built-in search** - Use the search bar at the top of the repo
- **Command+F / Ctrl+F** - Search within individual documents
- **grep** - `grep -r "search term" docs/`

## 📝 Documentation Standards

All documentation follows these standards:
- ✅ GitHub-flavored Markdown
- ✅ Clear hierarchical structure with descriptive headers
- ✅ Working code examples for all features
- ✅ Cross-references to related documentation
- ✅ Version notes for new features (e.g., "v0.5.0+")
- ✅ Reflects current implementation (v0.14.0)

## 🆘 Need Help?

If you can't find what you're looking for:

1. **Search Issues** - [GitHub Issues](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues)
2. **Ask in Discussions** - [GitHub Discussions](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/discussions)
3. **Read Support Guide** - [SUPPORT.md](./SUPPORT.md)

## 🤝 Contributing to Documentation

Found an error or want to improve the docs?

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines
2. Documentation PRs are welcome and appreciated!
3. All docs should be kept current with the codebase

## 📦 Version Information

**Current Version:** v0.14.0
**Documentation Last Updated:** November 2025
**Docusaurus Compatibility:** v3.0+
**Node.js Requirement:** v20.0+

## 🔗 External Resources

- **npm Package**: [@amiable-dev/docusaurus-plugin-stentorosaur](https://www.npmjs.com/package/@amiable-dev/docusaurus-plugin-stentorosaur)
- **GitHub Repository**: [amiable-dev/docusaurus-plugin-stentorosaur](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur)
- **Upptime (Inspiration)**: [upptime/upptime](https://github.com/upptime/upptime)
- **Docusaurus**: [docusaurus.io](https://docusaurus.io)

---

💡 **Tip**: Bookmark this page for quick access to all documentation!
