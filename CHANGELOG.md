# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-31

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

[1.0.0]: https://github.com/your-org/docusaurus-plugin-stentorosaur/releases/tag/v1.0.0
