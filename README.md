# Cognai

Cognai is a local-first MCP server that helps AI systems understand what matters to you.

Instead of pretending to "be you," Cognai builds a cognitive graph of your values, goals, beliefs, identity claims, preferences, fears, assumptions, and tensions. It keeps provenance for what it inferred, stores everything locally, and returns lean decision-oriented context over MCP so your tools can respond in service of your actual priorities.

## What It Is

Cognai is for people who already use AI heavily and want something more durable than chat history.

It is designed to sit between:

- your conversations, notes, and memory systems
- your local AI tooling and MCP-enabled clients

Its job is to turn raw interaction history into a structured model such as:

- what you say you value
- what goals are downstream of those values
- what beliefs or assumptions your plans depend on
- what fears are inhibiting execution
- where your graph contains contradiction or productive tension

## Why Use It

Most AI systems are stateless, shallowly personalized, or overly dependent on brittle prompt context. Cognai gives them a more stable layer to work with.

With Cognai, the goal is not "remember everything."

The goal is:

- preserve the semantic structure of what matters
- make that structure inspectable and explainable
- keep it local and MCP-friendly
- complement episodic memory tools instead of replacing them

## Current Product Shape

Cognai is currently a **developer beta**.

Today it supports:

- local setup through a CLI onboarding flow
- embedded local persistence with SurrealDB by default
- deterministic transcript-to-graph inference
- provenance episodes and inspectable graph state
- decision-oriented retrieval over MCP
- optional connector setup for Mem0 and MemPalace
- optional embeddings and optional enrichment configuration

Right now it is strongest as:

- a local testing environment for cognitive modeling
- an MCP companion for AI workflows
- a semantic layer on top of existing memory systems

## Core Workflow

The current product loop is:

1. initialize a local Cognai workspace
2. ingest a transcript, export, or connector pull
3. inspect the resulting graph and tensions
4. attach Cognai as an MCP server
5. query it from an AI client

## Features

- **Local-first by default**: graph state, provenance, and sync checkpoints live on your machine.
- **MCP-native**: Cognai runs as a stdio MCP server and exposes purpose-built tools.
- **Cognitive graph model**: stores values, goals, beliefs, identity claims, fears, assumptions, and more.
- **Explainable inference**: links inferred nodes back to stored episodes through provenance edges.
- **Decision-oriented retrieval**: prioritizes telos anchors, tensions, and relevant graph structure instead of dumping raw memory.
- **Adapter-based ingestion**: works with canonical Cognai JSON and can normalize external memory shapes.
- **Connector support**: includes read-only connector paths for Mem0 and MemPalace.

## Who It Is For

Cognai is currently best suited for:

- builders who want AI systems to reason from their priorities
- people already using memory tools and wanting a semantic layer above them
- MCP users who want a local, inspectable context engine
- researchers or developers exploring personal cognitive architecture modeling

## Installation

### Prerequisites

- Node.js 20+
- npm 10+

### Install Dependencies

```bash
npm install
```

### Run The CLI

```bash
npm run dev -- --help
```

## Quick Start

### 1. Initialize A Workspace

```bash
npm run dev -- init
```

The interactive onboarding now walks through:

- mode: user or org
- storage adapter, with embedded SurrealDB as the default
- embedding provider setup
- optional enrichment provider setup
- optional live connector setup for Mem0 and/or MemPalace
- optional self-description seeding

### 2. Validate The Workspace

```bash
npm run dev -- doctor
```

This checks:

- config resolution
- storage readiness
- embedding and enrichment configuration status
- connector configuration status
- sync checkpoint state

### 3. Ingest Data

From a local transcript or export:

```bash
npm run dev -- sync --transcript /absolute/path/to/input.json
```

From a live connector:

```bash
npm run dev -- sync --connector mem0
npm run dev -- sync --connector mempalace
```

### 4. Inspect What Cognai Learned

```bash
npm run dev -- inspect
npm run dev -- inspect --tensions
npm run dev -- inspect --episodes
npm run dev -- inspect --sync-state
```

### 5. Attach It To An MCP Client

Generate a ready-to-paste snippet:

```bash
npm run dev -- mcp snippet
```

Start the server:

```bash
npm run dev -- serve
```

## CLI Commands

Current commands:

- `cognai init`
- `cognai doctor`
- `cognai sync`
- `cognai inspect`
- `cognai config show`
- `cognai mcp snippet`
- `cognai serve`

Use `npm run dev -- <command> --help` for the full option surface.

## Integrations

Cognai is meant to work with existing memory systems, not replace them.

Current integration modes:

- canonical Cognai JSON import
- normalized Mem0-shaped import
- normalized MemPalace-shaped import
- live read-only connector pulls for Mem0 and MemPalace

The product boundary is intentional:

- external systems remain the source of episodic recall
- Cognai focuses on semantic modeling and retrieval

See [docs/integrations.md](/Users/hankcj/Cognai/docs/integrations.md) and [docs/import-schema.md](/Users/hankcj/Cognai/docs/import-schema.md).

## MCP Tools

The current MCP server exposes:

- `cognai_query`
- `cognai_update`
- `cognai_explain`
- `cognai_flag`

These tools already run against the local runtime, storage, retrieval, and provenance layers.

## Storage

Default storage is **SurrealDB embedded**.

Other adapters still exist for development purposes:

- `surrealdb`: primary local runtime
- `file`: fallback and debugging
- `memory`: tests and ephemeral runs

## Status

This is a real local beta, not a finished product.

What is already strong:

- local graph persistence
- onboarding and operator workflow
- deterministic inference
- explainability and inspection
- MCP attachment

What is still early:

- real-world connector hardening
- retrieval quality under noisy data
- packaging polish
- broader import coverage

## Development

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Docs

- [docs/onboarding.md](/Users/hankcj/Cognai/docs/onboarding.md)
- [docs/mcp-setup.md](/Users/hankcj/Cognai/docs/mcp-setup.md)
- [docs/config.md](/Users/hankcj/Cognai/docs/config.md)
- [docs/architecture.md](/Users/hankcj/Cognai/docs/architecture.md)
- [cognai-prd.md](/Users/hankcj/Cognai/cognai-prd.md)

## License

MIT
