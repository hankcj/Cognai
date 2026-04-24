import { randomUUID } from "node:crypto";

import type { CognaiConfig, CognaiState } from "../config/schema.js";
import type { CanonicalConversationEnvelope } from "../importers/canonical.js";
import type { StorageAdapter } from "../storage/types.js";
import { CognaiError } from "../shared/errors.js";
import { MemPalaceMcpClient } from "./mcp-client.js";
import {
  ensureMemPalaceStateDir,
  loadMemPalaceAudit,
  loadMemPalaceCoverage,
  loadMemPalaceCursor,
  loadMemPalaceInventory,
  saveMemPalaceAudit,
  saveMemPalaceCoverage,
  saveMemPalaceCursor,
  saveMemPalaceInventory
} from "./state.js";
import type {
  MemPalaceAuditSnapshot,
  MemPalaceCoverageSummary,
  MemPalaceDrawerRecord,
  MemPalaceInventoryRow,
  MemPalaceSyncResult
} from "./types.js";

interface NormalizedWing {
  name: string;
  rooms: string[];
  drawerCount: number;
}

export interface MemPalaceBackfillResult extends MemPalaceSyncResult {
  envelope: CanonicalConversationEnvelope;
  coverage: MemPalaceCoverageSummary;
}

function arrayifyStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeWings(taxonomy: Record<string, unknown>): NormalizedWing[] {
  const wingsValue = taxonomy.wings;
  const wingEntries: Array<Record<string, unknown>> = [];

  if (Array.isArray(wingsValue)) {
    wingEntries.push(
      ...(wingsValue as Array<Record<string, unknown>>).map((entry) => ({
        ...entry,
        name: String(entry.name ?? entry.id ?? entry.wing ?? "unknown")
      }))
    );
  } else if (wingsValue && typeof wingsValue === "object") {
    for (const [name, rawValue] of Object.entries(wingsValue as Record<string, unknown>)) {
      const value =
        rawValue && typeof rawValue === "object"
          ? (rawValue as Record<string, unknown>)
          : {};
      wingEntries.push({
        ...value,
        name
      });
    }
  }

  if (wingEntries.length === 0 && Array.isArray(taxonomy.rooms)) {
    wingEntries.push({
      name: "default",
      rooms: taxonomy.rooms
    });
  }

  return wingEntries.map((wing) => {
    const roomsValue = wing.rooms;
    const rooms = Array.isArray(roomsValue)
      ? roomsValue.map((room) =>
          typeof room === "string"
            ? room
            : String(
                (room as Record<string, unknown>).name ??
                  (room as Record<string, unknown>).id ??
                  "unknown"
              )
        )
      : roomsValue && typeof roomsValue === "object"
        ? Object.keys(roomsValue as Record<string, unknown>)
        : [];

    const roomArray = Array.isArray(roomsValue)
      ? (roomsValue as Array<Record<string, unknown>>)
      : [];
    const roomCountFromObjects = roomArray.reduce((sum, room) => {
      const explicit =
        typeof room.drawer_count === "number"
          ? room.drawer_count
          : typeof room.drawers_count === "number"
            ? room.drawers_count
            : 0;
      return sum + explicit;
    }, 0);
    const drawerCount =
      typeof wing.drawer_count === "number"
        ? wing.drawer_count
        : typeof wing.drawers_count === "number"
          ? wing.drawers_count
          : roomCountFromObjects;

    return {
      name: String(wing.name ?? "unknown"),
      rooms,
      drawerCount
    };
  });
}

function summarizeTaxonomy(taxonomy: Record<string, unknown>): {
  total_wings: number;
  total_rooms: number;
  total_drawers: number;
  wings: NormalizedWing[];
} {
  const wings = normalizeWings(taxonomy);
  const totalWings = wings.length;
  const totalRooms = wings.reduce((sum, wing) => sum + wing.rooms.length, 0);
  const explicitTotal =
    typeof taxonomy.total_drawers === "number"
      ? taxonomy.total_drawers
      : typeof taxonomy.drawer_count === "number"
        ? taxonomy.drawer_count
        : wings.reduce((sum, wing) => sum + wing.drawerCount, 0);

  return {
    total_wings: totalWings,
    total_rooms: totalRooms,
    total_drawers: explicitTotal,
    wings
  };
}

function shouldIgnoreRow(
  config: CognaiConfig,
  row: Pick<MemPalaceInventoryRow, "wing" | "room">
): boolean {
  const connector = config.connectors.mempalace;
  if (connector.excludeWings.includes(row.wing)) {
    return true;
  }
  if (connector.excludeRooms.includes(`${row.wing}/${row.room}`) || connector.excludeRooms.includes(row.room)) {
    return true;
  }
  if (connector.backfillScope === "audit_only") {
    return true;
  }
  if (connector.backfillScope === "selected") {
    const wingSelected =
      connector.includeWings.length === 0 || connector.includeWings.includes(row.wing);
    const roomSelected =
      connector.includeRooms.length === 0 ||
      connector.includeRooms.includes(`${row.wing}/${row.room}`) ||
      connector.includeRooms.includes(row.room);
    return !(wingSelected && roomSelected);
  }

  return false;
}

function computeCoverageStatus(
  audit: MemPalaceAuditSnapshot | null,
  inventoryRows: MemPalaceInventoryRow[],
  coverage: Omit<MemPalaceCoverageSummary, "coverage_status">
): "full" | "partial" | "unknown" {
  if (!audit) {
    return "unknown";
  }
  if (coverage.inventoried_drawers === 0 && coverage.total_drawers === 0) {
    return "unknown";
  }
  if (coverage.inventoried_drawers < coverage.total_drawers) {
    return "partial";
  }
  const selectedRows = inventoryRows.filter(
    (row) => row.inventory_status === "inventoried" && row.semantic_status !== "ignored"
  );
  if (selectedRows.some((row) => row.semantic_status !== "synced")) {
    return "partial";
  }
  return "full";
}

async function markDrawerNodes(
  storage: StorageAdapter,
  drawerId: string,
  flag: "stale" | "needs_review",
  metadataPatch: Record<string, unknown>
): Promise<void> {
  const episodes = await storage.listEpisodes();
  const matchingEpisodes = episodes.filter(
    (episode) => episode.metadata.external_system === "mempalace" &&
      episode.metadata.drawer_id === drawerId
  );

  for (const episode of matchingEpisodes) {
    for (const nodeId of episode.inferred_node_ids) {
      await storage.flagNode(nodeId, flag);
      const node = await storage.getNode(nodeId);
      if (node) {
        await storage.updateNode(nodeId, {
          metadata: {
            ...node.metadata,
            ...metadataPatch
          }
        });
      }
    }

    await storage.writeEpisode({
      ...episode,
      metadata: {
        ...episode.metadata,
        ...metadataPatch
      }
    });
  }
}

function toCanonicalMemoryEntry(
  config: CognaiConfig,
  drawer: MemPalaceDrawerRecord,
  auditRevision: string,
  ingestMode:
    | "inventory_backfill"
    | "bootstrap_wakeup"
    | "bootstrap_search"
    | "runtime_evidence"
) {
  return {
    id: drawer.drawer_id,
    content: drawer.text,
    created_at:
      typeof drawer.metadata.updated_at === "string"
        ? drawer.metadata.updated_at
        : typeof drawer.metadata.created_at === "string"
          ? drawer.metadata.created_at
          : new Date().toISOString(),
    metadata: {
      ...drawer.metadata,
      source_id: drawer.drawer_id,
      source_adapter: "mempalace",
      external_system: "mempalace",
      palace_path: config.connectors.mempalace.palacePath,
      wing: drawer.wing,
      room: drawer.room,
      drawer_id: drawer.drawer_id,
      source_file: drawer.source_file,
      ingest_mode: ingestMode,
      audit_revision: auditRevision,
      drawer_hash: drawer.drawer_hash
    }
  };
}

export class MemPalaceService {
  constructor(
    private readonly config: CognaiConfig,
    private readonly storage: StorageAdapter,
    private readonly client = new MemPalaceMcpClient(config)
  ) {}

  async audit(): Promise<MemPalaceAuditSnapshot> {
    await ensureMemPalaceStateDir(this.config);
    await this.client.connect();
    await this.client.assertRequiredTools();

    const status = await this.client.status();
    const taxonomy = await this.client.getTaxonomy();
    const summary = summarizeTaxonomy(taxonomy);
    const snapshot: MemPalaceAuditSnapshot = {
      revision: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      status,
      taxonomy,
      total_wings: summary.total_wings,
      total_rooms: summary.total_rooms,
      total_drawers: summary.total_drawers
    };
    const audit = await loadMemPalaceAudit(this.config);
    await saveMemPalaceAudit(this.config, {
      previous: audit.latest,
      latest: snapshot
    });

    const existingCoverage = await loadMemPalaceCoverage(this.config);
    await saveMemPalaceCoverage(this.config, {
      ...existingCoverage,
      total_wings: snapshot.total_wings,
      total_rooms: snapshot.total_rooms,
      total_drawers: snapshot.total_drawers,
      last_audit_at: snapshot.captured_at,
      coverage_status: existingCoverage.coverage_status === "unknown"
        ? "partial"
        : existingCoverage.coverage_status
    });

    return snapshot;
  }

  async inventory(): Promise<MemPalaceCoverageSummary> {
    const audit = (await loadMemPalaceAudit(this.config)).latest ?? (await this.audit());
    const taxonomySummary = summarizeTaxonomy(audit.taxonomy);
    const inventory = await loadMemPalaceInventory(this.config);
    const cursor = await loadMemPalaceCursor(this.config);
    const byId = new Map(inventory.map((row) => [row.drawer_id, row]));
    const seenThisRun = new Set<string>();
    let scanned = 0;

    await this.client.connect();
    await this.client.assertRequiredTools();

    const scopes =
      taxonomySummary.wings.length > 0
        ? taxonomySummary.wings.flatMap((wing) =>
            wing.rooms.length > 0
              ? wing.rooms.map((room) => ({ wing: wing.name, room }))
              : [{ wing: wing.name, room: "" }]
          )
        : [{ wing: "", room: "" }];

    for (const scope of scopes) {
      const scopeKey = `${scope.wing}::${scope.room}`;
      let cursorValue = cursor.inventory[scopeKey] ?? null;

      while (scanned < this.config.connectors.mempalace.maxInventoryDrawersPerRun) {
        const page = await this.client.listDrawers({
          wing: scope.wing || undefined,
          room: scope.room || undefined,
          cursor: cursorValue,
          limit: this.config.connectors.mempalace.pageSize
        });
        scanned += page.drawers.length;

        for (const drawer of page.drawers) {
          seenThisRun.add(drawer.drawer_id);
          const existing = byId.get(drawer.drawer_id);
          const row: MemPalaceInventoryRow = {
            drawer_id: drawer.drawer_id,
            wing: drawer.wing,
            room: drawer.room,
            source_file: drawer.source_file,
            drawer_hash: drawer.drawer_hash,
            first_seen_audit_revision:
              existing?.first_seen_audit_revision ?? audit.revision,
            last_seen_audit_revision: audit.revision,
            inventory_status: "inventoried",
            semantic_status: shouldIgnoreRow(this.config, {
              wing: drawer.wing,
              room: drawer.room
            })
              ? "ignored"
              : existing && existing.last_ingested_hash && existing.last_ingested_hash === drawer.drawer_hash
                ? existing.semantic_status
                : existing && existing.last_ingested_hash && existing.last_ingested_hash !== drawer.drawer_hash
                  ? "stale"
                  : existing?.semantic_status ?? "pending",
            last_ingested_hash: existing?.last_ingested_hash ?? null,
            last_ingested_at: existing?.last_ingested_at ?? null,
            last_error: null
          };
          byId.set(row.drawer_id, row);
        }

        cursorValue = page.nextCursor;
        cursor.inventory[scopeKey] = cursorValue;
        if (!cursorValue || page.drawers.length === 0) {
          break;
        }
      }
    }

    for (const row of byId.values()) {
      if (row.last_seen_audit_revision !== audit.revision) {
        row.inventory_status = "deleted";
        if (row.semantic_status === "synced") {
          row.semantic_status = "stale";
        }
      }
    }

    const rows = [...byId.values()].sort((left, right) =>
      left.drawer_id.localeCompare(right.drawer_id)
    );
    await saveMemPalaceInventory(this.config, rows);
    await saveMemPalaceCursor(this.config, cursor);

    const baseCoverage: Omit<MemPalaceCoverageSummary, "coverage_status"> = {
      total_wings: audit.total_wings,
      total_rooms: audit.total_rooms,
      total_drawers: Math.max(
        audit.total_drawers,
        rows.filter((row) => row.inventory_status === "inventoried").length
      ),
      inventoried_drawers: rows.filter((row) => row.inventory_status === "inventoried").length,
      semantically_synced_drawers: rows.filter((row) => row.semantic_status === "synced").length,
      pending_drawers: rows.filter((row) => row.semantic_status === "pending").length,
      changed_drawers: rows.filter((row) => row.semantic_status === "stale").length,
      deleted_drawers: rows.filter((row) => row.inventory_status === "deleted").length,
      ignored_wings: [...this.config.connectors.mempalace.excludeWings],
      ignored_rooms: [...this.config.connectors.mempalace.excludeRooms],
      selected_wings: [...this.config.connectors.mempalace.includeWings],
      selected_rooms: [...this.config.connectors.mempalace.includeRooms],
      last_audit_at: audit.captured_at,
      last_inventory_at: new Date().toISOString(),
      last_backfill_at: (await loadMemPalaceCoverage(this.config)).last_backfill_at
    };
    const coverage: MemPalaceCoverageSummary = {
      ...baseCoverage,
      coverage_status: computeCoverageStatus(audit, rows, baseCoverage)
    };
    await saveMemPalaceCoverage(this.config, coverage);
    return coverage;
  }

  async backfill(changedOnly = false): Promise<MemPalaceBackfillResult> {
    const audit = (await loadMemPalaceAudit(this.config)).latest ?? (await this.audit());
    const coverageBefore = await this.inventory();
    const rows = await loadMemPalaceInventory(this.config);
    const warnings: string[] = [];
    const changedRows = rows.filter((row) => row.inventory_status === "deleted");

    for (const row of changedRows) {
      await markDrawerNodes(this.storage, row.drawer_id, "stale", {
        stale_in_mempalace: true,
        stale_reason: "drawer_deleted",
        deleted_drawer_id: row.drawer_id
      });
    }

    const candidates = rows
      .filter((row) => row.inventory_status === "inventoried")
      .filter((row) => row.semantic_status !== "ignored")
      .filter((row) =>
        changedOnly
          ? row.semantic_status === "pending" || row.semantic_status === "stale"
          : row.semantic_status !== "synced"
      )
      .slice(0, this.config.connectors.mempalace.maxSemanticDrawersPerRun);

    const memoryEntries = [];
    const changedDrawerIds: string[] = [];
    const sourceIds: string[] = [];

    for (const row of candidates) {
      const drawer = await this.client.getDrawer(row.drawer_id);
      if (!drawer.text.trim()) {
        row.semantic_status = "error";
        row.last_error = "Drawer text was empty.";
        continue;
      }

      if (row.semantic_status === "stale") {
        changedDrawerIds.push(row.drawer_id);
        await markDrawerNodes(this.storage, row.drawer_id, "needs_review", {
          needs_review_due_to_drawer_change: true,
          changed_drawer_id: row.drawer_id
        });
      }

      memoryEntries.push(
        toCanonicalMemoryEntry(this.config, drawer, audit.revision, "inventory_backfill")
      );
      sourceIds.push(drawer.drawer_id);
      row.semantic_status = "synced";
      row.last_ingested_hash = drawer.drawer_hash;
      row.last_ingested_at = new Date().toISOString();
      row.last_error = null;
    }

    if (candidates.length === 0 && this.config.connectors.mempalace.bootstrapMode !== "none") {
      warnings.push(
        `No pending drawers were available, so bootstrap mode "${this.config.connectors.mempalace.bootstrapMode}" would be the only source of fresh context.`
      );
    }

    await saveMemPalaceInventory(this.config, rows);
    const coverageBase = await loadMemPalaceCoverage(this.config);
    const nextCoverage: MemPalaceCoverageSummary = {
      ...coverageBase,
      semantically_synced_drawers: rows.filter((row) => row.semantic_status === "synced").length,
      pending_drawers: rows.filter((row) => row.semantic_status === "pending").length,
      changed_drawers: rows.filter((row) => row.semantic_status === "stale").length,
      deleted_drawers: rows.filter((row) => row.inventory_status === "deleted").length,
      last_backfill_at: new Date().toISOString()
    };
    nextCoverage.coverage_status = computeCoverageStatus(audit, rows, nextCoverage);
    await saveMemPalaceCoverage(this.config, nextCoverage);

    return {
      envelope: {
        source: "mempalace",
        conversation: {
          id: `mempalace-backfill-${randomUUID()}`,
          metadata: {
            palace_path: this.config.connectors.mempalace.palacePath,
            audit_revision: audit.revision,
            source: "mempalace_inventory_backfill"
          }
        },
        messages: [],
        memory_entries: memoryEntries,
        participants: [],
        metadata: {
          external_system: "mempalace"
        }
      },
      sourceIds,
      rangeSummary:
        sourceIds.length > 0
          ? `audit + inventory delta + semantic backfill (${sourceIds.length} drawer${sourceIds.length === 1 ? "" : "s"})`
          : "audit + inventory delta completed with no pending semantic backfill",
      changedDrawerIds,
      deletedDrawerIds: changedRows.map((row) => row.drawer_id),
      episodesPrepared: memoryEntries.length,
      warnings,
      coverage: nextCoverage
    };
  }

  async syncDelta(): Promise<MemPalaceBackfillResult> {
    await ensureMemPalaceStateDir(this.config);
    await this.client.connect();
    try {
      await this.audit();
      return await this.backfill(true);
    } finally {
      await this.client.close();
    }
  }

  async coverage(): Promise<MemPalaceCoverageSummary> {
    return loadMemPalaceCoverage(this.config);
  }

  async requiredToolNames(): Promise<string[]> {
    await this.client.connect();
    try {
      return this.client.getAvailableToolNames();
    } finally {
      await this.client.close();
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
