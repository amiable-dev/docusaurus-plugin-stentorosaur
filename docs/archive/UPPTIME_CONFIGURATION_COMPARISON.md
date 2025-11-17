# Upptime Configuration Options: Implementation Status

This document compares all configuration options from [Upptime](https://upptime.js.org/docs/configuration) with what's currently implemented in `docusaurus-plugin-stentorosaur`.

**Last Updated:** November 3, 2025

---

## Summary

| Category | Total Options | Implemented | Not Implemented | Status |
|----------|--------------|-------------|-----------------|--------|
| **Repository** | 2 | 2 | 0 | ✅ Complete |
| **Endpoints/Sites** | 20+ | 0 | 20+ | ❌ [Issue #25](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/25) |
| **Globalping** | 4 | 0 | 4 | ❌ [Issue #22](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/22), [#23](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/23), [#24](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/24) |
| **Display Options** | 8 | 8 | 0 | ✅ Complete |
| **Status Website** | 20+ | 2 | 18+ | 🟡 [Issue #26](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/26) |
| **Workflow/Automation** | 15+ | 0 | 15+ | ❌ [Issue #27](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/27) |

**Overall Progress: ~15% of Upptime configuration options are exposed**

---

## 1. Repository Configuration ✅

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `owner` | ✅ | ✅ | ✅ Implemented | GitHub repository owner |
| `repo` | ✅ | ✅ | ✅ Implemented | GitHub repository name |

**Verdict:** ✅ **Fully implemented**

---

## 2. Endpoints/Sites Configuration ❌

### Basic Endpoint Options

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[]` | ✅ | ❌ | ❌ Not exposed | Array of endpoints to monitor |
| `sites[].name` | ✅ | ❌ | ❌ Not exposed | Display name |
| `sites[].url` | ✅ | ❌ | ❌ Not exposed | Endpoint URL |
| `sites[].method` | ✅ | ❌ | ❌ Not exposed | HTTP method (GET, POST, DELETE, etc.) |
| `sites[].check` | ✅ | ❌ | ❌ Not exposed | Check type: http, tcp-ping, ws, ssl |
| `sites[].port` | ✅ | ❌ | ❌ Not exposed | Port number for TCP ping |
| `sites[].ipv6` | ✅ | ❌ | ❌ Not exposed | Use IPv6 |

### Request Configuration

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[].headers[]` | ✅ | ❌ | ❌ Not exposed | Custom HTTP headers |
| `sites[].body` | ✅ | ❌ | ❌ Not exposed | Request body for POST/PUT |

### Status Detection

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[].expectedStatusCodes[]` | ✅ | ❌ | ❌ Not exposed | Valid HTTP status codes |
| `sites[].maxResponseTime` | ✅ | ❌ | ❌ Not exposed | Degraded threshold (ms) |
| `sites[].__dangerous__body_down` | ✅ | ❌ | ❌ Not exposed | String indicating down status |
| `sites[].__dangerous__body_degraded` | ✅ | ❌ | ❌ Not exposed | String indicating degraded status |
| `sites[].__dangerous__body_down_if_text_missing` | ✅ | ❌ | ❌ Not exposed | Missing string = down |
| `sites[].__dangerous__body_degraded_if_text_missing` | ✅ | ❌ | ❌ Not exposed | Missing string = degraded |

### SSL/Security

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[].__dangerous__insecure` | ✅ | ❌ | ❌ Not exposed | Skip all SSL verification |
| `sites[].__dangerous__disable_verify_peer` | ✅ | ❌ | ❌ Not exposed | Skip SSL peer verification |
| `sites[].__dangerous__disable_verify_host` | ✅ | ❌ | ❌ Not exposed | Skip SSL host verification |

### Display & Organization

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[].icon` | ✅ | ❌ | ❌ Not exposed | Custom icon URL |
| `sites[].slug` | ✅ | ❌ | ❌ Not exposed | Custom URL slug |
| `sites[].assignees[]` | ✅ | ❌ | ❌ Not exposed | Per-site assignees |

### Secrets

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `$SECRET_NAME` syntax | ✅ | ❌ | ❌ Not exposed | Reference GitHub secrets in URLs/headers |

**Verdict:** ❌ **Not implemented** - See [Issue #25](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/25)

---

## 3. Globalping Configuration ❌

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `sites[].type: "globalping"` | ✅ | ❌ | ❌ Not exposed | Enable Globalping |
| `sites[].location` | ✅ | ❌ | ❌ Not exposed | Check location (city, country, region, etc.) |
| `sites[].check: "icmp-ping"` | ✅ | ❌ | ❌ Not implemented | ICMP ping via Globalping |
| `GLOBALPING_TOKEN` | ✅ | ❌ | ❌ Not documented | Authentication token (backend supports it) |

**Verdict:** ❌ **Not implemented** - See Issues [#22](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/22), [#23](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/23), [#24](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/24)

---

## 4. Display Options ✅

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `title` | ✅ | ✅ | ✅ Implemented | Status page title |
| `description` | ✅ | ✅ | ✅ Implemented | Status page description |
| `showResponseTimes` | ✅ | ✅ | ✅ Implemented | Show response time metrics |
| `showUptime` | ✅ | ✅ | ✅ Implemented | Show uptime percentages |
| `showServices` | ✅ | ✅ | ✅ Implemented | Show services status board |
| `showIncidents` | ✅ | ✅ | ✅ Implemented | Show incident history |
| `showPerformanceMetrics` | ✅ | ✅ | ✅ Implemented | Show interactive charts (v0.3.1+) |
| `useDemoData` | ✅ | ✅ | ✅ Implemented | Use demo data mode |

**Verdict:** ✅ **Fully implemented**

---

## 5. Status Website Options 🟡

### Theme & Styling

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.theme` | ✅ | ❌ | 🟡 Use Docusaurus | light, dark, night, ocean |
| `status-website.themeUrl` | ✅ | ❌ | 🟡 Use Docusaurus | Custom CSS theme URL |
| `status-website.css` | ✅ | ❌ | 🟡 Use Docusaurus | Inline CSS |
| `status-website.links[]` | ✅ | ❌ | 🟡 Use Docusaurus | Custom stylesheets |

### Branding

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.name` | ✅ | ✅ | ✅ Implemented | Similar to `title` |
| `status-website.logoUrl` | ✅ | ❌ | ❌ Not exposed | Logo image URL |
| `status-website.favicon` | ✅ | ❌ | 🟡 Use Docusaurus | Favicon PNG |
| `status-website.faviconSvg` | ✅ | ❌ | 🟡 Use Docusaurus | Favicon SVG |

### Domain & Routing

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.cname` | ✅ | ❌ | ❌ Not exposed | Custom domain |
| `status-website.baseUrl` | ✅ | ❌ | 🟡 Use Docusaurus | Base URL path |

### Navigation & Content

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.navbar[]` | ✅ | ❌ | 🟡 Use Docusaurus | Navigation links |
| `status-website.introTitle` | ✅ | ❌ | ❌ Not exposed | Intro heading |
| `status-website.introMessage` | ✅ | ❌ | ❌ Not exposed | Intro text (Markdown) |

### Custom HTML/JS

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.customHeadHtml` | ✅ | ❌ | 🟡 Use Docusaurus | Custom <head> HTML |
| `status-website.customBodyHtml` | ✅ | ❌ | 🟡 Use Docusaurus | Custom <body> HTML |
| `status-website.customFootHtml` | ✅ | ❌ | 🟡 Use Docusaurus | Custom footer HTML |
| `status-website.js` | ✅ | ❌ | 🟡 Use Docusaurus | Inline JavaScript |
| `status-website.scripts[]` | ✅ | ❌ | 🟡 Use Docusaurus | Custom scripts |

### SEO

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.metaTags[]` | ✅ | ❌ | 🟡 Use Docusaurus | Custom meta tags |
| `status-website.robotsText` | ✅ | ❌ | 🟡 Use Docusaurus | robots.txt content |

### API Configuration

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.apiBaseUrl` | ✅ | ❌ | ❌ Not exposed | Custom GitHub API URL |
| `status-website.userContentBaseUrl` | ✅ | ❌ | ❌ Not exposed | Custom raw content URL |

### Publishing

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `status-website.publish` | ✅ | ❌ | ❌ Not exposed | Enable/disable publishing |
| `status-website.singleCommit` | ✅ | ❌ | ❌ Not exposed | Squash commits |

**Verdict:** 🟡 **Partially implemented** - Most options should use Docusaurus equivalents. See [Issue #26](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/26)

---

## 6. Workflow & Automation Options ❌

### Assignees & Delays

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `assignees[]` | ✅ | ❌ | ❌ Not exposed | Global incident assignees |
| `delay` | ✅ | ❌ | ❌ Not exposed | Delay between checks (ms) |

### Notifications

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `notifications[]` | ✅ | ❌ | ❌ Not exposed | Notification services (Slack, Discord, etc.) |

### Workflow Scheduling

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `workflowSchedule.uptime` | ✅ | ❌ | ❌ Not exposed | Uptime check schedule (cron) |
| `workflowSchedule.responseTime` | ✅ | ❌ | ❌ Not exposed | Response time check schedule |
| `workflowSchedule.graphs` | ✅ | ❌ | ❌ Not exposed | Graph generation schedule |
| `workflowSchedule.summary` | ✅ | ❌ | ❌ Not exposed | Summary update schedule |
| `workflowSchedule.staticSite` | ✅ | ❌ | ❌ Not exposed | Site build schedule |
| `workflowSchedule.updateTemplate` | ✅ | ❌ | ❌ Not exposed | Template update schedule |
| `workflowSchedule.updates` | ✅ | ❌ | ❌ Not exposed | Updates schedule |

### Commit Messages

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `commitMessages.readmeContent` | ✅ | ❌ | ❌ Not exposed | README update commit message |
| `commitMessages.summaryJson` | ✅ | ❌ | ❌ Not exposed | Summary JSON commit message |
| `commitMessages.statusChange` | ✅ | ❌ | ❌ Not exposed | Status change commit message |
| `commitMessages.graphsUpdate` | ✅ | ❌ | ❌ Not exposed | Graphs update commit message |
| `commitMessages.commitAuthorName` | ✅ | ❌ | ❌ Not exposed | Commit author name |
| `commitMessages.commitAuthorEmail` | ✅ | ❌ | ❌ Not exposed | Commit author email |
| `commitPrefixStatusUp` | ✅ | ❌ | ❌ Not exposed | Commit prefix for up status |
| `commitPrefixStatusDown` | ✅ | ❌ | ❌ Not exposed | Commit prefix for down status |
| `commitPrefixStatusDegraded` | ✅ | ❌ | ❌ Not exposed | Commit prefix for degraded status |

### Repository Metadata

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `skipDescriptionUpdate` | ✅ | ❌ | ❌ Not exposed | Skip repo description update |
| `skipTopicsUpdate` | ✅ | ❌ | ❌ Not exposed | Skip repo topics update |
| `skipHomepageUpdate` | ✅ | ❌ | ❌ Not exposed | Skip repo homepage update |
| `skipDeleteIssues` | ✅ | ❌ | ❌ Not exposed | Keep all issues, don't delete |
| `skipPoweredByReadme` | ✅ | ❌ | ❌ Not exposed | Skip "Powered by Upptime" footer |

### Runner & User Agent

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `runner` | ✅ | ❌ | ❌ Not exposed | GitHub Actions runner |
| `user-agent` | ✅ | ❌ | ❌ Not exposed | GitHub API user agent |

### Internationalization

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `i18n.up` | ✅ | ❌ | ❌ Not exposed | Translated "up" string |
| `i18n.down` | ✅ | ❌ | ❌ Not exposed | Translated "down" string |
| `i18n.degraded` | ✅ | ❌ | ❌ Not exposed | Translated "degraded" string |
| `i18n.*` (30+ strings) | ✅ | ❌ | 🟡 Use Docusaurus i18n | Many translation strings |

**Verdict:** ❌ **Not implemented** - See [Issue #27](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/27)

---

## 7. Other Configuration Options

### Check Delay

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `delay` | ✅ | ❌ | ❌ Not exposed | Delay between endpoint checks (ms) |

### SLO Tracking (Plugin-Specific)

| Option | Upptime | Plugin | Status | Notes |
|--------|---------|--------|--------|-------|
| `defaultSLO` | ❌ | ✅ | ✅ Implemented | Default SLO target % (plugin feature) |
| `systemSLOs` | ❌ | ✅ | ✅ Implemented | Per-system SLO targets (plugin feature) |

---

## Implementation Roadmap

### Phase 1: Core Functionality ⚠️ In Progress

- [x] Basic display options (title, description, toggles) ✅
- [ ] Site/endpoint configuration [Issue #25](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/25)
- [ ] Globalping support [Issue #22](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/22)
- [ ] ICMP ping [Issue #23](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/23)

### Phase 2: Customization

- [ ] Branding options (logo, intro) [Issue #26](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/26)
- [ ] Globalping authentication docs [Issue #24](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/24)

### Phase 3: Automation

- [ ] Assignees and workflow scheduling [Issue #27](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/27)
- [ ] Commit message customization
- [ ] Notification integrations

### Phase 4: Advanced Features

- [ ] Custom status detection
- [ ] SSL/security options
- [ ] Self-hosted runners
- [ ] Comprehensive i18n support

---

## Notes

### Docusaurus vs Upptime Config
Many Upptime `status-website` options have direct Docusaurus equivalents:

- **Theme** → Use Docusaurus `colorMode`
- **Navbar** → Use Docusaurus `themeConfig.navbar`
- **Favicon** → Use Docusaurus `favicon`
- **Custom CSS/JS** → Use Docusaurus custom CSS and client modules
- **i18n** → Use Docusaurus i18n system

These should be documented in a migration guide rather than duplicated in plugin options.

### Plugin-Specific Features
The plugin adds features not in Upptime:

- ✅ `defaultSLO` - Default SLO target percentage
- ✅ `systemSLOs` - Per-system SLO targets
- ✅ Interactive performance metrics with charts
- ✅ Mini heatmap visualization on status cards

---

## Related Issues

- [#22](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/22) - Add Globalping configuration support
- [#23](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/23) - Support ICMP ping checks via Globalping
- [#24](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/24) - Document Globalping authentication setup
- [#25](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/25) - Add comprehensive site/endpoint configuration options
- [#26](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/26) - Add status website customization options
- [#27](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/27) - Add workflow automation configuration

---

**Generated:** November 3, 2025  
**Source:** [Upptime Configuration Documentation](https://upptime.js.org/docs/configuration)
