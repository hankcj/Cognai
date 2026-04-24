# Onboarding Walkthrough

This is the current beta onboarding path for Cognai as a reasoning layer between an AI client and a memory system.

## Recommended First Run

The safest first test is:

1. create a local demo workspace
2. inspect what Cognai inferred
3. attach Cognai to your MCP client
4. only then add MemPalace, Obsidian, or another memory-system integration

That keeps the first test about Cognai itself instead of mixing several systems at once.

## Option 1: One-Command Demo

```bash
npm run dev -- demo
```

This creates a demo workspace, writes a sample transcript, syncs it into the graph, and tells you where the config lives.

After that:

```bash
npm run dev -- inspect --config /absolute/path/to/config.json
npm run dev -- mcp snippet --config /absolute/path/to/config.json
npm run dev -- serve --config /absolute/path/to/config.json
```

## Option 2: Full Manual Setup

### 1. Initialize A Workspace

```bash
npm run dev -- init
```

Non-interactive setup:

```bash
npm run dev -- init --yes --storage surrealdb --embedding-provider none --aux-provider none --connector none
```

The guided flow currently asks for:

- user vs org mode
- storage adapter
- embedding provider
- auxiliary reasoning provider
- whether to enable Mem0, MemPalace, Obsidian, or all connectors
- MemPalace palace path and backfill scope when enabled
- Obsidian vault path when enabled
- optional self-description seeding

Recommended defaults for a first run:

- `surrealdb`
- no embeddings
- no auxiliary reasoning
- no connectors unless you already use them

### 2. Run A Workspace Check

```bash
npm run dev -- doctor
```

This checks:

- config resolution
- storage startup
- embeddings readiness
- auxiliary reasoning readiness
- connector readiness
- MemPalace command health when configured
- Obsidian vault health when configured
- sync checkpoint state

### 3. Ingest Data

Transcript or export:

```bash
npm run dev -- sync --transcript /absolute/path/to/input.json
```

Connector-assisted pull:

```bash
npm run dev -- sync --connector mem0
npm run dev -- sync --connector mempalace
npm run dev -- sync --connector obsidian
```

If you want scheduled polling while the MCP server is running:

```bash
npm run dev -- sync --connector mempalace --enable-schedule
npm run dev -- sync --connector obsidian --enable-schedule
```

### 4. Inspect What Cognai Learned

```bash
npm run dev -- inspect
```

Useful follow-ups:

```bash
npm run dev -- inspect --tensions
npm run dev -- inspect --episodes
npm run dev -- inspect --sync-state
npm run dev -- inspect --node <node-id>
```

### 5. Attach Cognai To Your MCP Client

Generate snippets:

```bash
npm run dev -- mcp snippet
```

Start the server:

```bash
npm run dev -- serve
```

If connector `autoSync` is enabled, `serve` will also poll configured connectors on their schedule.

## What Good Looks Like

After a successful onboarding run, you should be able to:

- initialize a workspace without editing JSON by hand
- ingest a transcript or connector pull
- inspect values, goals, beliefs, fears, assumptions, and tensions
- see stored provenance episodes
- generate MCP snippets
- start the MCP server locally

## When To Add MemPalace

Add MemPalace after the local transcript path feels sane.

That order matters because it separates:

- Cognai graph quality
- MemPalace integration quality
- AI-client orchestration quality

If you already use OpenClaw, the healthy product shape is:

- Cognai for reasoning
- MemPalace for recall
- OpenClaw for orchestration and answer generation

## When To Add Obsidian

Add Obsidian when you want Cognai to learn from a local vault of Markdown notes.

The current Obsidian path treats each Markdown file as one evidence unit. It preserves the vault path, note path, title, frontmatter, file modified time, and content hash so repeated syncs can dedupe note versions.

## Current Caveats

- Cognai is still a beta, not a finished product.
- The transcript path is the most mature path.
- MemPalace support is real, but still being hardened around live usage.
- Obsidian support is local-file based and simpler, but very large vaults still need careful include/exclude scoping.
- Auxiliary reasoning is optional and additive only.
- You should still inspect the graph instead of treating it as perfect truth.
