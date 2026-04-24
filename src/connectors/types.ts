import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";

export type ConnectorName = "mem0" | "mempalace";

export interface ConnectorPullResult {
  source: ConnectorName;
  payload: unknown;
  sourceIds: string[];
  rangeSummary: string;
  metadata: Record<string, unknown>;
}

export interface LiveConnector {
  readonly name: ConnectorName;
  validate(config: CognaiConfig): string[];
  pull(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorPullResult>;
}
