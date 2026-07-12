/**
 * @stentorosaur/core — pure schemas and aggregation logic (ADR-005 §1).
 *
 * This package must contain NO I/O — pure functions over already-fetched
 * data only. Fetching (HTTP, GitHub API, git) belongs in
 * @stentorosaur/probe; rendering belongs in the Docusaurus plugin.
 */

export * from './types';
export * from './aggregate';
