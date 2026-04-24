import { URL } from "node:url";

import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";
import { CognaiError } from "../shared/errors.js";
import type { ConnectorPullResult, LiveConnector } from "./types.js";

function toQueryString(config: CognaiConfig): string {
  const url = new URL(config.connectors.mem0.memoryPath, config.connectors.mem0.baseUrl);
  url.searchParams.set("page_size", String(config.connectors.mem0.pageSize));

  if (config.connectors.mem0.userId.trim().length > 0) {
    url.searchParams.set("user_id", config.connectors.mem0.userId);
  }

  return url.toString();
}

function extractMemories(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as Record<string, unknown>;
  const memories =
    candidate.memories ??
    candidate.results ??
    candidate.data ??
    candidate.items;

  return Array.isArray(memories)
    ? (memories as Array<Record<string, unknown>>)
    : [];
}

export class Mem0Connector implements LiveConnector {
  readonly name = "mem0" as const;

  validate(config: CognaiConfig): string[] {
    const issues: string[] = [];

    if (!config.connectors.mem0.baseUrl.startsWith("http")) {
      issues.push("Mem0 baseUrl must be an http(s) URL.");
    }

    if (!config.connectors.mem0.memoryPath.startsWith("/")) {
      issues.push("Mem0 memoryPath must start with '/'.");
    }

    return issues;
  }

  async pull(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorPullResult> {
    const apiKey = process.env[config.connectors.mem0.apiKeyEnvVar];
    if (!apiKey) {
      throw new CognaiError(
        `Mem0 connector is enabled but ${config.connectors.mem0.apiKeyEnvVar} is not set.`
      );
    }

    const response = await fetch(toQueryString(config), {
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new CognaiError(
        `Mem0 connector request failed with ${response.status} ${response.statusText}.`
      );
    }

    const payload = (await response.json()) as unknown;
    const memories = extractMemories(payload);
    const sourceIds = memories
      .map((memory) => String(memory.id ?? memory.memory_id ?? memory.uuid ?? ""))
      .filter((id) => id.length > 0);

    return {
      source: this.name,
      payload,
      sourceIds,
      rangeSummary: state.lastSyncAt
        ? `incremental pull since ${state.lastSyncAt}`
        : "initial pull",
      metadata: {
        fetched_count: memories.length
      }
    };
  }
}
