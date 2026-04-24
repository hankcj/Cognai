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
      apiKeyEnvVar: "OPENAI_API_KEY"
    },
    enrichment: {
      enabled: false,
      provider: "none",
      model: "gpt-4.1-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    },
    retrieval: {
      topK: 8,
      confidenceFloor: 0.6,
      telosAnchorLimit: 3,
      edgeTraversalHops: 2
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
      mempalace: {
        enabled: false,
        command: "mempalace",
        args: ["export", "--format", "json"],
        workingDirectory: cwd,
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
