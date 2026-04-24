# Onboarding Walkthrough

This is the current onboarding flow for the local beta.

## 1. Initialize Cognai

Run:

```bash
npm run dev -- init
```

You can also do a non-interactive setup:

```bash
npm run dev -- init --yes --connector both --enrichment-provider openai
```

The guided flow currently asks for:

- user vs org mode
- storage adapter
- embedding provider
- optional enrichment provider
- whether to prepare Mem0, MemPalace, or both connectors
- optional self-description seeding

By default, the recommended path is:

- `surrealdb` storage
- no embeddings yet unless you already have a provider configured
- no enrichment yet unless you want to test it
- connectors enabled only if you already know where data will come from

## 2. Run A Workspace Check

Run:

```bash
npm run dev -- doctor
```

This validates:

- config presence
- storage startup
- embedding configuration status
- enrichment configuration status
- connector readiness
- sync checkpoint state

## 3. Ingest Data

### Option A: Local Transcript Or Export

```bash
npm run dev -- sync --transcript /absolute/path/to/input.json
```

Supported import paths include:

- canonical Cognai JSON
- Mem0-shaped exports
- MemPalace-shaped exports

### Option B: Live Connector Pull

```bash
npm run dev -- sync --connector mem0
npm run dev -- sync --connector mempalace
```

If you want scheduled polling enabled while the MCP server is running:

```bash
npm run dev -- sync --connector mem0 --enable-schedule
npm run dev -- sync --connector mempalace --enable-schedule
```

## 4. Inspect The Graph

After a sync, inspect what Cognai stored:

```bash
npm run dev -- inspect
```

Useful follow-ups:

```bash
npm run dev -- inspect --tensions
npm run dev -- inspect --episodes
npm run dev -- inspect --sync-state
```

If you want to inspect one specific node:

```bash
npm run dev -- inspect --node <node-id>
```

## 5. Attach Cognai To MCP

Generate a client snippet:

```bash
npm run dev -- mcp snippet
```

Start the MCP server:

```bash
npm run dev -- serve
```

If connector `autoSync` is enabled, `serve` will also poll configured connectors on their schedule.

## Suggested First Test

For the cleanest first experience:

1. run `init`
2. run `doctor`
3. sync a small hand-written transcript first
4. inspect the graph
5. only then try Mem0 or MemPalace connector pulls
6. after the graph looks sane, attach Cognai to your MCP client

That helps separate:

- core graph quality
- connector quality
- MCP usefulness

## What “Good” Looks Like

After onboarding, you should be able to:

- initialize a workspace without manual file editing
- ingest at least one transcript or connector pull
- see values, goals, beliefs, fears, assumptions, and tensions in `inspect`
- view provenance episodes
- generate MCP config
- run the server locally

## Current Caveats

- Connector support is real, but still early compared with the local transcript path.
- Retrieval quality is improving, but you should still inspect the graph rather than blindly trust it.
- Optional embeddings and enrichment are not required for a useful first run.
