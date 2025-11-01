# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2025-11-01

### Fixed

- Status update workflow template now uses correct binary command (#6)
  - Changed from non-existent `npm run update-status` to `npx stentorosaur-update-status`
  - Added conditional execution based on `build/` directory existence
  - Implemented emoji commit messages (🟩🟨🟥📊) based on system status
  - Only commits `build/status-data/` (not `.docusaurus/`)
  - Added jq-based status detection from `summary.json`

### Added

- CLI flags for `stentorosaur-update-status` command (#6)
  - `--help` / `-h` - Show comprehensive usage documentation
  - `--output-dir <path>` - Specify custom output directory
  - `--verbose` - Enable detailed logging for debugging
  - `--commit` - Auto-commit changes with emoji messages
- Binary entry point in `package.json` for CLI command
- Tests for CLI script (`__tests__/update-status.test.ts`)
- CLI usage documentation in QUICKSTART.md and README.md

## [0.1.4] - 2025-11-01

### Added

- Comprehensive GitHub token setup documentation in README
  - Explains two token contexts: `process.env.GITHUB_TOKEN` vs `secrets.GITHUB_TOKEN`
  - Personal Access Token creation instructions
  - Local development setup with `.env` file
  - GitHub Actions automatic token provision
  - Example GitHub Pages deployment workflow
  - Multi-platform CI/CD coverage (Netlify, Vercel)
- Token setup guide in QUICKSTART.md
- CHANGELOG.md now included in npm package

### Fixed

- Corrected plugin directory path in `status-update.yml` workflow
- Updated Node.js version to 20.x in workflow templates
- Fixed all package name references to `@amiable-dev/docusaurus-plugin-stentorosaur`

## [0.1.3] - 2025-11-01

### Added

- Templates now included in npm package:
  - `templates/workflows/monitor-systems.yml` - Automated system health monitoring
  - `templates/workflows/status-update.yml` - Status data synchronization
  - `templates/ISSUE_TEMPLATE/status-issue.yml` - Manual status reporting template
- Documentation files now included:
  - `CONFIGURATION.md` - Detailed configuration reference
  - `QUICKSTART.md` - Quick start guide

### Changed

- Updated `.npmignore` to properly include user-facing templates and documentation
- Explicitly excluded internal development documentation from package

## [0.1.2] - 2025-11-01

### Fixed

- NPM trusted publishing workflow
  - Added npm upgrade to 11.5.1+ (required for OIDC trusted publishing)
  - Restored `registry-url` configuration in setup-node
  - Removed manual `--provenance` flag (auto-added by npm 11.5.1+)

### Infrastructure

- Configured NPM trusted publishing with OIDC on npmjs.com
- GitHub Actions workflow for automated publishing on release

## [0.1.1] - 2025-10-31

### Fixed

- Repository URL format in package.json

### Infrastructure

- First successful manual publish to npm registry

## [0.1.0] - 2025-10-31

### Added

- Initial release of docusaurus-plugin-stentorosaur
- Status dashboard component showing system/process status
- Incident history timeline component
- GitHub Issues integration for incident tracking
- GitHub Actions workflows for automated monitoring
- Configurable system labels for tracking multiple systems
- Severity levels: critical, major, minor, maintenance
- Support for both technical systems and process tracking
- Automatic status page generation at `/status` route
- Real-time status updates via GitHub Actions
- Customizable UI with theming support
- Issue templates for manual status reporting
- Monitoring workflow for automated health checks
- Status update workflow for data synchronization
- TypeScript support with full type definitions
- Responsive design for all device sizes
- Uptime and response time tracking
- Documentation and quick start guide

### Components

- `StatusBoard` - Main status overview
- `StatusItem` - Individual system status display
- `IncidentHistory` - Timeline of past incidents
- `StatusPage` - Full status page layout

### Features

- Automated incident creation/closure based on monitoring
- Manual incident reporting via GitHub Issues
- Configurable update intervals
- Support for multiple affected systems per incident
- Historical incident tracking
- Real-time status indicators
- Severity-based color coding
- Clean, accessible UI

[Unreleased]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/releases/tag/v0.1.0
