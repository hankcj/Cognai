import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";

export type ConnectorName = "mem0" | "mempalace" | "obsidian";

export interface ConnectorPullResult {
  source: ConnectorName;
  payload: unknown;
  sourceIds: string[];
  rangeSummary: string;
  metadata: Record<string, unknown>;
}

export interface ConnectorHealth {
  status: "ok" | "warning" | "error";
  detail: string;
}

export interface LiveConnector {
  readonly name: ConnectorName;
  validate(config: CognaiConfig): string[];
  checkHealth?(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorHealth>;
  pull(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorPullResult>;
}
