# Migration Guide: v0.15 to v0.16

This guide helps you migrate from Stentorosaur v0.15.x to v0.16.0, which introduces the new `dataSource` configuration for flexible runtime data fetching.

## What's New in v0.16.0

- **`dataSource` configuration**: New flexible way to configure how the status page fetches live data
- **Multiple fetch strategies**: GitHub, HTTP, static files, or build-only
- **`fetchUrl` deprecation**: Legacy option still works but will be removed in v1.0
- **Improved type safety**: TypeScript discriminated unions for strategy configuration
- **Security validation**: Built-in HTTPS and sensitive header warnings
- **Zod schema validation**: Runtime validation of fetched status data

## Breaking Changes

**None!** v0.16.0 is fully backward compatible. Your existing configuration will continue to work without changes.

## Migration Steps

### Step 1: Update Your Package

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur@0.16.0
# or
yarn add @amiable-dev/docusaurus-plugin-stentorosaur@0.16.0
```

### Step 2: (Optional) Migrate from fetchUrl to dataSource

If you're currently using `fetchUrl`, you can optionally migrate to `dataSource` for improved type safety and flexibility.

#### Scenario A: Using raw.githubusercontent.com URL

**Before (v0.15):**
```javascript
{
  fetchUrl: 'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json'
}
```

**After (v0.16):**
```javascript
{
  dataSource: {
    strategy: 'github',
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'status-data',  // default
    path: 'current.json',   // default
  }
}
```

#### Scenario B: Using GitHub Gist URL

**Before (v0.15):**
```javascript
{
  fetchUrl: 'https://gist.githubusercontent.com/user/abc123/raw/status.json'
}
```

**After (v0.16):**
```javascript
{
  dataSource: {
    strategy: 'http',
    url: 'https://gist.githubusercontent.com/user/abc123/raw/status.json',
    cacheBust: true,  // Optional: bypass Gist CDN caching
  }
}
```

#### Scenario C: Using GitHub Pages URL

**Before (v0.15):**
```javascript
{
  fetchUrl: 'https://my-org.github.io/status-data/current.json'
}
```

**After (v0.16):**
```javascript
{
  dataSource: {
    strategy: 'http',
    url: 'https://my-org.github.io/status-data/current.json',
  }
}
```

#### Scenario D: Using Custom API/Proxy

**Before (v0.15):**
```javascript
{
  fetchUrl: 'https://status-api.workers.dev/current.json'
}
```

**After (v0.16):**
```javascript
{
  dataSource: {
    strategy: 'http',
    url: 'https://status-api.workers.dev/current.json',
  }
}
```

#### Scenario E: Not Using Runtime Fetching

If you weren't using `fetchUrl`, your status page only shows build-time data. This remains the default:

**v0.15 (implicit):**
```javascript
{
  // No fetchUrl = build-time only
}
```

**v0.16 (explicit, optional):**
```javascript
{
  dataSource: {
    strategy: 'build-only',
  }
}
```

### Step 3: Verify Your Configuration

Run your development server to ensure everything works:

```bash
npm run start
# or
yarn start
```

Check that:
1. The status page loads correctly at `/status`
2. Performance metrics charts display (if enabled)
3. No deprecation warnings appear in the console (if migrated to `dataSource`)

## Deprecation Timeline

| Version | Behavior |
|---------|----------|
| v0.15 | Only `fetchUrl` available |
| v0.16 | `dataSource` added, `fetchUrl` still works silently |
| v0.17 | `fetchUrl` emits deprecation warning in console |
| v1.0 | `fetchUrl` removed, only `dataSource` supported |

## TypeScript Users

If you're using TypeScript, the new `DataSource` type provides excellent IntelliSense:

```typescript
import type { DataSource } from '@amiable-dev/docusaurus-plugin-stentorosaur';

const dataSource: DataSource = {
  strategy: 'github',
  owner: 'my-org',
  repo: 'my-repo',
  // TypeScript knows branch and path are optional with defaults
};
```

The discriminated union ensures type safety:

```typescript
function handleDataSource(ds: DataSource) {
  switch (ds.strategy) {
    case 'github':
      console.log(ds.owner, ds.repo); // TS knows these exist
      break;
    case 'http':
      console.log(ds.url); // TS knows url exists
      break;
    case 'static':
      console.log(ds.path); // TS knows path exists
      break;
    case 'build-only':
      // No additional properties
      break;
  }
}
```

## New Hooks for Custom Components

v0.16.0 introduces the `useStatusData` hook for custom status components:

```typescript
import { useStatusData } from '@amiable-dev/docusaurus-plugin-stentorosaur/hooks';

function MyCustomStatusWidget() {
  const { data, loading, error, refetch } = useStatusData({
    dataSource: {
      strategy: 'github',
      owner: 'my-org',
      repo: 'my-repo',
    },
    pollInterval: 60000, // Auto-refresh every 60 seconds
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {data?.services.map(service => (
        <div key={service.name}>
          {service.name}: {service.status}
        </div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

## Security Improvements

v0.16.0 adds security validation that warns you about potential issues:

1. **HTTPS enforcement**: Warns if using HTTP URLs in production
2. **Sensitive headers**: Warns if `Authorization` or similar headers are configured (they would be exposed in the client bundle)
3. **Mixed content**: Warns about HTTP fetch from HTTPS sites
4. **Payload size**: Rejects responses over 1MB to prevent DoS

These warnings appear in the console during development and build.

## Need Help?

- **Issues**: [GitHub Issues](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues)
- **Discussions**: [GitHub Discussions](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/discussions)
- **ADR**: [ADR-001: Configurable Data Fetching Strategies](../adrs/ADR-001-configurable-data-fetching-strategies.md)
