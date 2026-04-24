# Config Reference

Cognai writes a JSON config to `.cognai/config.json` by default.

The config is meant to describe a local reasoning workspace, not a cloud deployment.

## Important Sections

### `mode`

- `user`
- `org`

### `storage`

Controls local persistence.

Important values:

- `adapter`
  - `surrealdb`
  - `file`
  - `memory`
- `surrealkvPath`

`surrealdb` is the default product path.

### `embeddings`

Optional embedding configuration for retrieval.

Current product rule:

- embedding provider is OpenAI-based
- you can optionally route through an OpenAI-compatible `baseUrl`

Key fields:

- `provider`
- `model`
- `apiKeyEnvVar`
- `baseUrl`
- `timeoutMs`

### `aux_reasoning`

Optional additive model support for enrichment or evaluation.

This is not the user's primary answer model.

Supported providers:

- `none`
- `openai`
- `anthropic`
- `google`
- `openai-compatible`

Key fields:

- `enabled`
- `provider`
- `model`
- `apiKeyEnvVar`
- `baseUrl`
- `timeoutMs`

### `retrieval`

Controls query behavior and output budgets.

Important fields:

- `topK`
- `telosAnchorLimit`
- `edgeTraversalHops`
- `confidenceFloor`
- `maxReturnedNodes`
- `maxReturnedEdges`
- `maxContextTokens`

### `connectors`

Connector settings are optional convenience paths, not the core architecture.

#### `connectors.mem0`

Contains:

- `enabled`
- `baseUrl`
- `apiKeyEnvVar`
- `pollIntervalMinutes`
- `autoSync`

#### `connectors.obsidian`

Contains:

- `enabled`
- `vaultPath`
- `includeDirs`
- `excludeDirs`
- `maxFilesPerSync`
- `pollIntervalMinutes`
- `autoSync`

Obsidian sync reads local `.md` files directly. `includeDirs` can narrow sync to selected folders, while `excludeDirs` defaults away from implementation folders such as `.obsidian`, `.trash`, `.git`, and `node_modules`.

#### `connectors.mempalace`

Contains:

- `enabled`
- `command`
- `args`
- `workingDirectory`
- `palacePath`
- `integrationMode`
- `bootstrapMode`
- `backfillScope`
- `includeWings`
- `excludeWings`
- `includeRooms`
- `excludeRooms`
- `pageSize`
- `maxInventoryDrawersPerRun`
- `maxSemanticDrawersPerRun`
- `bootstrap.searchLimit`
- `bootstrap.wakeUpTokenBudget`
- `pollIntervalMinutes`
- `autoSync`

`bootstrapMode` values:

- `none`
- `wake_up`
- `search_seed`

`backfillScope` values:

- `audit_only`
- `selected`
- `full`

### `paths`

Resolved local paths for:

- root workspace
- data
- imports
- config
- state

## Example Shape

```json
{
  "storage": {
    "adapter": "surrealdb",
    "surrealkvPath": "/absolute/path/to/data/surreal"
  },
  "embeddings": {
    "provider": "none",
    "model": "text-embedding-3-small",
    "apiKeyEnvVar": "OPENAI_API_KEY",
    "baseUrl": "https://api.openai.com/v1",
    "timeoutMs": 15000
  },
  "aux_reasoning": {
    "enabled": false,
    "provider": "none",
    "model": "gpt-4.1-mini",
    "apiKeyEnvVar": "OPENAI_API_KEY",
    "baseUrl": "https://api.openai.com/v1",
    "timeoutMs": 20000
  },
  "retrieval": {
    "topK": 8,
    "telosAnchorLimit": 3,
    "edgeTraversalHops": 2,
    "confidenceFloor": 0.6,
    "maxReturnedNodes": 10,
    "maxReturnedEdges": 12,
    "maxContextTokens": 700
  }
}
```

## Migration Note

Older configs that used `enrichment` are automatically normalized into `aux_reasoning` when loaded.

Older MemPalace configs that used `syncMode`, `searchLimit`, and `wakeUpTokenBudget` are automatically normalized into the newer audit / inventory / semantic backfill model when loaded.
