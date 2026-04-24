import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";
import { CognaiError } from "../shared/errors.js";
import { MemPalaceMcpClient } from "../mempalace/mcp-client.js";
import type {
  ConnectorHealth,
  ConnectorPullResult,
  LiveConnector
} from "./types.js";

export class MemPalaceConnector implements LiveConnector {
  readonly name = "mempalace" as const;

  constructor(
    private readonly clientFactory: (config: CognaiConfig) => MemPalaceMcpClient = (
      config
    ) => new MemPalaceMcpClient(config)
  ) {}

  validate(config: CognaiConfig): string[] {
    const issues: string[] = [];

    if (!config.connectors.mempalace.command.trim()) {
      issues.push("MemPalace command must be configured.");
    }

    if (!config.connectors.mempalace.palacePath.trim()) {
      issues.push("MemPalace palacePath must be configured.");
    }

    return issues;
  }

  async checkHealth(
    config: CognaiConfig,
    _state: ConnectorSyncState
  ): Promise<ConnectorHealth> {
    const client = this.clientFactory(config);

    try {
      await client.connect();
      await client.assertRequiredTools();
      return {
        status: "ok",
        detail: `Required tools available: ${client.getAvailableToolNames().join(", ")}`
      };
    } catch (error) {
      return {
        status: "warning",
        detail: error instanceof Error ? error.message : "MemPalace MCP health check failed."
      };
    } finally {
      await client.close();
    }
  }

  async pull(): Promise<ConnectorPullResult> {
    throw new CognaiError(
      'MemPalace sync now runs through "cognai sync --connector mempalace" using audit, inventory, and semantic backfill state instead of a generic connector pull.'
    );
  }
}
