/**
 * '@stentorosaur/core/server' — write-side entry point (ADR-005 §2).
 *
 * SERVER-ONLY: pulls in jsdom (sanitizer) and chrono-node (human dates).
 * Client bundles must import from the package root instead; the root
 * index deliberately does NOT re-export this module.
 */

export * from './render';
// The Workers-safe half lives in './summary' (ticket #100); re-exported
// here so existing server-side imports keep working unchanged.
export * from './summary';
