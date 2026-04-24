# MCP Setup

Cognai runs as a stdio MCP server.

Its job is to give an AI client a structured reasoning packet before the client goes to memory for raw evidence.

## Core Tools

### `cognai_query`

Input:

- user message or intent
- optional recent-turn summary

Output:

- `cognitive_context`
- `memory_lookup_plan`
- `response_guidance`
- `transparency`
- `warnings`

### `cognai_update`

Input:

- `user_message`
- `assistant_response`
- `memory_evidence`
- `memory_writes`
- `interaction_outcome`

Output:

- nodes written
- nodes reinforced
- tensions changed
- warnings

### `cognai_explain`

Returns a stable structured explanation for a node, its edges, and supporting provenance.

### `cognai_flag`

Marks nodes for operator review without destroying history.

## Generate Snippets

```bash
npm run dev -- mcp snippet
```

The command prints:

- an installed-package example
- a repo-local example
- a sibling OpenClaw + MemPalace example

## Typical Repo-Local Invocation

```json
{
  "command": "node",
  "args": [
    "dist/cli.js",
    "serve",
    "--config",
    "/absolute/path/to/config.json"
  ]
}
```

## Typical Installed-Package Invocation

```json
{
  "command": "cognai",
  "args": [
    "serve",
    "--config",
    "/absolute/path/to/config.json"
  ]
}
```

## Recommended Sibling Setup

The cleanest product architecture is two sibling systems:

```json
{
  "mcpServers": {
    "cognai": {
      "command": "cognai",
      "args": [
        "serve",
        "--config",
        "/absolute/path/to/cognai-config.json"
      ]
    },
    "mempalace": {
      "command": "mempalace",
      "args": [
        "mcp",
        "--palace",
        "/absolute/path/to/.mempalace"
      ]
    }
  }
}
```

Then the AI client can:

1. call `cognai_query`
2. call MemPalace search or recall tools
3. answer the user
4. write memory
5. call `cognai_update`

## Practical Guidance

If you are testing for the first time:

- start with a local transcript or `cognai demo`
- inspect the graph
- attach Cognai alone first
- add MemPalace after the graph looks sane

That makes it much easier to tell whether an issue comes from Cognai, the memory system, or the AI client.
