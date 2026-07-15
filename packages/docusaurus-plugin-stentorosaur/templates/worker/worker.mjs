/**
 * Cloudflare Worker probe. The mode is selected by the bindings:
 *
 * - Dispatch mode (ADR-005 §6, wrangler.toml): checks the TARGETS and
 *   sends readings to GitHub via repository_dispatch; the
 *   probe-dispatch-v1.yml workflow validates and commits them. The
 *   Worker holds only a dispatch-capable token and never writes to git.
 * - Profile C (ADR-006, wrangler-r2.toml): a STATUS_BUCKET R2 binding
 *   is present — the Worker writes status/v1 to the bucket directly
 *   (no GitHub credentials), serves it via `fetch`, and runs the daily
 *   compaction pass on the COMPACTION_CRON trigger.
 */
export {default} from '@stentorosaur/probe/worker';
