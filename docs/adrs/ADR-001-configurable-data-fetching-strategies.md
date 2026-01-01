# ADR-001: Configurable Data Fetching Strategies for Private Repositories

## Status

**DRAFT** - Revised based on LLM Council feedback (2026-01-01)

## Date

2026-01-01

## Context

### Problem Statement

The plugin's `fetchUrl` option assumes public `raw.githubusercontent.com` access, which:

1. **Fails silently with 404** for private repositories
2. **Forces private repo users** to forgo runtime updates entirely
3. **Provides no clear error message** indicating why it failed

**Impact**: A significant portion of potential users (enterprise, private projects) cannot use runtime data fetching, limiting the plugin to build-time-only for these use cases.

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Current: fetchUrl for Public Repos Only                        │
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐                │
│  │ Public Repo     │         │ Status Page     │                │
│  │ status-data     │◀────────│ fetchUrl works  │                │
│  │ branch          │   ✓     │                 │                │
│  └─────────────────┘         └─────────────────┘                │
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐                │
│  │ Private Repo    │         │ Status Page     │                │
│  │ status-data     │────X────│ fetchUrl fails  │                │
│  │ branch          │   404   │ (auth required) │                │
│  └─────────────────┘         └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Requirements

1. **Backward Compatibility**: Existing public repo configurations must continue to work unchanged
2. **Private Repo Support**: Provide viable options for private repository users
3. **Minimal Infrastructure**: Prefer solutions that stay within the GitHub ecosystem
4. **Security**: Never expose tokens or credentials client-side
5. **Developer Experience**: Configuration should be simple and well-documented
6. **Cost**: Free or minimal cost solutions preferred

## Decision

We propose implementing a **configurable data source** system using a **discriminated union** pattern that allows users to choose the approach that best fits their repository visibility and infrastructure preferences.

### Revised Configuration Schema (Based on Council Feedback)

The council unanimously recommended flattening the schema to use proper TypeScript discriminated unions:

```typescript
/**
 * Data source configuration - discriminated union for type safety
 */
type DataSource =
  // 1. GitHub Raw (public repos only)
  | {
      strategy: 'github';
      owner: string;
      repo: string;
      branch?: string;  // default: 'status-data'
      path?: string;    // default: 'current.json'
    }

  // 2. Generic HTTP (covers Pages, S3, R2, Gists, custom proxies)
  | {
      strategy: 'http';
      url: string;
      headers?: Record<string, string>;  // Build-time only, NOT runtime
      cacheBust?: boolean;  // Opt-in cache busting
    }

  // 3. Static/Local file (monorepo support)
  | {
      strategy: 'static';
      path: string;  // e.g., './status-data/current.json'
    }

  // 4. Build-only (no runtime fetch)
  | {
      strategy: 'build-only';
    };
```

### Key Design Changes from Original Proposal

Based on council feedback, we made these significant changes:

| Original | Revised | Rationale |
|----------|---------|-----------|
| Nested `strategy` + `config` | Flat discriminated union | Better TypeScript narrowing, cleaner DX |
| 5 strategies (raw, gist, pages, proxy, build-only) | 4 strategies (github, http, static, build-only) | `http` is a universal adapter covering gist/pages/proxy |
| `dataStrategy` naming | `dataSource` naming | More intuitive - describes "where" not "how" |
| Auto-detect from URL patterns | Auto-detect only for legacy `fetchUrl` | Reduces "magic", easier debugging |

### Strategy Consolidation

The council noted that `gist`, `pages`, and `proxy` are functionally identical - they all fetch JSON from a URL. The `http` strategy serves as a **universal adapter**:

```typescript
// All of these use the 'http' strategy:
{ strategy: 'http', url: 'https://gist.githubusercontent.com/user/id/raw/status.json' }
{ strategy: 'http', url: 'https://myorg.github.io/status-data/current.json' }
{ strategy: 'http', url: 'https://status-api.workers.dev/current.json' }
{ strategy: 'http', url: 'https://my-bucket.s3.amazonaws.com/status.json' }
```

### Simplified Configuration (Backward Compatible)

```javascript
// Option 1: Simple URL string (auto-fetched as-is)
{
  dataSource: 'https://myproxy.workers.dev/status.json'
}

// Option 2: Explicit strategy configuration
{
  dataSource: {
    strategy: 'github',
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'status-data'
  }
}

// Option 3: Legacy fetchUrl still works (deprecated)
{
  fetchUrl: 'https://raw.githubusercontent.com/owner/repo/status-data'
}
```

### Implementation Details

#### 1. Type-Safe Strategy Handling

```typescript
function fetchStatusData(config: DataSource): Promise<StatusData> {
  switch (config.strategy) {
    case 'github':
      // TypeScript knows: config.owner, config.repo exist
      return fetchFromGitHub(config.owner, config.repo, config.branch, config.path);

    case 'http':
      // TypeScript knows: config.url exists
      return fetchFromUrl(config.url, config.headers, config.cacheBust);

    case 'static':
      // TypeScript knows: config.path exists
      return readLocalFile(config.path);

    case 'build-only':
      return Promise.resolve(null); // Use build-time data

    default:
      // Exhaustive check - TypeScript error if we miss a case
      const _exhaustive: never = config;
      throw new Error(`Unknown strategy: ${_exhaustive}`);
  }
}
```

#### 2. Legacy Backward Compatibility

```typescript
function resolveDataSource(options: PluginOptions): DataSource {
  // New config takes precedence
  if (options.dataSource) {
    // If string, treat as URL
    if (typeof options.dataSource === 'string') {
      return { strategy: 'http', url: options.dataSource };
    }
    return options.dataSource;
  }

  // Legacy fetchUrl support (deprecated)
  if (options.fetchUrl) {
    console.warn('[Stentorosaur] fetchUrl is deprecated. Use dataSource instead.');
    return inferStrategyFromUrl(options.fetchUrl);
  }

  // Default: build-only
  return { strategy: 'build-only' };
}
```

## Security Considerations

**Critical**: The council unanimously flagged security as under-addressed. This section is mandatory.

### 1. No Secrets in Client Bundles

```typescript
// NEVER DO THIS - secrets will be exposed in browser
{
  strategy: 'http',
  url: 'https://api.github.com/repos/...',
  headers: { 'Authorization': 'Bearer ghp_EXPOSED_TOKEN' }  // BAD!
}
```

**Rule**: The `headers` option is for **build-time fetching only**. Runtime fetching in the browser cannot include authentication headers safely.

For private data access:
1. Use a server-side proxy (Cloudflare Worker, Vercel Edge Function)
2. Store secrets in the proxy's environment variables
3. The browser fetches from the proxy, which adds auth headers server-side

### 2. CORS and Mixed Content

```typescript
function validateDataSource(config: DataSource, context: 'build' | 'runtime') {
  if (config.strategy === 'http' && context === 'runtime') {
    const url = new URL(config.url);

    // Warn about HTTP URLs on HTTPS sites
    if (url.protocol === 'http:' && typeof window !== 'undefined') {
      console.warn('[Stentorosaur] HTTP URL will fail on HTTPS sites due to mixed content policy');
    }

    // Note: CORS must be configured on the server
  }
}
```

### 3. Data Validation

All fetched data is validated against a strict schema to prevent:
- Prototype pollution attacks
- Oversized payloads (DoS)
- Malformed data crashing the UI

```typescript
import { z } from 'zod';

const StatusDataSchema = z.object({
  services: z.array(z.object({
    name: z.string().max(100),
    status: z.enum(['operational', 'degraded', 'outage', 'maintenance']),
    latency: z.number().optional(),
  })).max(100),
  timestamp: z.string().datetime().optional(),
}).refine(
  data => JSON.stringify(data).length < 1_000_000,
  { message: 'Status data exceeds 1MB limit' }
);
```

### 4. Proxy Hardening Guidelines

For users implementing custom proxies:

```javascript
// Cloudflare Worker example with security best practices
export default {
  async fetch(request, env) {
    // 1. Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // 2. Hardcode upstream URL - never accept from query params
    const upstreamUrl = 'https://api.github.com/repos/owner/repo/contents/current.json?ref=status-data';

    // 3. Add auth header server-side
    const response = await fetch(upstreamUrl, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.raw+json'
      }
    });

    // 4. Set appropriate CORS headers
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://your-status-page.com', // Restrict!
        'Cache-Control': 'public, max-age=60'
      }
    });
  }
};
```

## Caching Behavior

### Per-Strategy Caching

| Strategy | Cache Behavior | Notes |
|----------|---------------|-------|
| `github` | GitHub's CDN (~5 min) | No control |
| `http` | Server-defined | Respect `Cache-Control` headers |
| `static` | Build-time only | No runtime caching |
| `build-only` | N/A | Data baked into build |

### Gist/GitHub Pages Caching

GitHub Gists and Pages have ~60 second CDN caching. We intentionally **do not** auto-bust this cache because:

1. It increases load on GitHub's infrastructure
2. It may trigger rate limiting
3. 60-second freshness is acceptable for status pages

If users need faster updates, they should use the `http` strategy with their own endpoint that sets appropriate cache headers.

**Opt-in cache busting** is available for users who explicitly need it:

```typescript
{
  strategy: 'http',
  url: 'https://gist.githubusercontent.com/.../status.json',
  cacheBust: true  // Appends ?t=timestamp
}
```

## Testing Strategy

### Testing Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Weekly, real services
                    │  (Playwright)   │
                    ├─────────────────┤
                    │  Integration    │  ← MSW mocked servers
                    │    Tests        │
                    ├─────────────────┤
                    │   Unit Tests    │  ← Most coverage here
                    │ (Strategy logic)│
                    └─────────────────┘
```

### Unit Tests

- Config validation and error messages
- URL construction per strategy
- Type narrowing correctness
- Schema validation edge cases

### Integration Tests (MSW)

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://raw.githubusercontent.com/:owner/:repo/:branch/*', ({ params }) => {
    if (params.owner === 'private-org') {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(mockStatusData);
  })
);
```

### E2E Tests (Weekly CI)

Real service integration tests run on a schedule, not per-commit, to avoid:
- Rate limiting
- Flaky tests from network issues
- Secrets exposure in PR CI

## Migration Path

| Version | Behavior |
|---------|----------|
| v0.15 (current) | Only `fetchUrl` |
| v0.16 | Add `dataSource`, `fetchUrl` still works silently |
| v0.17 | Deprecation warning for `fetchUrl` |
| v1.0 | Remove `fetchUrl`, only `dataSource` |

## Consequences

### Positive

1. **Private repo support**: Users with private repositories can now use runtime data fetching
2. **Type safety**: Discriminated unions provide excellent TypeScript DX
3. **Flexibility**: Universal `http` strategy covers any JSON endpoint
4. **Backward compatible**: Existing configurations continue to work
5. **Security-first**: Explicit guidance on secrets handling

### Negative

1. **Increased complexity**: More configuration options to document
2. **Testing burden**: Each strategy needs integration testing
3. **Breaking change at v1.0**: `fetchUrl` removal requires migration

### Risks

1. **User confusion**: Must clearly document when to use each strategy
2. **Proxy maintenance**: Users with custom proxies have operational burden
3. **GitHub API changes**: Could break `github` strategy URL construction

## Implementation Checklist

- [ ] Add `DataSource` type to `src/types.ts`
- [ ] Add `dataSource` to Joi validation schema
- [ ] Implement strategy resolver in plugin `index.ts`
- [ ] Create `useStatusData` hook with strategy switching
- [ ] Update `StatusPage` component to use hook
- [ ] Update `UptimeStatusPage` component to use hook
- [ ] Add Zod schema validation for fetched data
- [ ] Add security validation (HTTPS check, etc.)
- [ ] Create workflow recipe documentation
- [ ] Add migration guide for existing users
- [ ] Add unit tests for all strategies
- [ ] Add MSW integration tests
- [ ] Update main `README.md` with examples

## Appendix: Configuration Examples

### Public Repository (GitHub Strategy)

```javascript
// docusaurus.config.js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {
    owner: 'my-org',
    repo: 'my-public-repo',
    dataSource: {
      strategy: 'github',
      owner: 'my-org',
      repo: 'my-public-repo',
      branch: 'status-data'
    }
  }]
]
```

### Private Repository with Cloudflare Worker

```javascript
// docusaurus.config.js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {
    owner: 'my-org',
    repo: 'my-private-repo',
    dataSource: {
      strategy: 'http',
      url: 'https://status-api.my-domain.workers.dev/current.json'
    }
  }]
]
```

### Private Repository with Public Gist

```javascript
// docusaurus.config.js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {
    owner: 'my-org',
    repo: 'my-private-repo',
    dataSource: {
      strategy: 'http',
      url: 'https://gist.githubusercontent.com/myuser/abc123/raw/current.json',
      cacheBust: true  // Opt-in for gist caching workaround
    }
  }]
]
```

### Monorepo with Local File

```javascript
// docusaurus.config.js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {
    owner: 'my-org',
    repo: 'my-monorepo',
    dataSource: {
      strategy: 'static',
      path: './packages/status-data/current.json'
    }
  }]
]
```

### Build-Only (No Runtime Fetch)

```javascript
// docusaurus.config.js
plugins: [
  ['@amiable-dev/docusaurus-plugin-stentorosaur', {
    owner: 'my-org',
    repo: 'my-repo',
    dataSource: {
      strategy: 'build-only'
    }
  }]
]
```

## References

- [GitHub Raw URLs for Private Repos](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Mock Service Worker (MSW)](https://mswjs.io/)
- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

## Council Review Notes

This ADR was reviewed by an LLM council (Grok, Gemini, GPT, Claude) on 2026-01-01. Key consensus points:

1. **Unanimous**: Use discriminated unions, not nested `strategy` + `config`
2. **Unanimous**: Consolidate strategies - `http` is a universal adapter
3. **Unanimous**: Rename to `dataSource`
4. **Unanimous**: Add explicit security section for secrets handling
5. **Majority**: Auto-detection only for legacy backward compatibility
6. **Majority**: Don't auto-bust gist cache; make it opt-in
