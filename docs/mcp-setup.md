# MCP Setup

The scaffold exposes Cognai as a stdio MCP server.

Typical local invocation after build:

```json
{
  "command": "node",
  "args": ["dist/cli.js", "serve", "--config", "/absolute/path/to/.cognai/config.json"]
}
```

Generate snippets with:

```bash
cognai mcp snippet
```

Current registered tools:

- `cognai_query`
- `cognai_update`
- `cognai_explain`
- `cognai_flag`

The handlers are scaffolded end-to-end and already call real runtime services, but retrieval and write semantics are still early-stage.
