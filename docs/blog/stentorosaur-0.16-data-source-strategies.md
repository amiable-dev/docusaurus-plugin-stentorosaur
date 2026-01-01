# Stentorosaur v0.16: Flexible Data Fetching for Private Repos

**TL;DR**: Stop rebuilding your site for status updates. Stentorosaur v0.16 introduces `dataSource` configuration, allowing status pages to fetch live data from GitHub, custom APIs, or local files. Private repository users can finally use runtime data fetching via server-side proxies.

## Quick Start

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur@0.16.0
```

## Before vs. After

**v0.15 (Limited to public repos):**
```javascript
{
  fetchUrl: 'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json'
  // Works for public repos only, silently fails for private repos
}
```

**v0.16 (Works everywhere):**
```javascript
{
  dataSource: {
    strategy: 'http',
    url: 'https://status-api.your-domain.workers.dev/current.json',
    // Works with private repos via server-side proxy!
  }
}
```

## Breaking the Static Barrier

Since its inception, Stentorosaur has relied on `raw.githubusercontent.com` URLs for runtime status updates. This works great for public repositories, but creates a silent failure for private repos:

```javascript
// This silently returns 404 for private repos
fetchUrl: 'https://raw.githubusercontent.com/private-org/private-repo/status-data/current.json'
```

Users with private repositories were forced into build-time-only updates, missing out on real-time status changes. We needed a better solution.

## The Solution: Configurable Data Sources

v0.16 introduces the `dataSource` option with four flexible strategies:

### 1. GitHub Strategy (Public Repos)

```javascript
dataSource: {
  strategy: 'github',
  owner: 'my-org',
  repo: 'my-repo',
  branch: 'status-data',
  path: 'current.json',
}
```

### 2. HTTP Strategy (Universal Adapter)

The HTTP strategy works with any JSON endpoint:

```javascript
// GitHub Pages
dataSource: {
  strategy: 'http',
  url: 'https://my-org.github.io/status-data/current.json',
}

// Cloudflare Worker proxy for private repos
dataSource: {
  strategy: 'http',
  url: 'https://status-api.my-domain.workers.dev/current.json',
}

// Public Gist with cache busting
dataSource: {
  strategy: 'http',
  url: 'https://gist.githubusercontent.com/user/id/raw/status.json',
  cacheBust: true,
}
```

### 3. Static Strategy (Monorepos)

For monorepo setups where status data is bundled with the site:

```javascript
dataSource: {
  strategy: 'static',
  path: '/status-data/current.json',
}
```

### 4. Build-Only Strategy

Explicitly opt out of runtime fetching:

```javascript
dataSource: {
  strategy: 'build-only',
}
```

## Design Decisions

### TypeScript Discriminated Unions

We chose TypeScript discriminated unions over a nested `strategy` + `config` approach:

```typescript
// What we chose
type DataSource =
  | { strategy: 'github'; owner: string; repo: string; branch?: string }
  | { strategy: 'http'; url: string; cacheBust?: boolean }
  | { strategy: 'static'; path: string }
  | { strategy: 'build-only' };

// What we avoided
type DataSource = {
  strategy: 'github' | 'http' | 'static' | 'build-only';
  config: GithubConfig | HttpConfig | StaticConfig | BuildOnlyConfig;
};
```

The discriminated union provides:
- Better TypeScript type narrowing in `switch` statements
- Cleaner configuration syntax
- IDE autocomplete that "just works"

### Security First

> **Warning**: Never put tokens or credentials in your `dataSource` configuration! Any headers configured in `dataSource` are bundled into your client-side JavaScript and visible to anyone viewing your site.

We added security validation that warns about common mistakes:

- **HTTPS enforcement**: HTTP URLs will be blocked on HTTPS sites due to mixed content policy
- **Sensitive headers**: `Authorization` headers would be exposed in the client bundle - use a server-side proxy instead
- **Payload size limits**: Responses over 1MB are rejected to prevent DoS
- **Schema validation**: Zod schemas validate all fetched data to prevent injection attacks

For private repos, always use a server-side proxy (like the Cloudflare Worker example above) that stores tokens in environment variables.

### Backward Compatibility

The `fetchUrl` option remains functional with automatic strategy inference:

```javascript
// This still works (deprecated)
fetchUrl: 'https://raw.githubusercontent.com/my-org/my-repo/status-data/current.json'

// Internally converts to:
dataSource: {
  strategy: 'github',
  owner: 'my-org',
  repo: 'my-repo',
  branch: 'status-data',
  path: 'current.json',
}
```

## Private Repo Solution: Server-Side Proxy

For private repositories, the recommended pattern is a lightweight server-side proxy:

```javascript
// Cloudflare Worker (status-api.workers.dev)
export default {
  async fetch(request, env) {
    const response = await fetch(
      'https://api.github.com/repos/owner/repo/contents/current.json?ref=status-data',
      {
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.raw+json'
        }
      }
    );

    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://your-status-page.com'
      }
    });
  }
};
```

Then configure Stentorosaur:

```javascript
dataSource: {
  strategy: 'http',
  url: 'https://status-api.your-domain.workers.dev/current.json',
}
```

## The useStatusData Hook

For custom status components, we've added a React hook:

```typescript
import { useStatusData } from '@amiable-dev/docusaurus-plugin-stentorosaur/hooks';

function StatusWidget() {
  const { data, loading, error, refetch } = useStatusData({
    dataSource: { strategy: 'github', owner: 'my-org', repo: 'my-repo' },
    pollInterval: 60000,
  });

  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;

  return <StatusDisplay services={data.services} onRefresh={refetch} />;
}
```

## Migration

Migration is optional. Existing configurations continue to work:

```javascript
// v0.15 config - still works in v0.16
{
  fetchUrl: 'https://raw.githubusercontent.com/...'
}

// v0.16 preferred config
{
  dataSource: { strategy: 'github', owner: '...', repo: '...' }
}
```

See the [Migration Guide](../setup/MIGRATION_0.16.md) for detailed instructions.

## What's Next

- **v0.17**: `fetchUrl` will emit deprecation warnings
- **v1.0**: `fetchUrl` will be removed

## Try It Out

```bash
npm install @amiable-dev/docusaurus-plugin-stentorosaur@0.16.0
```

Check out the [README](../../README.md) for complete documentation.

---

*This release was designed with input from an LLM council (Grok, Gemini, GPT, Claude) that reviewed the architecture. Key feedback included the discriminated union pattern and security-first approach.*
