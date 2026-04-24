import { configExists, loadConfig, loadState } from "../../config/loader.js";
import { createRuntime } from "../../mcp/context.js";
import { createDefaultConfig } from "../../config/defaults.js";
import { printSection } from "../output.js";

export interface DoctorCommandOptions {
  config?: string;
}

export async function runDoctorCommand(
  options: DoctorCommandOptions = {}
): Promise<void> {
  const fallback = createDefaultConfig();
  const configPath = options.config ?? fallback.paths.config;
  const exists = await configExists(configPath);

  if (!exists) {
    printSection(
      "Doctor",
      `No config found at ${configPath}. Run "cognai init" first.`
    );
    return;
  }

  const config = await loadConfig(configPath);
  const state = await loadState(config);
  const runtime = createRuntime(config);

  let storageStatus = "ok";
  let storageNote = `${config.storage.adapter}`;

  try {
    await runtime.storage.init();
  } catch (error) {
    storageStatus = "warning";
    storageNote = error instanceof Error ? error.message : "Unknown storage error.";
  } finally {
    await runtime.storage.close();
  }

  const mem0Issues = runtime.connectors
    .find((connector) => connector.name === "mem0")
    ?.validate(config) ?? [];
  const mempalaceIssues = runtime.connectors
    .find((connector) => connector.name === "mempalace")
    ?.validate(config) ?? [];
  const mem0Ready =
    config.connectors.mem0.enabled && Boolean(process.env[config.connectors.mem0.apiKeyEnvVar]);
  const mempalaceReady =
    config.connectors.mempalace.enabled && config.connectors.mempalace.command.trim().length > 0;

  printSection(
    "Doctor",
    `Config: ok
Storage: ${storageStatus}
Storage detail: ${storageNote}
Embeddings configured: ${runtime.embeddingProvider.isConfigured() ? "yes" : "no"}
Embedding mode: ${config.embeddings.provider}
Enrichment configured: ${runtime.enrichmentProvider.isConfigured() ? "yes" : "no"}
Enrichment mode: ${config.enrichment.provider}
Mem0 connector: ${config.connectors.mem0.enabled ? "enabled" : "disabled"} (${mem0Ready ? "ready" : "not ready"})
Mem0 issues: ${mem0Issues.join(" ") || "none"}
MemPalace connector: ${config.connectors.mempalace.enabled ? "enabled" : "disabled"} (${mempalaceReady ? "ready" : "not ready"})
MemPalace issues: ${mempalaceIssues.join(" ") || "none"}
Mem0 schedule: every ${config.connectors.mem0.pollIntervalMinutes} minute(s), autoSync=${config.connectors.mem0.autoSync ? "on" : "off"}
MemPalace schedule: every ${config.connectors.mempalace.pollIntervalMinutes} minute(s), autoSync=${config.connectors.mempalace.autoSync ? "on" : "off"}
Last Mem0 sync: ${state.connectors.mem0.lastSyncAt ?? "never"} (${state.connectors.mem0.lastRunStatus})
Last MemPalace sync: ${state.connectors.mempalace.lastSyncAt ?? "never"} (${state.connectors.mempalace.lastRunStatus})
MCP transport: ${config.mcp.transport}
SurrealKV path: ${config.storage.surrealkvPath}`
  );
}
