import * as z from "zod/v4";

export const cognaiConfigSchema = z.object({
  mode: z.enum(["user", "org"]),
  storage: z.object({
    adapter: z.enum(["file", "memory", "surrealdb"]),
    fileDataPath: z.string(),
    surrealkvPath: z.string(),
    namespace: z.string(),
    database: z.string()
  }),
  embeddings: z.object({
    provider: z.enum(["none", "openai"]),
    model: z.string(),
    apiKeyEnvVar: z.string()
  }),
  enrichment: z.object({
    enabled: z.boolean(),
    provider: z.enum(["none", "openai"]),
    model: z.string(),
    apiKeyEnvVar: z.string()
  }),
  retrieval: z.object({
    topK: z.number().int().positive(),
    confidenceFloor: z.number().min(0).max(1),
    telosAnchorLimit: z.number().int().positive(),
    edgeTraversalHops: z.number().int().positive()
  }),
  inference: z.object({
    passiveSyncEnabled: z.boolean(),
    activeWritesEnabled: z.boolean()
  }),
  decay: z.object({
    schedule: z.string(),
    rate: z.number().min(0).max(1),
    floor: z.number().min(0).max(1)
  }),
  imports: z.object({
    defaultSource: z.string(),
    allowUnknownMetadata: z.boolean()
  }),
  mcp: z.object({
    transport: z.literal("stdio")
  }),
  onboarding: z.object({
    generateClientSnippets: z.boolean(),
    seedFromSelfDescription: z.boolean()
  }),
  connectors: z.object({
    mem0: z.object({
      enabled: z.boolean(),
      baseUrl: z.string(),
      memoryPath: z.string(),
      apiKeyEnvVar: z.string(),
      userId: z.string(),
      pageSize: z.number().int().positive(),
      pollIntervalMinutes: z.number().int().positive(),
      autoSync: z.boolean()
    }),
    mempalace: z.object({
      enabled: z.boolean(),
      command: z.string(),
      args: z.array(z.string()),
      workingDirectory: z.string(),
      pollIntervalMinutes: z.number().int().positive(),
      autoSync: z.boolean()
    })
  }),
  paths: z.object({
    root: z.string(),
    config: z.string(),
    data: z.string(),
    imports: z.string(),
    state: z.string()
  })
});

export type CognaiConfig = z.infer<typeof cognaiConfigSchema>;

export const connectorSyncStateSchema = z.object({
  lastSyncAt: z.string().nullable(),
  lastRunStatus: z.enum(["never", "ok", "warning", "error"]),
  lastError: z.string().nullable(),
  seenSourceIds: z.array(z.string())
});

export const cognaiStateSchema = z.object({
  connectors: z.object({
    mem0: connectorSyncStateSchema,
    mempalace: connectorSyncStateSchema
  })
});

export type ConnectorSyncState = z.infer<typeof connectorSyncStateSchema>;
export type CognaiState = z.infer<typeof cognaiStateSchema>;
