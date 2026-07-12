# Stentorosaur

Status monitoring for Docusaurus sites, powered by GitHub Issues and
GitHub Actions — similar to [Upptime](https://github.com/upptime/upptime),
but embedded in your docs site and able to track business processes as
well as technical systems.

This repository is a monorepo (see
[ADR-005](docs/adrs/ADR-005-decoupled-data-plane-and-package-split.md)):

| Package | Description |
|---------|-------------|
| [`@amiable-dev/docusaurus-plugin-stentorosaur`](packages/docusaurus-plugin-stentorosaur/) | The Docusaurus plugin (published to npm) — **full documentation lives in its [README](packages/docusaurus-plugin-stentorosaur/README.md)** |
| [`@stentorosaur/core`](packages/core/) | Pure schemas and aggregation logic (in development, epic [#63](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/63)) |
| [`@stentorosaur/probe`](packages/probe/) | Monitoring engine and I/O (in development, epic [#63](https://github.com/amiable-dev/docusaurus-plugin-stentorosaur/issues/63)) |

## Development

```bash
npm install        # installs all workspaces
npm run build      # builds all packages
npm test           # tests all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) for
workflow details, and [docs/adrs/](docs/adrs/) for architecture decisions.

## License

MIT © [Amiable Development](https://amiable.dev)
