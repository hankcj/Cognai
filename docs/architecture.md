# Cognai Architecture

Cognai is built as a local reasoning layer, not as a memory system and not as a model host.

## Product Boundary

The intended runtime shape is:

- AI client
- Cognai MCP server
- memory system
- model provider

The AI client orchestrates the interaction.

Cognai contributes:

- semantic graph state
- reasoning-oriented retrieval
- memory lookup planning
- post-turn semantic updates

## Main Layers

- `cli`
  - init, demo, doctor, sync, inspect, serve, MCP snippets
- `mcp`
  - stdio server bootstrap
  - tool schemas and structured outputs
- `core/graph`
  - node and edge types
  - graph taxonomy
- `core/inference`
  - deterministic extraction
  - optional additive auxiliary reasoning
- `core/revision`
  - merge, reinforcement, contradiction, and tension handling
- `core/retrieval`
  - intent classification
  - anchor selection
  - graph traversal
  - memory lookup plan generation
- `storage`
  - SurrealDB default runtime
  - file fallback
  - memory test adapter
- `importers`
  - canonical envelope normalization
  - Mem0 and MemPalace import support
- `connectors`
  - optional live pull helpers
- `providers`
  - embeddings
  - auxiliary reasoning

## Query Flow

1. AI client calls `cognai_query`
2. retrieval selects anchors, tensions, and supporting nodes
3. Cognai returns:
   - `cognitive_context`
   - `memory_lookup_plan`
   - `response_guidance`
   - `transparency`
   - `warnings`
4. AI client uses that to query memory and formulate an answer

## Update Flow

1. AI client finishes an interaction
2. AI client writes episodic memory to its memory system
3. AI client calls `cognai_update`
4. Cognai stores episodes, extracts semantic proposals, and revises the graph

## Storage

Current persistence behavior:

- `surrealdb` is the default embedded runtime
- `file` is a fallback and debugging path
- `memory` is used for tests and ephemeral runs

## Provider Model

Provider handling is split on purpose:

- `embeddings`
  - OpenAI embedding model path
  - optional OpenAI-compatible base URL
- `aux_reasoning`
  - optional
  - `openai`
  - `anthropic`
  - `google`
  - `openai-compatible`

The user's main answer-generation provider remains outside Cognai.
