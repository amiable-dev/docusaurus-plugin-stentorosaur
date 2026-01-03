# Stentorosaur Templates

This directory contains templates for setting up status monitoring in your Docusaurus site.

## Quick Start

### Option 1: Include Makefile (Recommended)

Add this line to your project's `Makefile`:

```makefile
include node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/Makefile.status
```

Then run:

```bash
make status-help      # See all available commands
make status-init      # Initialize status monitoring
```

### Option 2: Copy Makefile

Copy `Makefile.status` to your project root:

```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/Makefile.status ./Makefile
```

## Available Commands

| Command | Description |
|---------|-------------|
| `make status-help` | Show all available commands |
| `make status-init` | Initialize status monitoring configuration |
| `make status-workflows` | Copy GitHub Actions workflow templates |
| `make status-add-system name=api url=https://...` | Add a system to monitor |
| `make status-add-process name=deployments` | Add a business process to track |
| `make status-list` | List configured systems and processes |
| `make status-test` | Test monitoring (dry run) |
| `make status-run` | Run monitoring check |
| `make status-update` | Update status from GitHub issues |

## Adding Systems

```bash
# Basic usage
make status-add-system name=api url=https://api.example.com/health

# With options
make status-add-system name=api url=https://api.example.com/health method=POST timeout=5000 expected=200,201
```

## Adding Business Processes

```bash
# Track deployments
make status-add-process name=deployments description="CI/CD pipeline"

# Track onboarding
make status-add-process name=onboarding description="Customer onboarding process"
```

## GitHub Actions Workflows

Copy the workflow templates to your project:

```bash
make status-workflows
```

This copies:
- `monitor-systems.yml` - Runs health checks every 5 minutes
- `status-update.yml` - Updates status on issue events
- `deploy.yml` - Deploys status page
- `compress-archives.yml` - Compresses historical data

## Configuration Files

After running `make status-init`, you'll have:

```
.monitorrc.json              # Monitoring endpoints configuration
.stentorosaur-entities.json  # Entity definitions for docusaurus.config
status-data/                 # Status data directory
```

## Docusaurus Config

After adding systems and processes, generate the config snippet:

```bash
npx stentorosaur-config generate
```

This outputs a snippet to add to your `docusaurus.config.js`.
