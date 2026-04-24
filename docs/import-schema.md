# Canonical Import Schema

`cognai sync` normalizes all supported inputs into a canonical envelope:

```json
{
  "source": "cognai-json",
  "conversation": {
    "id": "conv_123",
    "title": "Optional",
    "metadata": {}
  },
  "messages": [
    {
      "id": "1",
      "role": "user",
      "content": "I care deeply about independence.",
      "timestamp": "2026-04-24T00:00:00.000Z",
      "metadata": {}
    }
  ],
  "memory_entries": [],
  "participants": [],
  "metadata": {}
}
```

Supported source adapters in the scaffold:

- `cognai-json`
- `mem0`
- `mempalace`

Each adapter maps external exports into this envelope before inference runs.
