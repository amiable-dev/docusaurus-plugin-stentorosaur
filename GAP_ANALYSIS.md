# Gap Analysis: Upptime vs docusaurus-plugin-stentorosaur

**Date**: October 31, 2025  
**Version**: docusaurus-plugin-stentorosaur v0.1.0-beta.0

## Executive Summary

This document provides a comprehensive comparison between **Upptime** (the original open-source uptime monitor) and **docusaurus-plugin-stentorosaur** (our Docusaurus plugin implementation). While our plugin was inspired by Upptime and shares similar core concepts, it has a different architecture and focus area.

**Key Finding**: docusaurus-plugin-stentorosaur is a **status display plugin** that integrates with Docusaurus, while Upptime is a **complete standalone monitoring solution**. There are significant feature gaps in monitoring capabilities, but our plugin offers unique advantages in documentation integration.

---

## 1. Upptime Features & Capabilities

### Core Architecture

**Technology Stack**:
- **Frontend**: Svelte + Sapper (Static Site Generator)
- **Backend**: GitHub Actions (serverless)
- **Data Storage**: Git commits + GitHub API
- **Hosting**: GitHub Pages
- **Monitoring**: Custom GitHub Actions workflows

**Key Components**:
1. **Uptime Monitor** (`@upptime/uptime-monitor` package)
2. **Status Page** (`@upptime/status-page` package)
3. **Graphs Generator** (`@upptime/graphs` package)
4. **GitHub Template** (repository template)

### 1.1 Monitoring Capabilities

#### Automated Health Checks
- ✅ **Every 5 minutes** scheduled monitoring
- ✅ Multiple check types:
  - HTTP/HTTPS requests
  - TCP ping
  - DNS resolution
  - IPv6 support
  - Custom headers support
  - Expected status codes (200, 301, 302, etc.)
- ✅ Configurable timeout values
- ✅ Multiple endpoints per repository (unlimited)
- ✅ Port-specific monitoring
- ✅ Custom request methods (GET, POST, etc.)

#### Response Time Tracking
- ✅ **Every 6 hours** response time recording
- ✅ Committed to git history (version-controlled)
- ✅ Historical data preservation
- ✅ Multiple time periods:
  - Last 24 hours
  - Last 7 days
  - Last 30 days
  - Last 1 year
  - All-time average
- ✅ Percentile calculations (p50, p95, p99)

#### Uptime Calculations
- ✅ Automatic uptime percentage tracking
- ✅ Multiple time windows:
  - 24-hour uptime
  - 7-day uptime
  - 30-day uptime
  - 1-year uptime
  - All-time uptime
- ✅ SLA calculations
- ✅ Downtime duration tracking

### 1.2 Incident Management

#### Automated Issue Creation
- ✅ Opens GitHub Issue when endpoint goes down
- ✅ Auto-assigns team members
- ✅ Includes diagnostic information:
  - Status code
  - Response time
  - Timestamp
  - Error details
- ✅ Locks issues to prevent spam
- ✅ Custom issue templates

#### Incident Resolution
- ✅ Auto-closes issues when service recovers
- ✅ Posts recovery comment with timestamp
- ✅ Tracks incident duration
- ✅ Maintains incident history

#### Manual Incident Reporting
- ✅ Manual issue creation via templates
- ✅ Support for planned maintenance
- ✅ Custom incident categories

### 1.3 Status Page Features

#### Visual Design
- ✅ Modern, clean Svelte-based UI
- ✅ Responsive design (mobile-friendly)
- ✅ Progressive Web App (PWA)
- ✅ Custom branding (logo, colors, domain)
- ✅ Light/dark mode support
- ✅ Favicon generation from icons

#### Data Visualization
- ✅ **Response Time Graphs**:
  - Line charts with trends
  - PNG image generation
  - Embedded in status page
  - Daily graph generation
- ✅ **Uptime Badges**:
  - Shield.io integration
  - Real-time status badges
  - Embeddable in README
  - Custom colors based on status
- ✅ **Live Status Display**:
  - Overall status (All systems operational, Partial outage, Major outage)
  - Per-service status indicators
  - Response time display
  - Uptime percentage display

#### Historical Data
- ✅ Incident timeline
- ✅ Complete history via git commits
- ✅ Long-term trend analysis
- ✅ Commit-based audit trail

### 1.4 Notifications & Alerts

- ✅ **Slack** integration
- ✅ **Telegram** notifications
- ✅ **Discord** webhooks
- ✅ **Microsoft Teams** integration
- ✅ **Custom webhooks** (any service)
- ✅ **Email notifications** (via GitHub)
- ✅ Notification on:
  - Downtime detected
  - Service recovered
  - Incident updates
- ✅ Configurable notification channels per service

### 1.5 Data Management

#### Storage & Versioning
- ✅ All data in git (version-controlled)
- ✅ YAML files for each endpoint (`history/*.yml`)
- ✅ JSON API endpoints (`api/*/response-time.json`, `api/*/uptime.json`)
- ✅ Automated data commits
- ✅ Historical data preservation

#### API Endpoints
- ✅ Response time JSON files
- ✅ Uptime JSON files
- ✅ Shield.io compatible badges
- ✅ GitHub API integration
- ✅ Public API access

### 1.6 Configuration & Customization

#### Configuration File
```yaml
# .upptimerc.yml
owner: organization
repo: repository
sites:
  - name: Service Name
    url: https://example.com
    check: "http"
    expectedStatusCodes: [200, 301]
    maxResponseTime: 5000
    headers:
      - "Authorization: Bearer token"
status-website:
  cname: status.example.com
  logoUrl: /logo.svg
  name: Company Status
  theme: dark
  navbar:
    - title: Home
      href: /
```

#### Advanced Options
- ✅ Custom check intervals
- ✅ Multiple check methods
- ✅ Custom status codes
- ✅ Request headers
- ✅ Skip SSL verification
- ✅ Custom user agents
- ✅ Assignees for incidents
- ✅ Custom labels
- ✅ Skip notifications

### 1.7 Workflows & Automation

Upptime uses **8 separate GitHub Actions workflows**:

1. **uptime.yml** - Every 5 minutes, checks endpoint health
2. **response-time.yml** - Every 6 hours, records response times
3. **graphs.yml** - Daily, generates response time graphs
4. **summary.yml** - Daily, updates README summary
5. **site.yml** - On push, rebuilds status website
6. **updates.yml** - Handles manual triggers
7. **update-template.yml** - Weekly, updates from template
8. **setup.yml** - One-time setup workflow

---

## 2. docusaurus-plugin-stentorosaur Features & Capabilities

### Core Architecture

**Technology Stack**:
- **Frontend**: React (Docusaurus theme components)
- **Backend**: Docusaurus plugin API
- **Data Source**: GitHub Issues API
- **Hosting**: Integrated with Docusaurus site
- **Monitoring**: Manual GitHub Actions integration

**Key Components**:
1. **Docusaurus Plugin** (lifecycle hooks)
2. **GitHub Service** (API client)
3. **React Components** (StatusPage, StatusBoard, StatusItem, IncidentHistory)
4. **Demo Data** (for testing/development)

### 2.1 Status Display Capabilities

#### Core Features
- ✅ Status dashboard at `/status` route
- ✅ Service status board
- ✅ Incident timeline/history
- ✅ Real-time data from GitHub Issues
- ✅ Demo data mode (for testing without GitHub)
- ✅ Configurable visibility (show/hide services or incidents)
- ✅ Integrated with Docusaurus theming
- ✅ Responsive design

#### Data Sources
- ✅ GitHub Issues as data source
- ✅ Label-based system tracking
- ✅ Severity-based classification (critical, major, minor, maintenance)
- ✅ Affected systems tracking
- ✅ Fallback to demo data

### 2.2 Issue-Based Incident Tracking

#### Manual/Automated Issue Creation
- ✅ Uses GitHub Issues labels:
  - `status` - Main label
  - System labels (`api`, `web`, etc.)
  - Severity labels (`critical`, `major`, `minor`, `maintenance`)
- ✅ Converts issues to incidents
- ✅ Tracks open/closed state
- ✅ Displays incident metadata

#### Incident Display
- ✅ Incident title
- ✅ Status (open/closed)
- ✅ Severity level
- ✅ Created/updated timestamps
- ✅ Affected systems
- ✅ Link to GitHub issue
- ✅ Limit to 20 most recent incidents

### 2.3 Docusaurus Integration

#### Plugin Features
- ✅ Native Docusaurus plugin
- ✅ Theme component integration
- ✅ Swizzlable components (`StatusPage`, `StatusBoard`, `StatusItem`, `IncidentHistory`)
- ✅ Route metadata with `lastUpdatedAt`
- ✅ Automatic route creation
- ✅ Build-time data generation
- ✅ Watch mode for development

#### Configuration
```javascript
// docusaurus.config.js
{
  owner: 'org',
  repo: 'repo',
  token: process.env.GITHUB_TOKEN,
  systemLabels: ['api', 'web', 'database'],
  statusLabel: 'status',
  useDemoData: false,
  showServices: true,
  showIncidents: true,
  title: 'System Status',
  description: 'Status page',
}
```

### 2.4 Template Workflows

Provides **2 GitHub Actions workflow templates**:

1. **monitor-systems.yml** - Every 5 minutes, monitors endpoints
   - Checks HTTP status
   - Creates/closes issues automatically
   - Configurable endpoints

2. **status-update.yml** - Hourly, can trigger Docusaurus rebuild
   - Optional workflow for automation

### 2.5 Testing & Quality

- ✅ 44 test cases (Jest)
- ✅ 95%+ code coverage
- ✅ Mocked GitHub API
- ✅ Demo data for development
- ✅ TypeScript support
- ✅ CI/CD with GitHub Actions

---

## 3. Feature Comparison Matrix

| Feature Category | Upptime | docusaurus-plugin-stentorosaur | Gap |
|-----------------|---------|--------------------------------|-----|
| **MONITORING** |
| Automated health checks | ✅ Every 5 min | ⚠️ Template only | 🔴 **MAJOR GAP** |
| Response time tracking | ✅ Built-in | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Uptime calculations | ✅ Automatic | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Multiple check types | ✅ HTTP/TCP/DNS | ⚠️ HTTP only (template) | 🟡 **MODERATE GAP** |
| IPv6 support | ✅ Yes | ❌ No | 🟡 **MODERATE GAP** |
| Custom headers | ✅ Yes | ⚠️ Manual in template | 🟡 **MODERATE GAP** |
| **DATA STORAGE** |
| Git-based storage | ✅ YAML files | ❌ Runtime only | 🔴 **MAJOR GAP** |
| Historical data | ✅ Commit history | ❌ Not preserved | 🔴 **MAJOR GAP** |
| API endpoints | ✅ JSON files | ❌ Not implemented | 🔴 **MAJOR GAP** |
| **INCIDENT MANAGEMENT** |
| Auto-create issues | ✅ Built-in | ⚠️ Template only | 🟡 **MODERATE GAP** |
| Auto-close issues | ✅ Built-in | ⚠️ Template only | 🟡 **MODERATE GAP** |
| Manual incidents | ✅ Yes | ✅ Yes | ✅ **PARITY** |
| Incident templates | ✅ Yes | ✅ Yes | ✅ **PARITY** |
| Incident history | ✅ Full history | ✅ Last 20 incidents | 🟡 **MODERATE GAP** |
| **VISUALIZATION** |
| Response time graphs | ✅ PNG generation | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Uptime badges | ✅ Shield.io | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Status indicators | ✅ Yes | ✅ Yes | ✅ **PARITY** |
| Trend charts | ✅ Yes | ❌ Not implemented | 🔴 **MAJOR GAP** |
| **NOTIFICATIONS** |
| Slack notifications | ✅ Yes | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Telegram notifications | ✅ Yes | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Discord webhooks | ✅ Yes | ❌ Not implemented | 🔴 **MAJOR GAP** |
| Email notifications | ✅ Via GitHub | ⚠️ Via GitHub Issues | 🟢 **MINOR GAP** |
| Custom webhooks | ✅ Yes | ❌ Not implemented | 🔴 **MAJOR GAP** |
| **STATUS PAGE** |
| Standalone site | ✅ Svelte PWA | ❌ Docusaurus integration | 🟢 **BY DESIGN** |
| Embedded in docs | ❌ No | ✅ Yes | ✅ **ADVANTAGE** |
| Custom branding | ✅ Full control | ⚠️ Docusaurus theme | 🟡 **MODERATE GAP** |
| PWA support | ✅ Yes | ⚠️ Via Docusaurus | ✅ **PARITY** |
| Dark/light mode | ✅ Yes | ✅ Via Docusaurus | ✅ **PARITY** |
| **INTEGRATION** |
| Docusaurus plugin | ❌ No | ✅ Native | ✅ **ADVANTAGE** |
| Swizzlable components | ❌ No | ✅ Yes | ✅ **ADVANTAGE** |
| Theme integration | ❌ No | ✅ Full | ✅ **ADVANTAGE** |
| Route metadata | ❌ No | ✅ Yes | ✅ **ADVANTAGE** |
| **CONFIGURATION** |
| Single config file | ✅ .upptimerc.yml | ✅ docusaurus.config.js | ✅ **PARITY** |
| Demo data mode | ❌ No | ✅ Yes | ✅ **ADVANTAGE** |
| Content visibility | ❌ No | ✅ Yes | ✅ **ADVANTAGE** |
| **FLEXIBILITY** |
| Process tracking | ❌ Technical only | ✅ Any label-based | ✅ **ADVANTAGE** |
| Custom labels | ✅ Limited | ✅ Unlimited | ✅ **ADVANTAGE** |
| Custom severity | ⚠️ Limited | ✅ Flexible | ✅ **ADVANTAGE** |
| **TESTING** |
| Test coverage | ⚠️ Unknown | ✅ 95%+ | ✅ **ADVANTAGE** |
| CI/CD | ✅ Yes | ✅ Yes | ✅ **PARITY** |

### Legend
- ✅ Fully implemented
- ⚠️ Partially implemented / Template provided
- ❌ Not implemented
- 🔴 **MAJOR GAP** - Core feature missing
- 🟡 **MODERATE GAP** - Feature partially available
- 🟢 **MINOR GAP** - Alternative available
- ✅ **PARITY** - Feature equivalent
- ✅ **ADVANTAGE** - Our implementation superior

---

## 4. Detailed Gap Analysis

### 4.1 CRITICAL Gaps (Must Address for Feature Parity)

#### ❌ Response Time Tracking
**Upptime**: 
- Records response time every 6 hours
- Commits to git history
- Generates graphs
- Calculates averages across time periods

**Our Plugin**:
- No response time tracking
- No historical data storage
- No graph generation

**Impact**: Cannot show performance trends or SLA metrics

**Recommendation**: 
- Priority: **HIGH**
- Add response time recording to GitHub Service
- Store in git or database
- Generate basic charts

---

#### ❌ Uptime Percentage Calculation
**Upptime**:
- Automatic uptime % across multiple time windows
- Based on actual check results
- SLA reporting

**Our Plugin**:
- No uptime calculations
- Only shows current status

**Impact**: Cannot demonstrate reliability over time

**Recommendation**:
- Priority: **HIGH**
- Calculate uptime from issue open/close times
- Display 24h, 7d, 30d uptime percentages

---

#### ❌ Automated Health Checks (Built-in)
**Upptime**:
- Built-in GitHub Actions workflow
- Runs automatically every 5 minutes
- No setup needed beyond config

**Our Plugin**:
- Provides templates only
- Requires manual workflow setup
- Users must configure monitoring

**Impact**: Higher barrier to entry, less "turn-key"

**Recommendation**:
- Priority: **MEDIUM**
- Consider workflow auto-generation
- Or improve template documentation
- Add setup CLI tool

---

#### ❌ Historical Data Persistence
**Upptime**:
- All data in git commits
- Permanent history
- Can reconstruct any point in time

**Our Plugin**:
- Data fetched at build time only
- No historical persistence
- Lost if GitHub issues deleted

**Impact**: No long-term trend analysis

**Recommendation**:
- Priority: **HIGH**
- Store status snapshots in git
- Implement data archival strategy

---

#### ❌ Graph Generation
**Upptime**:
- Daily PNG graph generation
- Response time trends
- Embedded in status page
- Multiple time periods

**Our Plugin**:
- No graphs
- Text-based status only

**Impact**: Less visual, harder to spot trends

**Recommendation**:
- Priority: **MEDIUM**
- Add Chart.js or similar
- Generate from historical data
- Consider SVG for better quality

---

### 4.2 MODERATE Gaps (Should Address for Competitive Feature Set)

#### ⚠️ Notifications & Alerting
**Upptime**: Full suite (Slack, Telegram, Discord, webhooks)  
**Our Plugin**: None (relies on GitHub notifications)

**Recommendation**:
- Priority: **MEDIUM**
- Add Slack webhook support first (most common)
- Then Discord, Telegram
- Document GitHub notification setup

---

#### ⚠️ Uptime Badges
**Upptime**: Shield.io integration, embeddable badges  
**Our Plugin**: No badge generation

**Recommendation**:
- Priority: **LOW**
- Generate badges from uptime data
- Provide embeddable URLs
- Use shield.io format

---

#### ⚠️ Multiple Check Types
**Upptime**: HTTP, TCP, DNS, IPv6  
**Our Plugin**: HTTP only (template)

**Recommendation**:
- Priority: **LOW**
- Enhance monitor template
- Add TCP ping example
- Document custom checks

---

### 4.3 MINOR Gaps (Nice-to-Have Features)

#### 🟢 Custom Domain Support
**Upptime**: Built-in CNAME support  
**Our Plugin**: Via Docusaurus config

**Recommendation**: Document Docusaurus custom domain setup

---

#### 🟢 PWA Features
**Upptime**: Full PWA with offline support  
**Our Plugin**: Via Docusaurus PWA plugin

**Recommendation**: Document PWA plugin integration

---

### 4.4 Our ADVANTAGES (Features Upptime Doesn't Have)

#### ✅ Native Docusaurus Integration
- Seamless embedding in documentation
- Single site for docs + status
- Shared navigation and branding
- Theme consistency
- Lower hosting complexity (one site instead of two)

**Use Case**: Documentation sites that want integrated status

---

#### ✅ Process & Business Tracking
- Not limited to technical uptime
- Can track any process via labels
- Examples:
  - Support ticket backlog
  - Deployment pipeline status
  - Content review delays
  - Onboarding process health

**Use Case**: Teams tracking non-technical workflows

---

#### ✅ Flexible Label System
- Unlimited custom labels
- Custom severity levels
- Tag incidents with multiple systems
- More granular categorization

**Use Case**: Complex systems with interdependencies

---

#### ✅ Demo Data Mode
- Test without GitHub setup
- Development without API calls
- Easy evaluation
- Example data included

**Use Case**: Evaluation, development, demos

---

#### ✅ Content Visibility Controls
- Hide services or incidents independently
- Useful for staged rollout
- Privacy controls

**Use Case**: Public docs with private status tracking

---

#### ✅ Swizzlable Components
- Full component customization
- Override any UI element
- Docusaurus theming standards

**Use Case**: Custom branding beyond theme variables

---

## 5. Strategic Recommendations

### 5.1 If Goal is "Upptime for Docusaurus"

To achieve **feature parity** with Upptime, prioritize:

**Phase 1 - Core Monitoring** (2-3 weeks):
1. ✅ Implement response time tracking
2. ✅ Add uptime percentage calculations
3. ✅ Create historical data storage (git-based)
4. ✅ Auto-generate monitoring workflows (CLI tool)

**Phase 2 - Visualization** (2 weeks):
1. ✅ Add response time graphs (Chart.js)
2. ✅ Generate uptime badges
3. ✅ Create trend charts
4. ✅ Improve status indicators

**Phase 3 - Notifications** (1-2 weeks):
1. ✅ Slack webhook integration
2. ✅ Discord webhook support
3. ✅ Custom webhook framework
4. ✅ Email digest option

**Phase 4 - Advanced Monitoring** (1-2 weeks):
1. ✅ TCP ping support
2. ✅ DNS monitoring
3. ✅ IPv6 support
4. ✅ Custom check scripts

**Total Effort**: ~8-10 weeks for full parity

---

### 5.2 If Goal is "Complementary to Upptime"

Position as a **different solution** for different use cases:

**Target Users**:
- Teams already using Docusaurus
- Need status embedded in docs
- Want to track business processes
- Prefer simpler setup
- Don't need extensive monitoring

**Value Proposition**:
- "Upptime is standalone monitoring. We're status for your docs."
- "Track processes, not just uptime"
- "One site for docs and status"
- "Works with any monitoring tool"

**Feature Focus**:
1. ✅ Improve documentation integration
2. ✅ Add more process-tracking templates
3. ✅ Enhance demo data
4. ✅ Better component theming
5. ⚠️ Skip complex monitoring (use Upptime/Datadog/etc as source)

---

### 5.3 Hybrid Approach (Recommended)

Combine both strategies:

**Short-term** (v0.2.0 - v0.5.0):
- Improve what we do best (Docusaurus integration)
- Add **basic** monitoring features (response time, uptime %)
- Position as "status page for Docusaurus" not "monitoring tool"

**Mid-term** (v0.6.0 - v1.0.0):
- Add Upptime **data import** (consume Upptime's JSON API)
- Integration mode: "Use Upptime for monitoring, our plugin for display"
- Add notifications (Slack, Discord)
- Generate basic graphs

**Long-term** (v2.0.0+):
- Full monitoring parity (if demand exists)
- Or stay complementary (if integration path succeeds)

**This approach**:
- Plays to our strengths (Docusaurus)
- Doesn't compete directly with established solution
- Offers unique value (embedded status, process tracking)
- Can evolve based on user feedback

---

## 6. Competitive Positioning

### When to Choose Upptime

✅ **Use Upptime if**:
- Need standalone status page
- Want turnkey monitoring solution
- Need extensive notification integrations
- Require advanced monitoring (TCP, DNS, IPv6)
- Want git-based historical data
- Need automatic graph generation
- Don't use Docusaurus

### When to Choose docusaurus-plugin-stentorosaur

✅ **Use our plugin if**:
- Already using Docusaurus
- Want status embedded in documentation
- Need to track business processes (not just uptime)
- Prefer manual incident reporting
- Want customizable React components
- Need demo data for testing
- Want single site for docs + status
- Have custom monitoring already (and just need display)

### When to Use Both

✅ **Use both if**:
- Use Upptime for monitoring
- Import Upptime data into Docusaurus plugin for display
- Get best of both: robust monitoring + documentation integration
- **Future feature**: Upptime data import

---

## 7. Conclusion

### Current State

**docusaurus-plugin-stentorosaur** is a **solid v0.1.0-beta.0** with:
- ✅ Good Docusaurus integration
- ✅ Flexible label-based tracking
- ✅ Clean React components
- ✅ Demo data for testing
- ✅ Excellent test coverage

But it's missing **core monitoring features** that Upptime has:
- ❌ Response time tracking
- ❌ Uptime calculations
- ❌ Historical data
- ❌ Graph generation
- ❌ Built-in notifications

### Recommended Path Forward

**Option A: Complementary Tool** (Faster, lower risk)
- Focus on Docusaurus integration strengths
- Add Upptime data import
- Market as "status page for docs"
- Target existing Docusaurus users
- **Time to v1.0**: 4-6 weeks

**Option B: Full Parity** (More features, more effort)
- Implement all missing monitoring
- Compete directly with Upptime
- Target all status page users
- Risk: competing with mature solution
- **Time to v1.0**: 8-12 weeks

**Option C: Hybrid** (Balanced, recommended)
- Add basic monitoring (response time, uptime %)
- Add Upptime import for advanced users
- Focus on unique features (process tracking)
- Position as specialized for Docusaurus
- **Time to v1.0**: 6-8 weeks

### Final Recommendation

**Pursue Option C (Hybrid)**:
1. v0.2.0: Add response time + uptime tracking (2 weeks)
2. v0.3.0: Add basic graphs (1-2 weeks)
3. v0.4.0: Add Upptime data import (1-2 weeks)
4. v0.5.0: Add Slack notifications (1 week)
5. v1.0.0: Polish + documentation (1-2 weeks)

This approach:
- Differentiates from Upptime
- Provides unique value
- Achieves "good enough" parity
- Ships v1.0 in ~2 months
- Keeps scope manageable

---

## Appendix: Feature Implementation Effort Estimates

| Feature | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| Response time tracking | HIGH | 1 week | GitHub Service update |
| Uptime % calculation | HIGH | 3 days | Response time data |
| Historical data storage | HIGH | 1 week | Git integration |
| Basic graphs (Chart.js) | MEDIUM | 1 week | Historical data |
| Upptime data import | MEDIUM | 1 week | None |
| Slack notifications | MEDIUM | 3 days | Workflow enhancement |
| Discord webhooks | LOW | 2 days | Slack integration |
| Uptime badges | LOW | 3 days | Uptime calculation |
| TCP ping | LOW | 3 days | Workflow enhancement |
| IPv6 support | LOW | 2 days | Workflow enhancement |
| Auto-workflow generation | LOW | 1 week | CLI tool creation |
| PWA offline support | LOW | 3 days | Docusaurus PWA plugin |

**Total for "Hybrid" approach**: ~6-8 weeks  
**Total for "Full Parity"**: ~12-14 weeks
