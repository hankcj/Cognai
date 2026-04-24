# Cognai

Cognai is an open source, local-first MCP server that models a person's or organization's cognitive architecture so AI systems can respond in service of what actually matters to them.

## Status

This repository is in early setup. The current focus is establishing the project foundation for:

- a TypeScript-based MCP server
- a CLI for initialization, syncing, and inspection
- a graph-backed cognitive model grounded in the product requirements document

See [cognai-prd.md](./cognai-prd.md) for the current product definition.

## Product Direction

Cognai is designed around a few core ideas:

- represent the user's mind, do not simulate it
- store values, goals, beliefs, identity claims, and tensions as a weighted directed graph
- keep retrieval lean by returning only the relevant subgraph for a given query
- preserve provenance so inferred nodes can always be explained

## Planned Repository Structure

```text
src/
  commands/      CLI entry points
  config.ts      configuration defaults and paths
  server.ts      MCP server bootstrap
  types.ts       shared domain types
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Development

```bash
npm run dev -- --help
```

### Build

```bash
npm run build
```

## Initial CLI Surface

The scaffold includes placeholder commands for:

- `cognai init`
- `cognai sync`
- `cognai inspect`
- `cognai serve`

These commands currently establish the project structure and developer workflow. The graph, inference engine, and retrieval engine will be implemented next.

## Roadmap

Near-term implementation priorities:

1. Define the config format and local data directory layout.
2. Implement the graph storage abstraction and KuzuDB adapter.
3. Stand up the MCP tools: `cognai_query`, `cognai_update`, `cognai_explain`, and `cognai_flag`.
4. Implement transcript ingestion and inference passes.
5. Add retrieval, transparency output, and inspection tooling.

## License

MIT
