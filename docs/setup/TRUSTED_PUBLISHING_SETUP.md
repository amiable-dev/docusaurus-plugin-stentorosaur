# NPM Trusted Publishing Setup Guide

This guide explains how to configure NPM trusted publishing for the `@amiable-dev/docusaurus-plugin-stentorosaur` package.

## What is Trusted Publishing?

Trusted publishing allows you to publish to npm without using long-lived access tokens. Instead, it uses short-lived OIDC tokens from GitHub Actions, which is more secure as there are no tokens to leak or rotate.

## Benefits

- **More Secure**: No long-lived tokens that could be compromised
- **Simpler**: No need to manage and rotate tokens
- **Provenance**: Automatically generates attestations showing where packages were built
- **Transparency**: npm users can verify the package came from your GitHub repository

## Setup Steps

### 1. Configure NPM Trusted Publishing

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Go to your package: `@amiable-dev/docusaurus-plugin-stentorosaur`
3. Navigate to **Settings** → **Publishing Access**
4. Click **Configure Trusted Publishing**
5. Select **GitHub Actions** as the provider
6. Fill in the details:
   - **Repository Owner**: `amiable-dev`
   - **Repository Name**: `docusaurus-plugin-stentorosaur`
   - **Workflow Name**: `publish.yml`
   - **Environment Name**: (leave blank or set to `production` if you want extra approval)

### 2. GitHub Actions Workflow

The workflow has already been created at `.github/workflows/publish.yml` with these key features:

```yaml
permissions:
  contents: read
  id-token: write # Required for OIDC token generation
```

The workflow:

- Triggers on GitHub releases
- Runs tests and builds the package
- Publishes with `--provenance` flag for attestations
- Uses `NODE_AUTH_TOKEN` for authentication (provided by OIDC)

### 3. Remove Old NPM_TOKEN Secret (Optional)

Once trusted publishing is configured and tested, you can remove the `NPM_TOKEN` secret from your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Delete the `NPM_TOKEN` secret

**Note**: Keep it temporarily until you've verified trusted publishing works.

## Publishing Process

### Creating a Release

1. **Update version** in `package.json`:

   ```bash
   npm version patch  # or minor, major, prepatch, preminor, premajor
   ```

2. **Commit and tag**:

   ```bash
   git add package.json
   git commit -m "Release v0.1.1"
   git tag v0.1.1
   git push && git push --tags
   ```

3. **Create GitHub Release**:
   - Go to [Releases](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/releases)
   - Click **Draft a new release**
   - Select the tag you just created
   - Add release notes
   - Click **Publish release**

4. **Automatic Publishing**:
   - The GitHub Actions workflow will automatically trigger
   - It will run tests, build, and publish to npm
   - Check the [Actions tab](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions) for progress

### Beta Releases

For beta releases, update the version with a prerelease identifier:

```bash
npm version 0.2.0-beta.0
git push && git push --tags
```

Then create a GitHub release marked as "pre-release".

## Verifying Provenance

After publishing, you can verify the package provenance:

```bash
npm view @amiable-dev/docusaurus-plugin-stentorosaur --json | jq .dist.attestations
```

Users can also see the provenance on npm:

```text
https://www.npmjs.com/package/@amiable-dev/docusaurus-plugin-stentorosaur?activeTab=code
```

## Troubleshooting

### "Permission denied" error

Ensure the workflow has `id-token: write` permission.

### "Not authorized" error

1. Check that trusted publishing is configured correctly on npmjs.com
2. Verify the repository owner, name, and workflow name match exactly
3. Ensure the workflow is running from the main branch (or the branch you configured)

### Package not publishing

1. Check the [Actions tab](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/actions) for errors
2. Ensure the release was published (not saved as draft)
3. Verify all tests pass in the workflow

## Migration from Token-Based Publishing

If you're currently using `NPM_TOKEN`:

1. Set up trusted publishing as described above
2. Create a test release to verify it works
3. Once verified, delete the `NPM_TOKEN` secret from GitHub
4. Update `publish.yml` to remove the `NODE_AUTH_TOKEN` environment variable (it's provided automatically by OIDC)

## Security Best Practices

1. **Use branch protection**: Require pull request reviews before merging to main
2. **Use environments**: Add a `production` environment with required reviewers for extra safety
3. **Monitor releases**: Watch the repository to get notified of new releases
4. **Review workflow runs**: Check the Actions tab after each release

## Resources

- [NPM Trusted Publishing Documentation](https://docs.npmjs.com/trusted-publishers)
- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [NPM Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements)
