# Task 2 Summary: Fix status-update.yml Workflow

**Issue**: [#33 - Decouple monitoring data from incidents/maintenance](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/33)

## What Was Done

### 1. Updated `scripts/update-status.cjs`

Added two new CLI options to write committed data files:

- `--write-incidents`: Writes `status-data/incidents.json` with issue data
- `--write-maintenance`: Writes `status-data/maintenance.json` with maintenance windows

**Example usage:**
```bash
npx stentorosaur-update-status --write-incidents --write-maintenance --commit
```

**Data format written:**

`status-data/incidents.json`:
```json
[
  {
    "title": "Website Down - Database Connection Issues",
    "number": 42,
    "severity": "critical",
    "state": "open",
    "createdAt": "2025-11-04T10:30:00Z",
    "updatedAt": "2025-11-04T10:35:00Z",
    "closedAt": null,
    "url": "https://github.com/owner/repo/issues/42",
    "body": "Users cannot access the website..."
  }
]
```

`status-data/maintenance.json`:
```json
[
  {
    "title": "Scheduled Database Migration",
    "number": 43,
    "state": "open",
    "scheduledStart": "2025-11-05T02:00:00Z",
    "scheduledEnd": "2025-11-05T04:00:00Z",
    "createdAt": "2025-11-04T09:00:00Z",
    "url": "https://github.com/owner/repo/issues/43",
    "body": "We will be upgrading the database..."
  }
]
```

### 2. Updated `templates/workflows/status-update.yml`

**Before**: Workflow fetched data but never committed it

**After**: 
1. Runs `npx stentorosaur-update-status --write-incidents --write-maintenance --verbose`
2. Commits changes to `status-data/` directory with `[skip ci]` tag
3. Triggers immediate deployment for **critical** issues only

**Key changes:**
```yaml
- name: Update incidents and maintenance data
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: npx stentorosaur-update-status --write-incidents --write-maintenance --verbose

- name: Commit status data changes
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    
    if [ -n "$(git status --porcelain status-data/)" ]; then
      git add status-data/
      git commit -m "📊 Update incidents and maintenance data [skip ci]"
      git push
    fi

- name: Trigger deployment for critical issues
  if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'critical')
  uses: peter-evans/repository-dispatch@v3
  with:
    event-type: status-updated
    token: ${{ secrets.GITHUB_TOKEN }}
```

## How It Works

### Data Flow

```
GitHub Issues (labeled 'status')
       ↓
status-update.yml workflow (on issue events)
       ↓
update-status.cjs --write-incidents --write-maintenance
       ↓
Writes to status-data/
  - incidents.json
  - maintenance.json
       ↓
Git commit with [skip ci]
       ↓
[IF CRITICAL] Trigger deploy via repository_dispatch
       ↓
deploy.yml builds site
       ↓
Plugin reads committed JSON files
       ↓
Status page displays incidents/maintenance
```

### Workflow Triggers

The `status-update.yml` workflow runs when:

1. **Issues are opened/closed/labeled** → Updates incidents/maintenance immediately
2. **Scheduled hourly** → Keeps data fresh even without issue events
3. **Manual dispatch** → Can be triggered manually from Actions tab
4. **Push to main** (non-status-data files) → Updates on code changes

### Smart Deployment

**Regular updates**: Committed with `[skip ci]` to avoid triggering builds
- Scheduled deployments (via `deploy-scheduled.yml`) pick up changes
- Or next code push triggers build

**Critical issues**: Immediate deployment via `repository_dispatch`
- Only fires when issue has `critical` label
- Uses `peter-evans/repository-dispatch@v3` action
- Requires `deploy.yml` to handle `repository_dispatch` trigger (Task 5)

## Testing

### Local Test (without GitHub token)

```bash
# Test help text
cd test-status-site
node ../docusaurus-plugin-stentorosaur/scripts/update-status.cjs --help

# With GitHub token
export GITHUB_TOKEN=ghp_your_token_here
npx stentorosaur-update-status --write-incidents --write-maintenance --verbose
```

### Production Test

1. Create a test issue with `status` label in your repo
2. Watch the `status-update.yml` workflow run
3. Check for commit to `status-data/incidents.json`
4. Verify status page displays the incident after next deployment

## Files Changed

- ✅ `scripts/update-status.cjs` - Added `--write-incidents` and `--write-maintenance` options
- ✅ `templates/workflows/status-update.yml` - Commits data and triggers critical deployments
- ✅ `package.json` - Version bumped to 0.4.12
- ✅ `CHANGELOG.md` - Documented changes

## Next Steps (from Issue #33)

- [x] Task 1: Update plugin to read current.json, incidents.json, maintenance.json (v0.4.11)
- [x] Task 2: Fix status-update.yml to commit incidents/maintenance JSON (v0.4.12)
- [ ] Task 3: Verify CLI options work in production
- [ ] Task 4: Verify monitor-systems.yml creates critical issues correctly
- [ ] Task 5: Update deploy.yml to handle repository_dispatch trigger
- [ ] Task 6: Ensure deploy-scheduled.yml is enabled

## Version Info

- **Version**: 0.4.12
- **Date**: 2025-11-04
- **Issue**: #33 Task 2
- **Status**: ✅ Ready for testing
