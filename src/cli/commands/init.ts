import { dirname, resolve } from "node:path";

import { createId } from "../../shared/ids.js";
import { truncate } from "../../shared/text.js";
import { saveConfig, saveState } from "../../config/loader.js";
import { createDefaultConfig } from "../../config/defaults.js";
import { createStorageAdapter } from "../../storage/factory.js";
import { runInitPrompts } from "../prompts.js";
import { printSection } from "../output.js";

export interface InitCommandOptions {
  config?: string;
  yes?: boolean;
  mode?: "user" | "org";
  storage?: "file" | "memory" | "surrealdb";
  embeddingProvider?: "none" | "openai";
  enrichmentProvider?: "none" | "openai";
  connector?: "none" | "mem0" | "mempalace" | "both";
  seed?: string;
}

export async function runInitCommand(
  options: InitCommandOptions = {}
): Promise<void> {
  const base = createDefaultConfig();
  const answers = options.yes
    ? {
        mode: options.mode ?? base.mode,
        storage: options.storage ?? base.storage.adapter,
        embeddingProvider: options.embeddingProvider ?? base.embeddings.provider,
        enrichmentProvider:
          options.enrichmentProvider ?? base.enrichment.provider,
        connector: options.connector ?? "none",
        seed: options.seed ?? "",
        importNow: true
      }
    : await runInitPrompts();

  const config = createDefaultConfig();
  config.mode = answers.mode;
  config.storage.adapter = answers.storage;
  config.embeddings.provider = answers.embeddingProvider;
  config.enrichment.provider = answers.enrichmentProvider;
  config.enrichment.enabled = answers.enrichmentProvider !== "none";
  config.connectors.mem0.enabled =
    answers.connector === "mem0" || answers.connector === "both";
  config.connectors.mempalace.enabled =
    answers.connector === "mempalace" || answers.connector === "both";
  if (options.config) {
    const configPath = resolve(options.config);
    const root = dirname(configPath);
    config.paths.root = root;
    config.paths.config = configPath;
    config.paths.data = resolve(root, "data");
    config.paths.imports = resolve(root, "imports");
    config.paths.state = resolve(root, "state.json");
    config.storage.fileDataPath = resolve(config.paths.data, "file-store");
    config.storage.surrealkvPath = resolve(config.paths.data, "surreal-store");
  }

  await saveConfig(config);
  await saveState(config, {
    connectors: {
      mem0: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: []
      },
      mempalace: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: []
      }
    }
  });

  const storage = createStorageAdapter(config);
  await storage.init();

  if (answers.seed.trim().length > 0) {
    await storage.writeNode({
      id: createId(),
      type: "Identity Claim",
      label: truncate(answers.seed, 60),
      description: answers.seed,
      embedding: [],
      source: "stated",
      confidence: 0.9,
      activation: 0.8,
      centrality: 0.6,
      construal_level: "high",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_reinforced_at: new Date().toISOString(),
      metadata: {
        seeded_via: "init"
      }
    });
  }

  await storage.close();

  printSection(
    "Initialized",
    `Mode: ${config.mode}
Storage adapter: ${config.storage.adapter}
Embedding provider: ${config.embeddings.provider}
Enrichment provider: ${config.enrichment.provider}
Mem0 connector: ${config.connectors.mem0.enabled ? "enabled" : "disabled"}
MemPalace connector: ${config.connectors.mempalace.enabled ? "enabled" : "disabled"}
Config: ${config.paths.config}
Data root: ${config.paths.data}
State file: ${config.paths.state}
SurrealKV path: ${config.storage.surrealkvPath}`
  );

  printSection(
    "Next Steps",
    `- Run "cognai doctor" to validate the workspace.
- Run "cognai mcp snippet" for client config examples.
- Run "cognai sync --transcript <file>" to ingest a canonical or adapter-supported export.
- Run "cognai sync --connector mem0" or "cognai sync --connector mempalace" after credentials are configured if you enabled live connectors.`
  );
}
