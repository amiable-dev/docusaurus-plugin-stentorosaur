# GitHub Labels Reference

This document describes the complete label system for organizing issues, pull requests, and discussions in the Stentorosaur repository.

## Label Categories

### Type Labels (What kind of change?)

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `bug` | `#d73a4a` | Something isn't working | Issues, PRs |
| `enhancement` | `#a2eeef` | New feature or request | Issues, PRs |
| `documentation` | `#0075ca` | Improvements or additions to documentation | Issues, PRs |
| `question` | `#d876e3` | Further information is requested | Issues |
| `performance` | `#fbca04` | Performance improvements | Issues, PRs |
| `security` | `#b60205` | Security-related changes | Issues, PRs |
| `refactor` | `#ededed` | Code refactoring with no functional changes | PRs |
| `test` | `#c5def5` | Testing improvements | Issues, PRs |
| `dependencies` | `#0366d6` | Dependency updates | PRs |
| `ci` | `#28a745` | CI/CD and GitHub Actions | Issues, PRs |

### Priority Labels (How urgent?)

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `priority:critical` | `#b60205` | Blocking issue that needs immediate attention | Issues |
| `priority:high` | `#d93f0b` | High priority, should be addressed soon | Issues |
| `priority:medium` | `#fbca04` | Medium priority | Issues |
| `priority:low` | `#ededed` | Low priority, nice to have | Issues |

### Status Labels (What's happening?)

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `status:in-progress` | `#1d76db` | Currently being worked on | Issues, PRs |
| `status:on-hold` | `#fbca04` | Paused, waiting for something | Issues, PRs |
| `status:needs-info` | `#d876e3` | Needs more information from reporter | Issues |
| `status:blocked` | `#b60205` | Blocked by another issue or dependency | Issues, PRs |
| `status:ready` | `#0e8a16` | Ready to be worked on | Issues |
| `status:wip` | `#fbca04` | Work in progress, not ready for review | PRs |
| `status:needs-review` | `#1d76db` | Needs code review | PRs |
| `status:changes-requested` | `#d93f0b` | Changes requested by reviewer | PRs |

### Area Labels (Which part of the codebase?)

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `area:monitoring` | `#c2e0c6` | Health checks and uptime tracking | Issues, PRs |
| `area:incidents` | `#fef2c0` | GitHub Issues integration | Issues, PRs |
| `area:notifications` | `#bfd4f2` | Slack, Telegram, Email, Discord | Issues, PRs |
| `area:charts` | `#d4c5f9` | Visualization and metrics | Issues, PRs |
| `area:configuration` | `#fbca04` | Setup and configuration | Issues, PRs |
| `area:theme` | `#d876e3` | React components and styling | Issues, PRs |
| `area:workflows` | `#28a745` | GitHub Actions workflows | Issues, PRs |
| `area:cli` | `#ededed` | CLI tools (monitor, update-status) | Issues, PRs |
| `area:build` | `#0075ca` | Build system and tooling | Issues, PRs |

### Community Labels (Who can help?)

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `good first issue` | `#7057ff` | Good for newcomers to the project | Issues |
| `help wanted` | `#008672` | Extra attention is needed from the community | Issues |
| `beginner friendly` | `#c5def5` | Easy to understand and fix | Issues |
| `mentor available` | `#0e8a16` | Maintainer will provide guidance | Issues |

### Special Labels

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `breaking change` | `#b60205` | Introduces breaking changes | Issues, PRs |
| `duplicate` | `#cfd3d7` | Duplicate of another issue/PR | Issues, PRs |
| `wontfix` | `#ffffff` | This will not be worked on | Issues |
| `invalid` | `#e4e669` | Invalid issue or PR | Issues, PRs |
| `upstream` | `#fbca04` | Issue in upstream dependency (e.g., Upptime) | Issues |
| `upptime-related` | `#d4c5f9` | Related to Upptime compatibility | Issues, Discussions |
| `migration` | `#0075ca` | Migration from other tools | Issues, Discussions |

### Discussion Labels

| Label | Color | Description | Use On |
|-------|-------|-------------|--------|
| `discussion:idea` | `#a2eeef` | Feature idea being discussed | Discussions |
| `discussion:answered` | `#0e8a16` | Question has been answered | Discussions |
| `discussion:showcase` | `#d876e3` | Featured showcase | Discussions |

## Label Usage Guidelines

### For Issues

**Bug Report:**
```
bug
priority:medium
area:charts
status:needs-info
```

**Feature Request:**
```
enhancement
priority:low
area:notifications
help wanted
```

**Good First Issue:**
```
good first issue
beginner friendly
area:documentation
mentor available
```

### For Pull Requests

**New Feature:**
```
enhancement
area:monitoring
status:needs-review
```

**Bug Fix:**
```
bug
area:incidents
priority:high
```

**Breaking Change:**
```
breaking change
enhancement
area:configuration
```

**Documentation:**
```
documentation
area:theme
```

### For Discussions

**Q&A:**
```
question
area:configuration
discussion:answered
```

**Feature Idea:**
```
discussion:idea
area:notifications
```

**Showcase:**
```
discussion:showcase
area:charts
```

## Creating Labels (For Maintainers)

### Using GitHub CLI

```bash
# Type labels
gh label create "bug" --description "Something isn't working" --color "d73a4a"
gh label create "enhancement" --description "New feature or request" --color "a2eeef"
gh label create "documentation" --description "Improvements or additions to documentation" --color "0075ca"

# Priority labels
gh label create "priority:critical" --description "Blocking issue that needs immediate attention" --color "b60205"
gh label create "priority:high" --description "High priority, should be addressed soon" --color "d93f0b"
gh label create "priority:medium" --description "Medium priority" --color "fbca04"
gh label create "priority:low" --description "Low priority, nice to have" --color "ededed"

# Status labels
gh label create "status:in-progress" --description "Currently being worked on" --color "1d76db"
gh label create "status:needs-info" --description "Needs more information from reporter" --color "d876e3"
gh label create "status:blocked" --description "Blocked by another issue or dependency" --color "b60205"

# Area labels
gh label create "area:monitoring" --description "Health checks and uptime tracking" --color "c2e0c6"
gh label create "area:incidents" --description "GitHub Issues integration" --color "fef2c0"
gh label create "area:notifications" --description "Slack, Telegram, Email, Discord" --color "bfd4f2"
gh label create "area:charts" --description "Visualization and metrics" --color "d4c5f9"

# Community labels
gh label create "good first issue" --description "Good for newcomers to the project" --color "7057ff"
gh label create "help wanted" --description "Extra attention is needed from the community" --color "008672"

# Special labels
gh label create "breaking change" --description "Introduces breaking changes" --color "b60205"
gh label create "upptime-related" --description "Related to Upptime compatibility" --color "d4c5f9"
```

### Using GitHub Web UI

1. Go to repository → Issues → Labels
2. Click "New label"
3. Enter name, description, and color from tables above
4. Click "Create label"

## Label Automation

### GitHub Actions

Consider automating label management with GitHub Actions:

```yaml
# .github/workflows/label-management.yml
name: Label Management

on:
  issues:
    types: [opened]
  pull_request:
    types: [opened]

jobs:
  auto-label:
    runs-on: ubuntu-latest
    steps:
      - name: Auto-label PRs
        uses: actions/labeler@v4
        with:
          repo-token: "${{ secrets.GITHUB_TOKEN }}"
```

### Auto-label Rules

**Pull Request Labeler** (`.github/labeler.yml`):

```yaml
area:monitoring:
  - changed-files:
    - any-glob-to-any-file: 'src/historical-data.ts'
    - any-glob-to-any-file: 'scripts/monitor.js'

area:notifications:
  - changed-files:
    - any-glob-to-any-file: 'src/notifications/**/*'

area:charts:
  - changed-files:
    - any-glob-to-any-file: 'src/theme/*Chart*/**/*'

area:theme:
  - changed-files:
    - any-glob-to-any-file: 'src/theme/**/*'

documentation:
  - changed-files:
    - any-glob-to-any-file: '*.md'
    - any-glob-to-any-file: 'docs/**/*'

test:
  - changed-files:
    - any-glob-to-any-file: '__tests__/**/*'
    - any-glob-to-any-file: '*.test.ts'

dependencies:
  - changed-files:
    - any-glob-to-any-file: 'package.json'
    - any-glob-to-any-file: 'package-lock.json'
```

## Stale Issue Management

Use the `actions/stale` action to manage inactive issues:

```yaml
# .github/workflows/stale.yml
name: Mark stale issues

on:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v8
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          days-before-stale: 60
          days-before-close: 14
          stale-issue-label: 'status:stale'
          stale-pr-label: 'status:stale'
          exempt-issue-labels: 'priority:high,priority:critical,status:in-progress'
          stale-issue-message: >
            This issue has been automatically marked as stale because it has not had
            recent activity. It will be closed if no further activity occurs.
          close-issue-message: >
            This issue was automatically closed due to inactivity. Please reopen if
            this is still relevant.
```

## Label Best Practices

### Do:
- ✅ Use multiple labels to describe issues fully
- ✅ Update labels as issue status changes
- ✅ Use area labels to help contributors find issues
- ✅ Add `good first issue` for beginner-friendly tasks
- ✅ Mark breaking changes clearly

### Don't:
- ❌ Over-label (5-6 labels max per issue)
- ❌ Create one-off labels (use existing ones)
- ❌ Skip priority labels on bugs
- ❌ Forget to remove `status:needs-info` after info is provided

## Review Schedule

Labels should be reviewed and cleaned up:
- **Monthly:** Remove unused labels
- **Quarterly:** Review color scheme consistency
- **As needed:** Add new area labels for new features

---

**Last Updated:** 2025-11-13
**Maintainer:** @amiable-dev
