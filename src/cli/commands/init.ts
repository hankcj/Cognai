import { dirname, resolve } from "node:path";

import { createId } from "../../shared/ids.js";
import { truncate } from "../../shared/text.js";
import { saveConfig, saveState } from "../../config/loader.js";
import { createDefaultConfig } from "../../config/defaults.js";
import { MemPalaceService } from "../../mempalace/service.js";
import { createStorageAdapter } from "../../storage/factory.js";
import { runInitPrompts } from "../prompts.js";
import { printSection } from "../output.js";

export interface InitCommandOptions {
  config?: string;
  yes?: boolean;
  mode?: "user" | "org";
  storage?: "file" | "memory" | "surrealdb";
  embeddingProvider?: "none" | "openai";
  auxProvider?: "none" | "openai" | "anthropic" | "google" | "openai-compatible";
  enrichmentProvider?: "none" | "openai" | "anthropic" | "google" | "openai-compatible";
  connector?: "none" | "mem0" | "mempalace" | "obsidian" | "all" | "both";
  mempalacePalacePath?: string;
  mempalaceBackfillScope?: "audit_only" | "selected" | "full";
  mempalaceIncludeWings?: string;
  mempalaceIncludeRooms?: string;
  obsidianVaultPath?: string;
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
        auxReasoningProvider:
          options.auxProvider ??
          options.enrichmentProvider ??
          base.aux_reasoning.provider,
        connector: options.connector ?? "none",
        mempalacePalacePath:
          options.mempalacePalacePath ?? base.connectors.mempalace.palacePath,
        mempalaceBackfillScope:
          options.mempalaceBackfillScope ?? base.connectors.mempalace.backfillScope,
        mempalaceIncludeWings: options.mempalaceIncludeWings
          ? options.mempalaceIncludeWings
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : [],
        mempalaceIncludeRooms: options.mempalaceIncludeRooms
          ? options.mempalaceIncludeRooms
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : [],
        obsidianVaultPath:
          options.obsidianVaultPath ?? base.connectors.obsidian.vaultPath,
        seed: options.seed ?? "",
        importNow: true
      }
    : await runInitPrompts();

  const config = createDefaultConfig();
  config.mode = answers.mode;
  config.storage.adapter = answers.storage;
  config.embeddings.provider = answers.embeddingProvider;
  config.aux_reasoning.provider = answers.auxReasoningProvider;
  config.aux_reasoning.enabled = answers.auxReasoningProvider !== "none";
  config.connectors.mem0.enabled =
    answers.connector === "mem0" ||
    answers.connector === "all" ||
    answers.connector === "both";
  config.connectors.mempalace.enabled =
    answers.connector === "mempalace" ||
    answers.connector === "all" ||
    answers.connector === "both";
  config.connectors.obsidian.enabled =
    answers.connector === "obsidian" || answers.connector === "all";
  config.connectors.mempalace.palacePath = resolve(answers.mempalacePalacePath || config.connectors.mempalace.palacePath);
  config.connectors.mempalace.backfillScope = answers.mempalaceBackfillScope;
  config.connectors.mempalace.includeWings = answers.mempalaceIncludeWings;
  config.connectors.mempalace.includeRooms = answers.mempalaceIncludeRooms;
  config.connectors.obsidian.vaultPath = resolve(
    answers.obsidianVaultPath || config.connectors.obsidian.vaultPath
  );
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
        seenSourceIds: [],
        lastAuditAt: null,
        lastInventoryAt: null,
        lastBackfillAt: null
      },
      mempalace: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: [],
        lastAuditAt: null,
        lastInventoryAt: null,
        lastBackfillAt: null
      },
      obsidian: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: [],
        lastAuditAt: null,
        lastInventoryAt: null,
        lastBackfillAt: null
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

  let mempalaceAuditSummary = "not run";
  if (config.connectors.mempalace.enabled) {
    const service = new MemPalaceService(config, createStorageAdapter(config));
    try {
      const audit = await service.audit();
      mempalaceAuditSummary = `${audit.total_wings} wings / ${audit.total_rooms} rooms / ${audit.total_drawers} drawers`;
    } catch (error) {
      mempalaceAuditSummary =
        error instanceof Error ? `audit unavailable (${error.message})` : "audit unavailable";
    } finally {
      await service.close();
    }
  }

  printSection(
    "Initialized",
    `Mode: ${config.mode}
Storage adapter: ${config.storage.adapter}
Embedding provider: ${config.embeddings.provider}
Aux reasoning provider: ${config.aux_reasoning.provider}
Mem0 connector: ${config.connectors.mem0.enabled ? "enabled" : "disabled"}
MemPalace connector: ${config.connectors.mempalace.enabled ? "enabled" : "disabled"}
MemPalace backfill scope: ${config.connectors.mempalace.backfillScope}
MemPalace audit: ${mempalaceAuditSummary}
Obsidian connector: ${config.connectors.obsidian.enabled ? "enabled" : "disabled"}
Obsidian vault: ${config.connectors.obsidian.vaultPath}
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
- If MemPalace is enabled, remember:
  Audit tells us what exists.
  Inventory tells us every drawer we know about.
  Semantic backfill tells us what Cognai has actually processed.
- Run "cognai sync --connector mem0", "cognai sync --connector mempalace", or "cognai sync --connector obsidian" after connectors are configured.`
  );
}
