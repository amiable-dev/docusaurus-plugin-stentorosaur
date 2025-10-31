# Docusaurus Status Plugin - Project Summary

## Overview

A complete Docusaurus plugin that creates an Upptime-like status monitoring dashboard, powered by GitHub Issues and Actions. This plugin enables teams to track both **technical system status** (APIs, websites, databases) and **process-based issues** (onboarding, support, deployments) directly within their Docusaurus documentation site.

## Key Features

✅ **Status Dashboard** - Beautiful real-time status display
✅ **Incident Timeline** - Historical view of all incidents
✅ **GitHub-Powered** - Uses Issues for tracking, Actions for automation
✅ **Automated Monitoring** - Scheduled health checks every 5 minutes
✅ **Manual Reporting** - Issue templates for human-created incidents
✅ **Flexible Tracking** - Monitor systems AND business processes
✅ **Fully Themed** - Integrates seamlessly with Docusaurus design
✅ **TypeScript** - Complete type definitions
✅ **Responsive** - Works on all devices

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     GitHub Repository                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Issues (with labels)                                   │
│  ├─ status + system-name + severity                    │
│  ├─ Automated (from monitoring)                        │
│  └─ Manual (from issue templates)                      │
│                                                          │
│  GitHub Actions                                         │
│  ├─ monitor-systems.yml (every 5 min)                 │
│  │   └─ Pings endpoints, creates/closes issues        │
│  └─ status-update.yml (hourly)                        │
│      └─ Fetches issues, generates status.json         │
│                                                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Docusaurus Plugin (Build Time)             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GitHub Service (src/github-service.ts)                 │
│  └─ Fetches issues via Octokit                         │
│                                                          │
│  Plugin (src/index.ts)                                  │
│  ├─ loadContent() - Processes issues                   │
│  ├─ contentLoaded() - Creates /status route           │
│  └─ postBuild() - Copies status.json                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│          React Components (Client Side)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  StatusPage (src/theme/StatusPage)                      │
│  └─ Main page component at /status                     │
│                                                          │
│  StatusBoard (src/theme/StatusBoard)                    │
│  └─ Overview of all systems                            │
│                                                          │
│  StatusItem (src/theme/StatusItem)                      │
│  └─ Individual system status card                      │
│                                                          │
│  IncidentHistory (src/theme/IncidentHistory)            │
│  └─ Timeline of recent incidents                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
docusaurus-plugin-stentorosaur/
├── src/
│   ├── index.ts              # Main plugin entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── options.ts            # Configuration schema validation
│   ├── github-service.ts     # GitHub API integration
│   ├── plugin-status.d.ts    # Module type declarations
│   └── theme/                # React components
│       ├── StatusPage/       # Main status page
│       ├── StatusBoard/      # System status overview
│       ├── StatusItem/       # Individual status item
│       └── IncidentHistory/  # Incident timeline
│
├── templates/
│   ├── workflows/            # GitHub Actions templates
│   │   ├── monitor-systems.yml    # Automated monitoring
│   │   └── status-update.yml      # Data synchronization
│   └── ISSUE_TEMPLATE/
│       └── status-issue.yml       # Manual reporting template
│
├── scripts/
│   └── update-status.js      # Manual status update script
│
├── package.json              # NPM package configuration
├── tsconfig.json             # TypeScript configuration
├── README.md                 # Full documentation
├── QUICKSTART.md             # Quick start guide
├── CHANGELOG.md              # Version history
├── LICENSE                   # MIT license
├── .gitignore                # Git ignore rules
├── .npmignore                # NPM ignore rules
└── example.config.js         # Example configuration
```

## How It Works

### 1. Issue-Based Tracking

Issues are labeled to track status:
- `status` - Required label for all status issues
- System labels (`api`, `website`, etc.) - Identify affected systems
- Severity labels (`critical`, `major`, `minor`, `maintenance`)

### 2. Automated Monitoring

GitHub Actions monitor endpoints:
```yaml
- Ping endpoint every 5 minutes
- If down → Create issue with 'status' + system + 'critical' labels
- If recovered → Close open issues, add resolution comment
```

### 3. Status Generation

Plugin processes issues at build time:
```typescript
1. Fetch all issues with 'status' label
2. Convert to StatusIncident objects
3. Generate StatusItem for each system
4. Determine status based on open incidents
5. Write to status.json
```

### 4. UI Rendering

React components display the data:
- StatusBoard shows all systems
- StatusItem displays individual status
- IncidentHistory shows timeline

## Usage Examples

### Configuration

```javascript
// docusaurus.config.js
plugins: [
  [
    'docusaurus-plugin-stentorosaur',
    {
      owner: 'your-org',
      repo: 'your-repo',
      systemLabels: ['api', 'website', 'database'],
      token: process.env.GITHUB_TOKEN,
    },
  ],
]
```

### Automated Monitoring

```yaml
# .github/workflows/monitor-systems.yml
system: 
  - name: 'api'
    url: 'https://api.example.com/health'
  - name: 'website'
    url: 'https://example.com'
```

### Manual Incident

Create GitHub issue with labels:
- `status`
- `api`
- `critical`

### Embedding Components

```mdx
import StatusBoard from '@theme/StatusBoard';
import IncidentHistory from '@theme/IncidentHistory';

<StatusBoard items={statusData.items} />
<IncidentHistory incidents={statusData.incidents} />
```

## Comparison with Upptime

| Feature | Upptime | This Plugin |
|---------|---------|-------------|
| Platform | Standalone Svelte site | Docusaurus plugin |
| Integration | Separate status page | Embedded in docs |
| UI Framework | Svelte + Sapper | React |
| Customization | Config-based | Full theme control |
| Process Tracking | No | ✅ Yes |
| Use Case | Pure uptime monitoring | Systems + processes |

## Key Innovations

1. **Process Tracking**: Beyond technical systems, track business processes like:
   - Onboarding delays
   - Support ticket backlogs
   - Documentation updates needed
   - Deployment approvals pending

2. **Embedded Dashboard**: Status page lives within your docs, not separately

3. **Flexible Incidents**: Use GitHub Issues for both:
   - Automated technical alerts
   - Manual process status updates

4. **Full Theming**: Leverages Docusaurus theming system for complete customization

## Dependencies

- `@docusaurus/core` ^3.0.0
- `@docusaurus/types` ^3.0.0
- `@docusaurus/utils` ^3.0.0
- `@octokit/rest` ^20.0.2
- `date-fns` ^2.30.0
- `fs-extra` ^11.1.1
- `react` ^18.0.0 || ^19.0.0
- `react-dom` ^18.0.0 || ^19.0.0

## Installation & Setup

```bash
# 1. Install
npm install docusaurus-plugin-stentorosaur

# 2. Configure in docusaurus.config.js
# (see example.config.js)

# 3. Copy workflows
cp node_modules/docusaurus-plugin-stentorosaur/templates/workflows/* .github/workflows/

# 4. Configure monitoring endpoints
# Edit .github/workflows/monitor-systems.yml

# 5. Set GITHUB_TOKEN environment variable

# 6. Deploy and visit /status
```

## Customization

All components support CSS modules and can be swizzled for complete customization:

```bash
npm run swizzle docusaurus-plugin-stentorosaur StatusBoard -- --eject
```

## Future Enhancements

Possible additions:
- [ ] Response time graphs
- [ ] Uptime percentage calculation
- [ ] Historical data storage
- [ ] Email/Slack notifications
- [ ] Custom status checks (beyond HTTP)
- [ ] SLA tracking
- [ ] Public status badge
- [ ] RSS feed for incidents
- [ ] Status page theming presets

## Credits

Inspired by [Upptime](https://github.com/upptime/upptime) by Anand Chowdhary.

Built with ❤️ for the Docusaurus community.

## License

MIT © 2025
