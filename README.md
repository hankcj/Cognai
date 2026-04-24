# Cognai

Cognai is a provider-agnostic reasoning layer that sits between an AI client and the user's memory system.

It is not trying to replace memory, and it is not trying to be the answer model. Its job is to keep a compact local model of what matters to a person, what they are trying to do, what they believe, what they fear, what assumptions they are relying on, and where their internal tensions live, then hand that reasoning packet back to the AI at the right moment.

## The Product In One Sentence

Bring your own memory system, bring your own model provider, and use Cognai as the local "brain layer" in the middle.

## What Cognai Does

When an AI client needs context, the intended flow is:

1. The user talks to the AI client.
2. The AI client calls `cognai_query`.
3. Cognai returns:
   - `cognitive_context`
   - `memory_lookup_plan`
   - `response_guidance`
4. The AI client calls the user's memory system with that lookup plan.
5. The AI client answers using whatever model provider the user chose.
6. The AI client writes new episodic memory to the memory system.
7. The AI client calls `cognai_update` so Cognai can revise its semantic graph.

That means:

- the memory system stays responsible for facts and recall
- the model provider stays responsible for generation
- Cognai stays responsible for reasoning, interpretation, and long-lived semantic structure

## What Cognai Is Not

Cognai is not:

- a general memory database
- a replacement for MemPalace, Mem0, or similar tools
- a hosted AI provider
- a frontend application

## Why Someone Would Use It

Most AI systems either forget too much, remember in a shallow way, or drag huge amounts of raw context into every answer.

Cognai aims to give them something smaller and smarter:

- a local graph of values, goals, beliefs, commitments, identity claims, fears, assumptions, and tensions
- provenance back to the conversations that revealed those structures
- a decision-oriented packet the AI can use before it asks memory for raw evidence

In plain terms: memory tells the AI what happened, and Cognai helps the AI understand why it matters.

## Current Beta Capabilities

Today Cognai can:

- initialize a local workspace
- store graph state locally with embedded SurrealDB by default
- ingest transcripts and normalized memory exports
- infer values, goals, beliefs, preferences, commitments, identity claims, fears, and assumptions
- preserve provenance episodes
- expose a structured MCP server with `cognai_query`, `cognai_update`, `cognai_explain`, and `cognai_flag`
- generate memory lookup plans for the AI client
- support MemPalace as the first hardened reference memory-system integration
- audit, inventory, and semantically backfill MemPalace drawers without scraping backend storage
- ingest Obsidian vault notes directly from local Markdown files
- use optional auxiliary reasoning with `openai`, `anthropic`, `google`, or `openai-compatible` providers

Embeddings are optional. When enabled, Cognai uses OpenAI embedding models, optionally through an OpenAI-compatible base URL.

## Current Product Status

This is a real developer beta.

The core loop works:

- local setup
- local storage
- transcript ingestion
- graph inspection
- MCP attachment
- structured reasoning output

What is still early:

- very large MemPalace performance tuning beyond the current resumable audit/inventory/backfill model
- very large Obsidian vault tuning beyond bounded Markdown-file sync
- retrieval tuning under messy data
- packaging polish across many environments
- broader memory-system coverage beyond the current reference integrations

## Installation

### Prerequisites

- Node.js 20+
- npm 10+

### Local Repo Setup

```bash
npm install
npm run build
```

### CLI Help

```bash
npm run dev -- --help
```

## Fastest First Test

The quickest way to test the full local loop is:

```bash
npm run dev -- demo
```

That creates a demo workspace, ingests a built-in transcript, and leaves you with a working local graph you can inspect immediately.

Then run:

```bash
npm run dev -- inspect --config /absolute/path/to/config.json
npm run dev -- mcp snippet --config /absolute/path/to/config.json
npm run dev -- serve --config /absolute/path/to/config.json
```

## Standard Workflow

### 1. Initialize

```bash
npm run dev -- init
```

Recommended default path:

- `surrealdb` storage
- no embeddings unless you already want to test them
- no auxiliary reasoning unless you explicitly want additive model help
- MemPalace enabled only if you already use it
- Obsidian enabled only if you already have a vault you want to backfill

### 2. Check Readiness

```bash
npm run dev -- doctor
```

### 3. Ingest Data

Transcript or export:

```bash
npm run dev -- sync --transcript /absolute/path/to/input.json
```

Connector-assisted sync:

```bash
npm run dev -- sync --connector mem0
npm run dev -- sync --connector mempalace
npm run dev -- sync --connector obsidian
npm run dev -- mempalace audit
npm run dev -- mempalace inventory
npm run dev -- mempalace coverage
```

### 4. Inspect The Graph

```bash
npm run dev -- inspect
npm run dev -- inspect --tensions
npm run dev -- inspect --episodes
npm run dev -- inspect --sync-state
```

### 5. Attach To An MCP Client

```bash
npm run dev -- mcp snippet
npm run dev -- serve
```

## MCP Tools

### `cognai_query`

Returns a reasoning packet for the AI client:

- `cognitive_context`
- `memory_lookup_plan`
- `response_guidance`
- `transparency`
- `warnings`

### `cognai_update`

Models a completed interaction:

- user message
- assistant response summary
- memory evidence used
- memory writes performed
- optional interaction outcome

### `cognai_explain`

Explains why a node exists, what it connects to, and which episodes support it.

### `cognai_flag`

Lets operators mark nodes without deleting graph history.

## Memory Systems And Providers

Cognai is intentionally bring-your-own-infrastructure.

### Memory Systems

The recommended architecture is sibling systems:

- your AI client talks to Cognai over MCP
- your AI client talks to the memory system over MCP or its native tools
- the AI client orchestrates both

MemPalace is the first reference integration because it matches the product direction closely. Cognai can also ingest canonical Cognai JSON, Mem0-shaped data, MemPalace-shaped data, and Obsidian vault Markdown files.

### Model Providers

The user's primary answer-generation model is outside Cognai.

Inside Cognai there are only two optional model-facing surfaces:

- `embeddings`
  - OpenAI embedding models only
  - optional OpenAI-compatible base URL
- `aux_reasoning`
  - optional
  - supports `openai`, `anthropic`, `google`, and `openai-compatible`
  - additive only, never required for the core deterministic path

## MemPalace And OpenClaw

The intended real-world setup is:

- MemPalace for episodic recall
- Cognai for reasoning and semantic structure
- OpenClaw or another MCP-aware AI client as the orchestrator

See:

- [docs/onboarding.md](/Users/hankcj/Cognai/docs/onboarding.md)
- [docs/mcp-setup.md](/Users/hankcj/Cognai/docs/mcp-setup.md)
- [docs/integrations.md](/Users/hankcj/Cognai/docs/integrations.md)
- [docs/config.md](/Users/hankcj/Cognai/docs/config.md)
- [docs/architecture.md](/Users/hankcj/Cognai/docs/architecture.md)

## Development

```bash
npm run typecheck
npm run test
npm run build
npm run smoke:pack
```

Provider-gated smoke tests:

```bash
npm run smoke:providers
```

Full local verification:

```bash
npm run verify
```

## License

MIT
