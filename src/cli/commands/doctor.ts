import { configExists, loadConfig, loadState } from "../../config/loader.js";
import { loadMemPalaceCoverage } from "../../mempalace/state.js";
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
  const obsidianConnector = runtime.connectors.find(
    (connector) => connector.name === "obsidian"
  );
  const obsidianIssues = obsidianConnector?.validate(config) ?? [];
  const obsidianHealth =
    config.connectors.obsidian.enabled && obsidianConnector?.checkHealth
      ? await obsidianConnector.checkHealth(config, state.connectors.obsidian)
      : null;
  const mempalaceConnector = runtime.connectors.find(
    (connector) => connector.name === "mempalace"
  );
  const mempalaceIssues = mempalaceConnector?.validate(config) ?? [];
  const mempalaceHealth =
    config.connectors.mempalace.enabled && mempalaceConnector?.checkHealth
      ? await mempalaceConnector.checkHealth(config, state.connectors.mempalace)
      : null;
  const mem0Ready =
    config.connectors.mem0.enabled && Boolean(process.env[config.connectors.mem0.apiKeyEnvVar]);
  const obsidianReady =
    config.connectors.obsidian.enabled &&
    config.connectors.obsidian.vaultPath.trim().length > 0 &&
    obsidianIssues.length === 0;
  const mempalaceReady =
    config.connectors.mempalace.enabled &&
    config.connectors.mempalace.command.trim().length > 0 &&
    config.connectors.mempalace.palacePath.trim().length > 0;
  const mempalaceCoverage = await loadMemPalaceCoverage(config);
  const remediations: string[] = [];

  if (storageStatus !== "ok") {
    remediations.push(
      `Check the configured storage adapter and local data paths. Current adapter: ${config.storage.adapter}.`
    );
  }

  if (config.embeddings.provider !== "none" && !runtime.embeddingProvider.isConfigured()) {
    remediations.push(
      `Set ${config.embeddings.apiKeyEnvVar} or switch embeddings.provider to "none".`
    );
  }

  if (
    config.aux_reasoning.provider !== "none" &&
    !runtime.auxReasoningProvider.isConfigured()
  ) {
    remediations.push(
      `Set ${config.aux_reasoning.apiKeyEnvVar} or switch aux_reasoning.provider to "none".`
    );
  }

  if (config.connectors.mem0.enabled && !mem0Ready) {
    remediations.push(
      `Set ${config.connectors.mem0.apiKeyEnvVar} and verify the Mem0 base URL before running sync.`
    );
  }

  if (config.connectors.obsidian.enabled && obsidianIssues.length > 0) {
    remediations.push(
      "Fix the Obsidian vault path or file limits in config before running connector sync."
    );
  }

  if (
    config.connectors.obsidian.enabled &&
    obsidianHealth &&
    obsidianHealth.status !== "ok"
  ) {
    remediations.push(
      "Confirm the Obsidian vault path exists and contains Markdown notes in the configured scope."
    );
  }

  if (config.connectors.mempalace.enabled && mempalaceIssues.length > 0) {
    remediations.push(
      "Fix the MemPalace command or palace path in config before running connector sync."
    );
  }

  if (
    config.connectors.mempalace.enabled &&
    mempalaceHealth &&
    mempalaceHealth.status !== "ok"
  ) {
    remediations.push(
      "Run the configured MemPalace command manually, confirm the palace path exists, and rerun doctor."
    );
  }

  if (
    config.connectors.mempalace.enabled &&
    mempalaceCoverage.coverage_status !== "full"
  ) {
    remediations.push(
      "MemPalace coverage is not full yet. Run `cognai mempalace audit`, `cognai mempalace inventory`, and then `cognai sync --connector mempalace` or `cognai mempalace backfill`."
    );
  }

  printSection(
    "Doctor",
    `Config: ok
Storage: ${storageStatus}
Storage detail: ${storageNote}
Embeddings configured: ${runtime.embeddingProvider.isConfigured() ? "yes" : "no"}
Embedding mode: ${config.embeddings.provider}
Aux reasoning configured: ${runtime.auxReasoningProvider.isConfigured() ? "yes" : "no"}
Aux reasoning mode: ${config.aux_reasoning.provider}
Mem0 connector: ${config.connectors.mem0.enabled ? "enabled" : "disabled"} (${mem0Ready ? "ready" : "not ready"})
Mem0 issues: ${mem0Issues.join(" ") || "none"}
Obsidian connector: ${config.connectors.obsidian.enabled ? "enabled" : "disabled"} (${obsidianReady ? "ready" : "not ready"})
Obsidian issues: ${obsidianIssues.join(" ") || "none"}
Obsidian vault: ${config.connectors.obsidian.vaultPath}
Obsidian health: ${obsidianHealth ? `${obsidianHealth.status} (${obsidianHealth.detail})` : "not checked"}
MemPalace connector: ${config.connectors.mempalace.enabled ? "enabled" : "disabled"} (${mempalaceReady ? "ready" : "not ready"})
MemPalace issues: ${mempalaceIssues.join(" ") || "none"}
MemPalace palace: ${config.connectors.mempalace.palacePath}
MemPalace integration mode: ${config.connectors.mempalace.integrationMode}
MemPalace backfill scope: ${config.connectors.mempalace.backfillScope}
MemPalace health: ${mempalaceHealth ? `${mempalaceHealth.status} (${mempalaceHealth.detail})` : "not checked"}
MemPalace coverage: ${mempalaceCoverage.coverage_status}
MemPalace inventory completeness: ${mempalaceCoverage.inventoried_drawers}/${mempalaceCoverage.total_drawers}
MemPalace semantic completeness: ${mempalaceCoverage.semantically_synced_drawers}/${mempalaceCoverage.total_drawers}
MemPalace pending changed/deleted: ${mempalaceCoverage.changed_drawers}/${mempalaceCoverage.deleted_drawers}
Mem0 schedule: every ${config.connectors.mem0.pollIntervalMinutes} minute(s), autoSync=${config.connectors.mem0.autoSync ? "on" : "off"}
Obsidian schedule: every ${config.connectors.obsidian.pollIntervalMinutes} minute(s), autoSync=${config.connectors.obsidian.autoSync ? "on" : "off"}
MemPalace schedule: every ${config.connectors.mempalace.pollIntervalMinutes} minute(s), autoSync=${config.connectors.mempalace.autoSync ? "on" : "off"}
Last Mem0 sync: ${state.connectors.mem0.lastSyncAt ?? "never"} (${state.connectors.mem0.lastRunStatus})
Last Obsidian sync: ${state.connectors.obsidian.lastSyncAt ?? "never"} (${state.connectors.obsidian.lastRunStatus})
Last MemPalace sync: ${state.connectors.mempalace.lastSyncAt ?? "never"} (${state.connectors.mempalace.lastRunStatus})
MCP transport: ${config.mcp.transport}
SurrealKV path: ${config.storage.surrealkvPath}`
  );

  printSection(
    "Remediation",
    remediations.length > 0 ? remediations.map((item) => `- ${item}`).join("\n") : "No action needed."
  );
}
