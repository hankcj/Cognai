# Config Reference

The scaffold writes a JSON config to `.cognai/config.json` by default.

Key sections:

- `mode`: `user` or `org`
- `storage`: adapter choice plus local paths
- `embeddings`: scaffold provider selection and API-key env var name
- `retrieval`: top-K and confidence thresholds
- `inference`: passive and active write toggles
- `decay`: confidence decay schedule and floor
- `imports`: canonical import defaults
- `mcp`: transport configuration
- `paths`: resolved local workspace paths

The default runtime now uses the `surrealdb` storage adapter. The `file` adapter remains available as a fallback/dev tool, and `memory` remains available for tests.
