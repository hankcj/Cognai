import type { CognaiConfig } from "../config/schema.js";
import { createEmbeddingProvider } from "../providers/embeddings/openai.js";
import { createEnrichmentProvider } from "../providers/enrichment/openai.js";
import { createStorageAdapter } from "../storage/factory.js";
import { InferenceEngine } from "../core/inference/engine.js";
import { RevisionEngine } from "../core/revision/engine.js";
import { RetrievalEngine } from "../core/retrieval/engine.js";
import { CognaiJsonImportAdapter } from "../importers/adapters/cognai-json.js";
import { Mem0ImportAdapter } from "../importers/adapters/mem0.js";
import { MemPalaceImportAdapter } from "../importers/adapters/mempalace.js";
import { createConnectors } from "../connectors/factory.js";

export function createRuntime(config: CognaiConfig) {
  const storage = createStorageAdapter(config);
  const embeddingProvider = createEmbeddingProvider(config.embeddings);
  const enrichmentProvider = createEnrichmentProvider(config.enrichment);
  const inferenceEngine = new InferenceEngine(embeddingProvider, enrichmentProvider);
  const revisionEngine = new RevisionEngine();
  const retrievalEngine = new RetrievalEngine(
    storage,
    embeddingProvider,
    config.retrieval.topK,
    config.retrieval.confidenceFloor,
    config.retrieval.telosAnchorLimit,
    config.retrieval.edgeTraversalHops
  );
  const importAdapters = [
    new CognaiJsonImportAdapter(),
    new Mem0ImportAdapter(),
    new MemPalaceImportAdapter()
  ];
  const connectors = createConnectors(config);

  return {
    config,
    storage,
    embeddingProvider,
    enrichmentProvider,
    inferenceEngine,
    revisionEngine,
    retrievalEngine,
    importAdapters,
    connectors
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
