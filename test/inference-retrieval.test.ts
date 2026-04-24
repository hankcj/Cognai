import test from "node:test";
import assert from "node:assert/strict";

import { InferenceEngine } from "../src/core/inference/engine.js";
import { RevisionEngine } from "../src/core/revision/engine.js";
import { RetrievalEngine } from "../src/core/retrieval/engine.js";
import { NoopEmbeddingProvider } from "../src/providers/embeddings/openai.js";
import { NoopEnrichmentProvider } from "../src/providers/enrichment/openai.js";
import { MemoryStorageAdapter } from "../src/storage/adapters/memory.js";

test("deterministic inference extracts value and goal structures", async () => {
  const engine = new InferenceEngine(
    new NoopEmbeddingProvider(),
    new NoopEnrichmentProvider()
  );
  const result = await engine.analyzeConversation({
    source: "cognai-json",
    conversation: {
      id: "conv-1",
      metadata: {}
    },
    messages: [
      {
        id: "1",
        role: "user",
        content:
          "I care about creative autonomy. I want to build an independent product.",
        timestamp: "2026-04-24T12:00:00.000Z",
        metadata: {}
      }
    ],
    memory_entries: [],
    participants: [],
    metadata: {}
  });

  assert.equal(result.episodes.length, 1);
  assert.ok(result.proposals.some((proposal) => proposal.node.type === "Value"));
  assert.ok(result.proposals.some((proposal) => proposal.node.type === "Goal"));
  assert.ok(
    result.proposals.some((proposal) =>
      proposal.edges.some((edge) => edge.type === "IN_SERVICE_OF")
    )
  );
  assert.equal(result.enrichmentApplied, false);
});

test("deterministic inference extracts fear and assumption structures", async () => {
  const engine = new InferenceEngine(
    new NoopEmbeddingProvider(),
    new NoopEnrichmentProvider()
  );
  const result = await engine.analyzeConversation({
    source: "cognai-json",
    conversation: {
      id: "conv-fear",
      metadata: {}
    },
    messages: [
      {
        id: "1",
        role: "user",
        content:
          "I care about independence. I want to build my own company, but I am worried that burnout will derail me. I assume the market will still reward craft.",
        timestamp: "2026-04-24T12:00:00.000Z",
        metadata: {}
      }
    ],
    memory_entries: [],
    participants: [],
    metadata: {}
  });

  assert.ok(result.proposals.some((proposal) => proposal.node.type === "Fear"));
  assert.ok(result.proposals.some((proposal) => proposal.node.type === "Assumption"));
  assert.ok(
    result.proposals.some((proposal) =>
      proposal.edges.some(
        (edge) => edge.type === "INHIBITS" || edge.type === "PROTECTS"
      )
    )
  );
});

test("retrieval surfaces anchors and traversed tensions", async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();

  await storage.writeNode({
    id: "value-1",
    type: "Value",
    label: "Creative autonomy",
    description: "creative autonomy and independence",
    embedding: [0.1, 0.2, 0.3],
    source: "stated",
    confidence: 0.95,
    activation: 0.8,
    centrality: 0.9,
    construal_level: "high",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeNode({
    id: "goal-1",
    type: "Goal",
    label: "Build an independent product",
    description: "build an independent product",
    embedding: [0.1, 0.2, 0.31],
    source: "stated",
    confidence: 0.8,
    activation: 0.7,
    centrality: 0.5,
    construal_level: "mid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeNode({
    id: "goal-2",
    type: "Goal",
    label: "Scale rapidly",
    description: "scale rapidly at all costs",
    embedding: [0.9, 0.8, 0.7],
    source: "inferred",
    confidence: 0.55,
    activation: 0.4,
    centrality: 0.3,
    construal_level: "mid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeNode({
    id: "fear-1",
    type: "Fear",
    label: "Burnout derails momentum",
    description: "burnout derails momentum",
    embedding: [0.11, 0.2, 0.3],
    source: "inferred",
    confidence: 0.7,
    activation: 0.6,
    centrality: 0.4,
    construal_level: "mid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeEdge({
    id: "edge-1",
    from_node_id: "goal-1",
    to_node_id: "value-1",
    type: "IN_SERVICE_OF",
    confidence: 0.7,
    source: "inferred",
    created_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeEdge({
    id: "edge-2",
    from_node_id: "goal-1",
    to_node_id: "goal-2",
    type: "CONTRADICTS",
    confidence: 0.45,
    source: "inferred",
    created_at: new Date().toISOString(),
    metadata: {}
  });

  await storage.writeEdge({
    id: "edge-3",
    from_node_id: "fear-1",
    to_node_id: "goal-1",
    type: "INHIBITS",
    confidence: 0.5,
    source: "inferred",
    created_at: new Date().toISOString(),
    metadata: {}
  });

  const retrieval = new RetrievalEngine(
    storage,
    new NoopEmbeddingProvider(),
    8,
    0.6,
    3,
    2
  );
  const result = await retrieval.query("How should I decide what to build?");

  assert.ok(result.subgraph.telos_anchors.length >= 1);
  assert.ok(
    result.subgraph.active_tensions.some(
      (edge) => edge.type === "CONTRADICTS" || edge.type === "INHIBITS"
    )
  );
  assert.equal(result.transparency.classification, "decision");
  assert.ok(result.transparency.selected_nodes.length >= 1);
});

test("revision reinforces existing nodes and counts contradiction candidates", async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();

  await storage.writeNode({
    id: "belief-1",
    type: "Belief",
    label: "Remote work is healthy",
    description: "remote work is healthy",
    embedding: [0.2, 0.2, 0.2],
    source: "stated",
    confidence: 0.7,
    activation: 0.5,
    centrality: 0.4,
    construal_level: "mid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {
      polarity: "positive"
    }
  });

  const revision = new RevisionEngine();
  const summary = await revision.apply(storage, {
    envelope: {
      source: "cognai-json",
      conversation: { id: "conv-2", metadata: {} },
      messages: [],
      memory_entries: [],
      participants: [],
      metadata: {}
    },
    episodes: [],
    enrichmentApplied: false,
    annotations: [],
    proposals: [
      {
        reason: "test",
        node: {
          id: "belief-2",
          type: "Belief",
          label: "Remote work is healthy",
          description: "remote work is healthy",
          embedding: [0.2, 0.2, 0.2],
          source: "inferred",
          confidence: 0.6,
          activation: 0.5,
          centrality: 0.4,
          construal_level: "mid",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_reinforced_at: new Date().toISOString(),
          metadata: { polarity: "negative" }
        },
        edges: [],
        origin: "deterministic",
        contradictionTargets: []
      }
    ]
  });

  assert.equal(summary.nodesReinforced, 1);
  assert.ok(summary.contradictionCandidates >= 1);
  assert.equal(summary.enrichmentApplied, false);
});
