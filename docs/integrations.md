# Integrations

Cognai is designed to sit between an AI client and the user's memory system.

That product boundary matters:

- the memory system stores and recalls facts
- the model provider generates the answer
- Cognai provides semantic reasoning, tensions, priorities, and lookup guidance

## Recommended Architecture

The canonical shape is MCP-first and sibling-oriented:

1. the AI client calls `cognai_query`
2. Cognai returns a reasoning packet plus a memory lookup plan
3. the AI client calls the memory system
4. the AI client answers using the user's chosen model provider
5. the AI client updates memory
6. the AI client calls `cognai_update`

This means Cognai should not become the user's memory system, and it should not become the answer-generation model.

## Memory-System Agnostic By Design

Cognai is meant to work with:

- memory MCP servers
- local memory CLIs
- normalized exports
- canonical Cognai JSON envelopes

The internal truth is always the canonical Cognai envelope and graph model.

## MemPalace

MemPalace is the first hardened reference integration.

There are two ways to use it:

### MCP Sibling Mode

This is the recommended product shape.

- the AI client talks to Cognai over MCP
- the AI client talks to MemPalace over MCP
- Cognai suggests what to look up
- MemPalace supplies the episodic evidence

This keeps responsibilities clean.

### Native CLI Assist Mode

This is optional and mostly useful for bootstrap or offline alignment.

In this mode, Cognai can:

- run a taxonomy audit through MemPalace's public MCP contract
- inventory drawers by wing and room without scraping backend storage
- semantically backfill selected drawers into the local Cognai graph
- track coverage separately for audit, inventory, and semantic processing
- preserve drawer-level provenance back to wing, room, drawer ID, and source file

Cognai does not scrape MemPalace internals.

The main rule is:

- MemPalace drawers are the authoritative ingest unit
- `search` and `wake-up` are helper layers, not coverage proof
- live MemPalace search is still recommended at answer time when coverage is partial

## Mem0

Mem0 remains supported as an import and connector path, but MemPalace is currently the deeper reference integration.

## Obsidian

Obsidian is supported as a local vault connector.

In this mode, Cognai:

- scans local Markdown files
- ignores common vault implementation folders such as `.obsidian`
- treats each note as one evidence unit
- preserves vault path, note path, title, frontmatter, modified time, and content hash
- dedupes repeated syncs by note version

This is intentionally simpler than MemPalace. Obsidian provides durable human-authored notes; Cognai interprets those notes into semantic context. For large vaults, use `includeDirs`, `excludeDirs`, and `maxFilesPerSync` to keep the first backfill focused.

## OpenClaw

OpenClaw fits the intended orchestration model well:

- OpenClaw calls Cognai for semantic reasoning
- OpenClaw calls MemPalace for episodic recall
- OpenClaw uses the user's chosen model provider to answer

That is the product story in plain terms:

- MemPalace remembers
- Cognai interprets
- the AI client answers

## Provider Model

The primary answer model stays outside Cognai.

Inside Cognai there are only optional provider surfaces:

- `embeddings`
  - OpenAI embedding model path
  - optional OpenAI-compatible base URL
- `aux_reasoning`
  - optional
  - `openai`
  - `anthropic`
  - `google`
  - `openai-compatible`

No hosted provider is required for the core deterministic path.
