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
import { ObsidianImportAdapter } from "../importers/adapters/obsidian.js";
import { createConnectors } from "../connectors/factory.js";

export function createRuntime(config: CognaiConfig) {
  const storage = createStorageAdapter(config);
  const embeddingProvider = createEmbeddingProvider(config.embeddings);
  const auxReasoningProvider = createEnrichmentProvider(config.aux_reasoning);
  const inferenceEngine = new InferenceEngine(embeddingProvider, auxReasoningProvider);
  const revisionEngine = new RevisionEngine();
  const retrievalEngine = new RetrievalEngine(
    storage,
    embeddingProvider,
    config.retrieval.topK,
    config.retrieval.confidenceFloor,
    config.retrieval.telosAnchorLimit,
    config.retrieval.edgeTraversalHops,
    config.retrieval.maxReturnedNodes,
    config.retrieval.maxReturnedEdges,
    config.retrieval.maxContextTokens,
    config
  );
  const importAdapters = [
    new CognaiJsonImportAdapter(),
    new Mem0ImportAdapter(),
    new MemPalaceImportAdapter(),
    new ObsidianImportAdapter()
  ];
  const connectors = createConnectors(config);

  return {
    config,
    storage,
    embeddingProvider,
    auxReasoningProvider,
    inferenceEngine,
    revisionEngine,
    retrievalEngine,
    importAdapters,
    connectors
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
