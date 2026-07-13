/**
 * Cloudflare Worker probe (ADR-005 §6) — checks the TARGETS and sends
 * readings to GitHub via repository_dispatch; the probe-dispatch-v1.yml
 * workflow validates and commits them. The Worker holds only a
 * dispatch-capable token and never writes to git.
 */
export {default} from '@stentorosaur/probe/worker';
