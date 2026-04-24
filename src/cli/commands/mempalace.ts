import { loadState, requireConfig, saveState } from "../../config/loader.js";
import { MemPalaceService } from "../../mempalace/service.js";
import { createStorageAdapter } from "../../storage/factory.js";
import { printJson, printSection } from "../output.js";

interface MemPalaceCommandOptions {
  config?: string;
}

export async function runMemPalaceAuditCommand(
  options: MemPalaceCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const storage = createStorageAdapter(config);
  const service = new MemPalaceService(config, storage);

  try {
    const audit = await service.audit();
    const state = await loadState(config);
    state.connectors.mempalace.lastAuditAt = audit.captured_at;
    state.connectors.mempalace.lastRunStatus = "ok";
    state.connectors.mempalace.lastError = null;
    await saveState(config, state);
    printSection(
      "MemPalace Audit",
      `Revision: ${audit.revision}
Wings: ${audit.total_wings}
Rooms: ${audit.total_rooms}
Drawers: ${audit.total_drawers}`
    );
  } finally {
    await service.close();
  }
}

export async function runMemPalaceInventoryCommand(
  options: MemPalaceCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const storage = createStorageAdapter(config);
  const service = new MemPalaceService(config, storage);

  try {
    const coverage = await service.inventory();
    const state = await loadState(config);
    state.connectors.mempalace.lastInventoryAt = coverage.last_inventory_at;
    state.connectors.mempalace.lastRunStatus =
      coverage.coverage_status === "full" ? "ok" : "warning";
    state.connectors.mempalace.lastError = null;
    await saveState(config, state);
    printSection(
      "MemPalace Inventory",
      `Coverage: ${coverage.coverage_status}
Inventoried drawers: ${coverage.inventoried_drawers}/${coverage.total_drawers}
Pending semantic backfill: ${coverage.pending_drawers}
Changed drawers: ${coverage.changed_drawers}
Deleted drawers: ${coverage.deleted_drawers}`
    );
  } finally {
    await service.close();
  }
}

export async function runMemPalaceBackfillCommand(
  options: MemPalaceCommandOptions & { allPending?: boolean } = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const storage = createStorageAdapter(config);
  await storage.init();
  const service = new MemPalaceService(config, storage);

  try {
    const result = await service.backfill(!options.allPending);
    const state = await loadState(config);
    state.connectors.mempalace.lastBackfillAt = result.coverage.last_backfill_at;
    state.connectors.mempalace.lastSyncAt = new Date().toISOString();
    state.connectors.mempalace.lastRunStatus =
      result.coverage.coverage_status === "full" ? "ok" : "warning";
    state.connectors.mempalace.lastError = null;
    await saveState(config, state);
    printSection(
      "MemPalace Backfill",
      `Prepared drawers: ${result.sourceIds.length}
Changed drawers flagged: ${result.changedDrawerIds.length}
Deleted drawers flagged: ${result.deletedDrawerIds.length}
Coverage: ${result.coverage.coverage_status}
Warnings: ${result.warnings.join("; ") || "none"}`
    );
  } finally {
    await service.close();
    await storage.close();
  }
}

export async function runMemPalaceCoverageCommand(
  options: MemPalaceCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const storage = createStorageAdapter(config);
  const service = new MemPalaceService(config, storage);

  try {
    printJson(await service.coverage());
  } finally {
    await service.close();
  }
}
