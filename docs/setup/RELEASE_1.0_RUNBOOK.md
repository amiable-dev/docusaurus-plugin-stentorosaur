# v1.0.0 Release Runbook (human steps)

The epic (#63) merged everything code-side: plugin at 1.0.0,
`@stentorosaur/core` and `@stentorosaur/probe` at 0.1.0, ADR-005
IMPLEMENTED, `v0.22-maintenance` branch cut. Two human tasks remain
before the release, plus the release itself. Work them in order.

---

## 1. npm scope + trusted publishing for the two NEW packages

`publish.yml` publishes **core → probe → plugin** in one run (core
first, so nothing downstream can ship with an unresolvable dependency).
The plugin package already has trusted publishing configured (see
`TRUSTED_PUBLISHING_SETUP.md`); the two new packages need the scope and
their own trust configuration.

### 1a. Create the npm org (scope)

1. Log in to [npmjs.com](https://www.npmjs.com).
2. Avatar menu → **Add Organization**.
3. Name: **`stentorosaur`** (this is the `@stentorosaur/` scope). The
   free (public packages) plan is sufficient.

### 1b. First publish — the chicken-and-egg

npm trusted publishing is configured **per package**, in the package's
settings page — which does not exist until the package has been
published once. Two options for the first publish of `core` and
`probe`:

- **Option A (recommended, keeps "never publish locally"):** create a
  **granular access token** on npmjs.com (Access Tokens → Generate New
  Token → Granular) scoped to *Read and write* on the `stentorosaur`
  org packages, expiry ≤ 30 days. Add it to the repo as the
  `NODE_AUTH_TOKEN` secret, add `NODE_AUTH_TOKEN:
  ${{ secrets.NODE_AUTH_TOKEN }}` env to the two publish steps in
  `publish.yml` **temporarily**, run the release (step 3), then delete
  the token from npm and the secret + env lines from the workflow.
- **Option B:** a one-time manual `npm publish --access public` from
  `packages/core` and `packages/probe` at 0.1.0. This contradicts the
  repo's "never publish locally" rule — use only if Option A is
  blocked, and say so in the release notes.

### 1c. Configure trusted publishing (after first publish)

For **each** of `@stentorosaur/core` and `@stentorosaur/probe`:

1. npmjs.com → the package → **Settings** → **Publishing Access** →
   **Configure Trusted Publishing**.
2. Provider: **GitHub Actions**. Fill in:
   - Repository Owner: `amiable-dev`
   - Repository Name: `docusaurus-plugin-stentorosaur`
   - Workflow Name: `publish.yml`
   - Environment: leave blank
3. Optionally set "Require trusted publishing" once verified working.

If Option A was used, remove the token env lines from `publish.yml`
now — subsequent releases run purely on OIDC.

---

## 2. test-status-site: end-to-end migration validation

This validates `docs/setup/MIGRATION_1.0.md` against a real site with
real history and real Pages serving (the one acceptance criterion of
#77 that needs repo-settings access). In the `test-status-site` repo:

1. **Upgrade** (against a published RC or `file:` links to this repo's
   built packages):
   ```bash
   npm install @amiable-dev/docusaurus-plugin-stentorosaur@^1.0.0
   npm install -D @stentorosaur/probe
   ```
2. **Config conversion**: `npx stentorosaur migrate` — first run
   converts `.monitorrc.json` → `stentorosaur.config.js`, then stops.
   Fill in `owner`/`repo`.
3. **Data migration**:
   ```bash
   npx stentorosaur migrate --dry-run   # inspect the exact file plan
   npx stentorosaur migrate             # converts + pushes to status-data
   npx stentorosaur doctor              # must pass (staleness is a warning)
   ```
   Verify the 90-day view: day-level uptime in the new
   `status/v1/summary.json` should match the old `daily-summary.json`.
4. **Pages**: repo Settings → Pages → Deploy from branch →
   `status-data` / root. Set the plugin's `dataUrl` to
   `https://<user>.github.io/<repo>/status/v1/summary.json`.
5. **Workflows**: install `probe-v1.yml`, `status-update-v1.yml`,
   `compact-data-branch-v1.yml`, `deploy-v1.yml` from
   `templates/workflows/`; delete `monitor-systems.yml` and
   `status-update.yml` (one prober per entity — see the templates
   README).
6. **Verify in the browser**: `/status` renders the full history
   (uptime bars ~90 days deep, not reset); open a test incident issue
   and confirm it appears within one CDN TTL (≤ ~10 min) without a site
   deploy.
7. Remove the legacy `status-data` files from the site repo's main
   branch once satisfied (migrate never deletes them).

Fixes discovered here go to `main` as normal PRs before the release.

---

## 3. The release itself

1. Confirm `main` is green and versions are: plugin `1.0.0`, core
   `0.1.0`, probe `0.1.0` (already set by PR #92).
2. Create the tag and a **GitHub Release** — `publish.yml` triggers on
   *release published*, not on tag push:
   ```bash
   git tag v1.0.0 && git push --tags
   gh release create v1.0.0 --title "v1.0.0" --notes-file <(sed -n '/## \[1.0.0\]/,/## \[0.21.10\]/p' CHANGELOG.md)
   ```
3. Watch the publish run: core → probe → plugin must all succeed.
4. Post-release: verify `npm view @stentorosaur/probe@0.1.0` and that
   the pinned `@stentorosaur/probe@0.1.0` in the three workflow
   templates resolves; then announce (the notifications gap +
   incidents.atom substitute is documented in MIGRATION_1.0.md).
