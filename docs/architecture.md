# Cognai Scaffold Architecture

This scaffold is organized around the product layers in the PRD:

- `cli`: onboarding, inspection, doctoring, and MCP snippet generation
- `mcp`: stdio MCP server bootstrap and tool registration
- `core`: graph, episode, inference, retrieval, and revision contracts
- `storage`: adapter-based persistence
- `importers`: canonical import envelope plus source adapters
- `providers`: embedding provider interfaces and scaffold implementations

Current persistence behavior:

- `surrealdb` is the real embedded product runtime
- `file` adapter is kept for fallback, debugging, and local inspection
- `memory` adapter is used for tests and ephemeral runs

This repo is intentionally architecture-complete before it is behavior-complete.
