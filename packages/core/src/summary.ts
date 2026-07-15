/**
 * '@stentorosaur/core/summary' — the WORKERS-SAFE write-side entry
 * (ADR-006 ticket #100).
 *
 * Everything here runs in the Cloudflare Workers runtime: aggregation,
 * the atom feed, and maintenance-frontmatter parsing (chrono-node is
 * pure JS). The full './server' barrel additionally re-exports the
 * jsdom sanitizer, which does NOT run in Workers — Worker bundles must
 * import from HERE, never from './server'.
 */

export * from './maintenance';
export * from './build-summary';
export * from './atom';
