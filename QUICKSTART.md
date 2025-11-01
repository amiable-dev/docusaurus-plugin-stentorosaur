# Quick Start Guide

Get your status page up and running in minutes!

## Step 1: Install the Plugin

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur
```

## Step 2: Setup GitHub Token (Optional)

**For local development**, create a `.env` file:

```bash
# .env
GITHUB_TOKEN=ghp_your_personal_access_token
```

Create a Personal Access Token at <https://github.com/settings/tokens> with `repo` or `public_repo` scope.

> **Note:**
>
> - For **GitHub Actions deployments**, `secrets.GITHUB_TOKEN` is automatically provided - no setup needed!
> - Without a token, the plugin shows **demo data** (useful for testing)
> - See the [README](./README.md#github-token-setup) for detailed token setup

## Step 3: Configure Docusaurus

Add to your `docusaurus.config.js`:

```javascript
module.exports = {
  plugins: [
    [
      '@amiable-dev/docusaurus-plugin-stentorosaur',
      {
        owner: 'your-github-org',
        repo: 'your-repo',
        systemLabels: ['api', 'website', 'database'],
        token: process.env.GITHUB_TOKEN,
      },
    ],
  ],
};
```

## Step 3: Set up GitHub Actions

### Option A: Automated Monitoring

Copy the monitoring workflow:

```bash
mkdir -p .github/workflows
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/monitor-systems.yml .github/workflows/
```

Edit the workflow to add your endpoints:

```yaml
system: 
  - name: 'api'
    url: 'https://api.example.com/health'
  - name: 'website'
    url: 'https://example.com'
```

### Option B: Manual Status Updates

Copy the status update workflow:

```bash
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/workflows/status-update.yml .github/workflows/
```

This workflow automatically updates status data when issues change using the CLI command:

```bash
npx stentorosaur-update-status
```

**CLI Options:**

- `--help` - Show usage information
- `--output-dir <path>` - Custom output directory (default: build/status-data)
- `--verbose` - Enable detailed logging
- `--commit` - Auto-commit changes with emoji messages (🟩🟨🟥📊)

You can also run this command locally to update status data:

```bash
# Basic usage
npx stentorosaur-update-status

# With custom output directory
npx stentorosaur-update-status --output-dir ./public/status

# With verbose logging and auto-commit
npx stentorosaur-update-status --verbose --commit
```

And optionally the issue template:

```bash
mkdir -p .github/ISSUE_TEMPLATE
cp node_modules/@amiable-dev/docusaurus-plugin-stentorosaur/templates/ISSUE_TEMPLATE/status-issue.yml .github/ISSUE_TEMPLATE/
```

## Step 4: Create Your First Status Issue

Create a new GitHub issue with these labels:

- `status` (required)
- `api` (or whatever system label you configured)
- `critical` (or `major`, `minor`, `maintenance`)

Example:

- Title: "API experiencing high latency"
- Labels: `status`, `api`, `major`
- Body: Description of the issue

## Step 5: View Your Status Page

Start your Docusaurus dev server:

```bash
npm run start
```

Navigate to: `http://localhost:3000/status`

## Next Steps

### Customize Your Status Page

Edit the plugin configuration to customize:

```javascript
{
  title: 'Our System Status',
  description: 'Real-time status of all our services',
  showResponseTimes: true,
  showUptime: true,
}
```

### Set Up Authentication

For private repositories, create a GitHub Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Add to your environment: `GITHUB_TOKEN=your_token_here`

### Monitor More Systems

Add more systems to track:

```javascript
systemLabels: [
  'api',
  'website',
  'database',
  'auth',
  'ci-cd',
  'support',
  'onboarding',
]
```

### Embed Status Components

Use the components in your docs:

```mdx
import StatusBoard from '@theme/StatusBoard';

<StatusBoard items={yourStatusItems} />
```

## Troubleshooting

### No status data showing?

1. Check that GitHub Actions have run
2. Verify issues have the `status` label
3. Ensure `systemLabels` match your issue labels

### Build errors?

1. Run `npm install` to ensure all dependencies are installed
2. Check TypeScript compilation: `npm run build`
3. Verify your Node.js version (requires ≥18.0)

## Need Help?

- 📖 Read the [full documentation](README.md)
- 🐛 [Report an issue](https://github.com/your-org/docusaurus-plugin-stentorosaur/issues)
- 💬 [Join discussions](https://github.com/your-org/docusaurus-plugin-stentorosaur/discussions)
