# Documentation Index

Documentation for the Stentorosaur plugin, v1 (ADR-005 architecture).
A hosted doc site is tracked in
[#95](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/95).

## Start here

- [README](../packages/docusaurus-plugin-stentorosaur/README.md) — overview, features, options
- [QUICKSTART](../QUICKSTART.md) — new site in ~10 minutes
- [MIGRATION_1.0](./setup/MIGRATION_1.0.md) — upgrading from 0.x (history preserved)
- [CHANGELOG](../CHANGELOG.md)

## Reference

- [CONFIGURATION](./reference/CONFIGURATION.md) — `stentorosaur.config.js` + plugin options
- [DATA_PLANE](./reference/DATA_PLANE.md) — the `status/v1` contract, CLI, workflows, incident lifecycle
- [NOTIFICATIONS](./reference/NOTIFICATIONS.md) — the atom feed and its consumers
- [Workflow templates](../packages/docusaurus-plugin-stentorosaur/templates/workflows/README.md) — serving options, Cloudflare Worker probe, quota math

## Architecture

- [ADR-005](./adrs/ADR-005-decoupled-data-plane-and-package-split.md) — the v1 architecture (data plane, package split, trust models). Earlier ADRs in [adrs/](./adrs/).

## Maintainers

- [RELEASE_1.0_RUNBOOK](./setup/RELEASE_1.0_RUNBOOK.md) — release steps, npm trusted publishing, 0.x deprecation schedule
- [PUBLISHING](./setup/PUBLISHING.md) / [TRUSTED_PUBLISHING_SETUP](./setup/TRUSTED_PUBLISHING_SETUP.md)

## Archive

Historical 0.x documentation lives in [archive/](./archive/) — it
describes machinery deleted at the v1.0 cutover and is kept for
reference only.
