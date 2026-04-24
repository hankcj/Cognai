export interface MemPalaceAuditSnapshot {
  revision: string;
  captured_at: string;
  status: Record<string, unknown>;
  taxonomy: Record<string, unknown>;
  total_wings: number;
  total_rooms: number;
  total_drawers: number;
}

export interface MemPalaceAuditFile {
  latest: MemPalaceAuditSnapshot | null;
  previous: MemPalaceAuditSnapshot | null;
}

export type MemPalaceInventoryStatus =
  | "inventoried"
  | "deleted"
  | "missing"
  | "error";

export type MemPalaceSemanticStatus =
  | "pending"
  | "synced"
  | "stale"
  | "ignored"
  | "error";

export interface MemPalaceInventoryRow {
  drawer_id: string;
  wing: string;
  room: string;
  source_file: string | null;
  drawer_hash: string | null;
  first_seen_audit_revision: string;
  last_seen_audit_revision: string;
  inventory_status: MemPalaceInventoryStatus;
  semantic_status: MemPalaceSemanticStatus;
  last_ingested_hash: string | null;
  last_ingested_at: string | null;
  last_error: string | null;
}

export interface MemPalaceCoverageSummary {
  total_wings: number;
  total_rooms: number;
  total_drawers: number;
  inventoried_drawers: number;
  semantically_synced_drawers: number;
  pending_drawers: number;
  changed_drawers: number;
  deleted_drawers: number;
  ignored_wings: string[];
  ignored_rooms: string[];
  selected_wings: string[];
  selected_rooms: string[];
  last_audit_at: string | null;
  last_inventory_at: string | null;
  last_backfill_at: string | null;
  coverage_status: "full" | "partial" | "unknown";
}

/** Stored in `inventory` when a wing/room scope is fully listed (skip on next runs). */
export const MEMPALACE_INVENTORY_SCOPE_EOF = "__eof__";

export interface MemPalaceCursorState {
  inventory: Record<string, string | null>;
  backfill_after_drawer_id: string | null;
  /** When this differs from the latest audit revision, inventory cursors are reset. */
  inventoryAuditRevision?: string | null;
}

export interface MemPalaceDrawerReference {
  drawer_id: string;
  wing: string;
  room: string;
  source_file: string | null;
  drawer_hash: string | null;
}

export interface MemPalaceDrawerRecord extends MemPalaceDrawerReference {
  text: string;
  metadata: Record<string, unknown>;
}

export interface MemPalaceListDrawersResult {
  drawers: MemPalaceDrawerReference[];
  nextCursor: string | null;
}

export interface MemPalaceSyncResult {
  sourceIds: string[];
  rangeSummary: string;
  changedDrawerIds: string[];
  deletedDrawerIds: string[];
  episodesPrepared: number;
  warnings: string[];
}
