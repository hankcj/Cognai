import { resolve } from "node:path";

import type { CognaiConfig } from "../config/schema.js";
import {
  ensureDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile
} from "../shared/fs.js";
import type {
  MemPalaceAuditFile,
  MemPalaceCoverageSummary,
  MemPalaceCursorState,
  MemPalaceInventoryRow
} from "./types.js";

function getStateDir(config: CognaiConfig): string {
  return resolve(config.paths.root, "state", "connectors", "mempalace");
}

function getAuditFile(config: CognaiConfig): string {
  return resolve(getStateDir(config), "audit.json");
}

function getCoverageFile(config: CognaiConfig): string {
  return resolve(getStateDir(config), "coverage.json");
}

function getInventoryFile(config: CognaiConfig): string {
  return resolve(getStateDir(config), "inventory.ndjson");
}

function getCursorFile(config: CognaiConfig): string {
  return resolve(getStateDir(config), "cursor.json");
}

export async function ensureMemPalaceStateDir(config: CognaiConfig): Promise<void> {
  await ensureDir(getStateDir(config));
}

export async function loadMemPalaceAudit(
  config: CognaiConfig
): Promise<MemPalaceAuditFile> {
  return readJsonFile<MemPalaceAuditFile>(getAuditFile(config), {
    latest: null,
    previous: null
  });
}

export async function saveMemPalaceAudit(
  config: CognaiConfig,
  audit: MemPalaceAuditFile
): Promise<void> {
  await ensureMemPalaceStateDir(config);
  await writeJsonFile(getAuditFile(config), audit);
}

export async function loadMemPalaceCoverage(
  config: CognaiConfig
): Promise<MemPalaceCoverageSummary> {
  return readJsonFile<MemPalaceCoverageSummary>(getCoverageFile(config), {
    total_wings: 0,
    total_rooms: 0,
    total_drawers: 0,
    inventoried_drawers: 0,
    semantically_synced_drawers: 0,
    pending_drawers: 0,
    changed_drawers: 0,
    deleted_drawers: 0,
    ignored_wings: [],
    ignored_rooms: [],
    selected_wings: [],
    selected_rooms: [],
    last_audit_at: null,
    last_inventory_at: null,
    last_backfill_at: null,
    coverage_status: "unknown"
  });
}

export async function saveMemPalaceCoverage(
  config: CognaiConfig,
  coverage: MemPalaceCoverageSummary
): Promise<void> {
  await ensureMemPalaceStateDir(config);
  await writeJsonFile(getCoverageFile(config), coverage);
}

export async function loadMemPalaceCursor(
  config: CognaiConfig
): Promise<MemPalaceCursorState> {
  return readJsonFile<MemPalaceCursorState>(getCursorFile(config), {
    inventory: {},
    backfill_after_drawer_id: null
  });
}

export async function saveMemPalaceCursor(
  config: CognaiConfig,
  cursor: MemPalaceCursorState
): Promise<void> {
  await ensureMemPalaceStateDir(config);
  await writeJsonFile(getCursorFile(config), cursor);
}

export async function loadMemPalaceInventory(
  config: CognaiConfig
): Promise<MemPalaceInventoryRow[]> {
  const raw = await readTextFile(getInventoryFile(config), "");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemPalaceInventoryRow);
}

export async function saveMemPalaceInventory(
  config: CognaiConfig,
  rows: MemPalaceInventoryRow[]
): Promise<void> {
  await ensureMemPalaceStateDir(config);
  const content = rows
    .map((row) => JSON.stringify(row))
    .join("\n");
  await writeTextFile(getInventoryFile(config), content ? `${content}\n` : "");
}
