import { readFile } from "node:fs/promises";

import { loadState, requireConfig, saveConfig, saveState } from "../../config/loader.js";
import type { CognaiState } from "../../config/schema.js";
import { getConnectorByName } from "../../connectors/factory.js";
import type { ConnectorName } from "../../connectors/types.js";
import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import { MemPalaceService } from "../../mempalace/service.js";
import { createRuntime } from "../../mcp/context.js";
import { CognaiError } from "../../shared/errors.js";
import { printSection } from "../output.js";

export interface SyncCommandOptions {
  config?: string;
  transcript?: string;
  source?: string;
  since?: string;
  connector?: ConnectorName;
  enableSchedule?: boolean;
}

function materializeMemoryEntries(
  envelope: CanonicalConversationEnvelope
): CanonicalConversationEnvelope {
  const syntheticMessages = envelope.memory_entries.map((entry, index) => ({
    id: `memory-${entry.id ?? index + 1}`,
    role: "user" as const,
    content: entry.content,
    timestamp: entry.created_at ?? new Date().toISOString(),
    metadata: {
      ...entry.metadata,
      derived_from_memory_entry: true,
      source_id:
        typeof entry.metadata.source_id === "string" ? entry.metadata.source_id : entry.id
    }
  }));

  return {
    ...envelope,
    messages: [...envelope.messages, ...syntheticMessages]
  };
}

function filterEnvelopeBySeenIds(
  envelope: CanonicalConversationEnvelope,
  seenIds: string[]
): CanonicalConversationEnvelope {
  const seen = new Set(seenIds);

  return {
    ...envelope,
    messages: envelope.messages.filter((message) => {
      const sourceId =
        typeof message.metadata.source_id === "string" ? message.metadata.source_id : message.id;
      return !seen.has(sourceId);
    }),
    memory_entries: envelope.memory_entries.filter((entry) => {
      const sourceId =
        typeof entry.metadata.source_id === "string" ? entry.metadata.source_id : entry.id;
      return !seen.has(sourceId);
    })
  };
}

function collectSourceIds(envelope: CanonicalConversationEnvelope): string[] {
  return [
    ...envelope.messages.map((message) =>
      typeof message.metadata.source_id === "string" ? message.metadata.source_id : message.id
    ),
    ...envelope.memory_entries.map((entry) =>
      typeof entry.metadata.source_id === "string" ? entry.metadata.source_id : entry.id
    )
  ].filter((value) => Boolean(value));
}

function updateConnectorState(
  state: CognaiState,
  connector: ConnectorName,
  updates: Partial<CognaiState["connectors"][ConnectorName]>
): CognaiState {
  return {
    ...state,
    connectors: {
      ...state.connectors,
      [connector]: {
        ...state.connectors[connector],
        ...updates
      }
    }
  };
}

export async function runSyncCommand(
  options: SyncCommandOptions = {}
): Promise<void> {
  if (!options.transcript && !options.since && !options.connector) {
    throw new CognaiError(
      'Provide "--transcript <path>", "--connector <name>", or "--since <value>" to run sync.'
    );
  }

  const config = await requireConfig(options.config);
  if (options.enableSchedule && options.connector) {
    config.connectors[options.connector].autoSync = true;
    await saveConfig(config);
  }
  const runtime = createRuntime(config);
  await runtime.storage.init();

  try {
    if (options.since) {
      printSection(
        "Sync Window",
        `Time-based sync scaffolding is registered but not implemented yet: ${options.since}`
      );
      return;
    }

    if (options.enableSchedule && options.connector) {
      printSection(
        "Schedule Updated",
        `${options.connector} is configured for polling every ${
          config.connectors[options.connector].pollIntervalMinutes
        } minute(s) when "cognai serve" is running.`
      );
    }

    let envelope: CanonicalConversationEnvelope;
    let adapterSource = options.source ?? "cognai-json";
    let rangeSummary = "local transcript import";
    let state = await loadState(config);

    if (options.connector === "mempalace") {
      const mempalaceService = new MemPalaceService(config, runtime.storage);
      const result = await mempalaceService.syncDelta();
      adapterSource = "mempalace";
      rangeSummary = result.rangeSummary;
      envelope = materializeMemoryEntries(result.envelope);

      if (envelope.messages.length === 0 && envelope.memory_entries.length === 0) {
        state = updateConnectorState(state, "mempalace", {
          lastSyncAt: new Date().toISOString(),
          lastRunStatus: result.deletedDrawerIds.length > 0 ? "warning" : "ok",
          lastError: null,
          lastAuditAt: result.coverage.last_audit_at,
          lastInventoryAt: result.coverage.last_inventory_at,
          lastBackfillAt: result.coverage.last_backfill_at
        });
        await saveState(config, state);
        printSection(
          "Sync Complete",
          `Connector: mempalace
Source range: ${rangeSummary}
Coverage: ${result.coverage.coverage_status}
Deleted drawers flagged: ${result.deletedDrawerIds.length}
Warnings: ${result.warnings.join("; ") || "none"}
No pending MemPalace drawers required semantic backfill.`
        );
        return;
      }
    } else if (options.connector) {
      const connector = getConnectorByName(runtime.connectors, options.connector);
      if (!connector) {
        throw new CognaiError(`Unknown connector "${options.connector}".`);
      }

      const issues = connector.validate(config);
      if (issues.length > 0) {
        throw new CognaiError(
          `${options.connector} connector configuration is invalid: ${issues.join(" ")}`
        );
      }

      const result = await connector.pull(config, state.connectors[options.connector]);
      adapterSource = result.source;
      rangeSummary = result.rangeSummary;

      const adapter =
        runtime.importAdapters.find((candidate) => candidate.source === result.source) ??
        runtime.importAdapters.find((candidate) => candidate.canParse(result.payload));

      if (!adapter) {
        throw new CognaiError(`No import adapter is registered for ${result.source}.`);
      }

      envelope = filterEnvelopeBySeenIds(
        materializeMemoryEntries(adapter.normalize(result.payload)),
        state.connectors[options.connector].seenSourceIds
      );

      if (envelope.messages.length === 0 && envelope.memory_entries.length === 0) {
        state = updateConnectorState(state, options.connector, {
          lastSyncAt: new Date().toISOString(),
          lastRunStatus: "ok",
          lastError: null
        });
        await saveState(config, state);
        printSection(
          "Sync Complete",
          `Connector: ${options.connector}
Source range: ${rangeSummary}
No new source items were found after dedupe.`
        );
        return;
      }
    } else {
      const raw = await readFile(options.transcript!, "utf8");
      const input = JSON.parse(raw) as unknown;
      const adapter =
        runtime.importAdapters.find((candidate) => candidate.source === options.source) ??
        runtime.importAdapters.find((candidate) => candidate.canParse(input));

      if (!adapter) {
        throw new CognaiError(
          "No import adapter could parse this input. Use a canonical Cognai JSON envelope or select a known source adapter."
        );
      }

      adapterSource = adapter.source;
      envelope = materializeMemoryEntries(adapter.normalize(input));
    }

    const inference = await runtime.inferenceEngine.analyzeConversation(envelope);
    const revision = await runtime.revisionEngine.apply(runtime.storage, inference);

    if (options.connector === "mempalace") {
      const coverage = await new MemPalaceService(config, runtime.storage).coverage();
      const mergedSeenIds = [...state.connectors.mempalace.seenSourceIds, ...collectSourceIds(envelope)].slice(
        -5000
      );
      state = updateConnectorState(state, "mempalace", {
        lastSyncAt: new Date().toISOString(),
        lastRunStatus:
          coverage.coverage_status === "full" ? "ok" : "warning",
        lastError: null,
        lastAuditAt: coverage.last_audit_at,
        lastInventoryAt: coverage.last_inventory_at,
        lastBackfillAt: coverage.last_backfill_at,
        seenSourceIds: [...new Set(mergedSeenIds)]
      });
      await saveState(config, state);
    } else if (options.connector) {
      const connectorState = state.connectors[options.connector];
      const mergedSeenIds = [
        ...connectorState.seenSourceIds,
        ...collectSourceIds(envelope)
      ].slice(-2000);
      state = updateConnectorState(state, options.connector, {
        lastSyncAt: new Date().toISOString(),
        lastRunStatus: "ok",
        lastError: null,
        seenSourceIds: [...new Set(mergedSeenIds)]
      });
      await saveState(config, state);
    }

    printSection(
      "Sync Complete",
      `Source adapter: ${adapterSource}
Source range: ${rangeSummary}
Episodes written: ${revision.episodesWritten}
Nodes written: ${revision.nodesWritten}
Nodes reinforced: ${revision.nodesReinforced}
Edges written: ${revision.edgesWritten}
Contradictions created: ${revision.contradictionCandidates}
Fears detected: ${revision.fearsDetected}
Assumptions detected: ${revision.assumptionsDetected}
Tensions changed: ${revision.tensionsChanged}
Aux reasoning applied: ${revision.auxReasoningApplied ? "yes" : "no"}
Warnings: ${revision.warnings.join("; ") || "none"}`
    );
  } catch (error) {
    if (options.connector) {
      const state = await loadState(config);
      const nextState = updateConnectorState(state, options.connector, {
        lastRunStatus: "error",
        lastError: error instanceof Error ? error.message : "Unknown sync error."
      });
      await saveState(config, nextState);
    }

    throw error;
  } finally {
    await runtime.storage.close();
  }
}
