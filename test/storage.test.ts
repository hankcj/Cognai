import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createId } from "../src/shared/ids.js";
import { MemoryStorageAdapter } from "../src/storage/adapters/memory.js";
import { FileStorageAdapter } from "../src/storage/adapters/file.js";
import { SurrealStorageAdapter } from "../src/storage/adapters/surreal.js";

async function exerciseAdapter(
  adapter:
    | MemoryStorageAdapter
    | FileStorageAdapter
    | SurrealStorageAdapter
): Promise<void> {
  await adapter.init();

  const nodeId = createId();
  await adapter.writeNode({
    id: nodeId,
    type: "Value",
    label: "Creative autonomy",
    description: "User wants to build independently.",
    embedding: [0.1, 0.2, 0.3],
    source: "stated",
    confidence: 0.9,
    activation: 0.8,
    centrality: 0.7,
    construal_level: "high",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });

  await adapter.writeEpisode({
    id: createId(),
    conversation_id: "conv-1",
    timestamp: new Date().toISOString(),
    utterance: "I want creative autonomy.",
    speaker: "user",
    inferred_node_ids: [nodeId],
    metadata: {}
  });

  const summary = await adapter.getSummary();
  assert.equal(summary.nodeCount, 1);
  assert.equal(summary.episodeCount, 1);

  await adapter.close();
}

test("memory adapter persists in-process graph state", async () => {
  await exerciseAdapter(new MemoryStorageAdapter());
});

test("file adapter persists local graph state", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognai-file-store-"));
  await exerciseAdapter(new FileStorageAdapter(root));
});

test("surreal adapter persists local graph state", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognai-surreal-store-"));
  await exerciseAdapter(new SurrealStorageAdapter(root, "test", "test"));
});
