import { resolve } from "node:path";

import type { CognaiConfig } from "./schema.js";

export function createDefaultConfig(cwd: string = process.cwd()): CognaiConfig {
  const root = resolve(cwd, ".cognai");
  const data = resolve(root, "data");

  return {
    mode: "user",
    storage: {
      adapter: "surrealdb",
      fileDataPath: resolve(data, "file-store"),
      surrealkvPath: resolve(data, "surreal-store"),
      namespace: "cognai",
      database: "default"
    },
    embeddings: {
      provider: "none",
      model: "text-embedding-3-small",
      apiKeyEnvVar: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      timeoutMs: 15000
    },
    aux_reasoning: {
      enabled: false,
      provider: "none",
      model: "gpt-4.1-mini",
      apiKeyEnvVar: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      timeoutMs: 20000
    },
    retrieval: {
      topK: 8,
      confidenceFloor: 0.6,
      telosAnchorLimit: 3,
      edgeTraversalHops: 2,
      maxReturnedNodes: 10,
      maxReturnedEdges: 12,
      maxContextTokens: 700
    },
    inference: {
      passiveSyncEnabled: true,
      activeWritesEnabled: true
    },
    decay: {
      schedule: "0 0 * * 0",
      rate: 0.05,
      floor: 0.2
    },
    imports: {
      defaultSource: "cognai-json",
      allowUnknownMetadata: true
    },
    mcp: {
      transport: "stdio"
    },
    onboarding: {
      generateClientSnippets: true,
      seedFromSelfDescription: true
    },
    connectors: {
      mem0: {
        enabled: false,
        baseUrl: "https://api.mem0.ai",
        memoryPath: "/v1/memories/",
        apiKeyEnvVar: "MEM0_API_KEY",
        userId: "default",
        pageSize: 100,
        pollIntervalMinutes: 30,
        autoSync: false
      },
      obsidian: {
        enabled: false,
        vaultPath: resolve(cwd, "Obsidian"),
        includeDirs: [],
        excludeDirs: [".obsidian", ".trash", ".git", "node_modules"],
        maxFilesPerSync: 1000,
        pollIntervalMinutes: 60,
        autoSync: false
      },
      mempalace: {
        enabled: false,
        command: "mempalace",
        args: [],
        workingDirectory: cwd,
        palacePath: resolve(cwd, ".mempalace"),
        integrationMode: "sibling_mcp",
        bootstrapMode: "none",
        backfillScope: "audit_only",
        includeWings: [],
        excludeWings: [],
        includeRooms: [],
        excludeRooms: [],
        pageSize: 200,
        maxInventoryDrawersPerRun: 5000,
        maxSemanticDrawersPerRun: 500,
        bootstrap: {
          searchLimit: 8,
          wakeUpTokenBudget: 600
        },
        pollIntervalMinutes: 60,
        autoSync: false
      }
    },
    paths: {
      root,
      config: resolve(root, "config.json"),
      data,
      imports: resolve(root, "imports"),
      state: resolve(root, "state.json")
    }
  };
}
