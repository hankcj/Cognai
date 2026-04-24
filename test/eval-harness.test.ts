import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { InferenceEngine } from "../src/core/inference/engine.js";
import { RetrievalEngine } from "../src/core/retrieval/engine.js";
import { RevisionEngine } from "../src/core/revision/engine.js";
import { NoopEmbeddingProvider } from "../src/providers/embeddings/openai.js";
import { NoopEnrichmentProvider } from "../src/providers/enrichment/openai.js";
import { MemoryStorageAdapter } from "../src/storage/adapters/memory.js";
import type { CanonicalConversationEnvelope } from "../src/importers/canonical.js";

interface FixtureCase {
  envelope: CanonicalConversationEnvelope;
  expectations: {
    required_types: string[];
    min_tensions: number;
    query: string;
    min_memory_questions: number;
  };
}

async function loadFixture(name: string): Promise<FixtureCase> {
  const file = resolve(process.cwd(), "test", "fixtures", `${name}.json`);
  return JSON.parse(await readFile(file, "utf8")) as FixtureCase;
}

for (const fixtureName of ["decision-clean", "messy-contradiction"]) {
  test(`eval fixture ${fixtureName} meets baseline expectations`, async () => {
    const fixture = await loadFixture(fixtureName);
    const inference = new InferenceEngine(
      new NoopEmbeddingProvider(),
      new NoopEnrichmentProvider()
    );
    const revision = new RevisionEngine();
    const storage = new MemoryStorageAdapter();
    await storage.init();

    const inferenceResult = await inference.analyzeConversation(fixture.envelope);
    const summary = await revision.apply(storage, inferenceResult);
    const retrieval = new RetrievalEngine(
      storage,
      new NoopEmbeddingProvider(),
      8,
      0.6,
      3,
      2,
      10,
      12,
      700
    );
    const queryResult = await retrieval.query(fixture.expectations.query);
    const presentTypes = new Set(
      inferenceResult.proposals.map((proposal) => proposal.node.type)
    );

    for (const requiredType of fixture.expectations.required_types) {
      assert.ok(presentTypes.has(requiredType as never));
    }

    assert.ok(summary.tensionsChanged >= fixture.expectations.min_tensions);
    assert.ok(
      queryResult.memory_lookup_plan.questions.length >=
        fixture.expectations.min_memory_questions
    );
    assert.ok(queryResult.cognitive_context.subgraph.estimated_tokens <= 900);
  });
}
