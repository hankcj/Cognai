import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";
import { CognaiError } from "../shared/errors.js";
import type { ConnectorPullResult, LiveConnector } from "./types.js";

const execFileAsync = promisify(execFile);

function extractIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const conversation = root.conversation as Record<string, unknown> | undefined;
  const memories = Array.isArray(root.memories)
    ? (root.memories as Array<Record<string, unknown>>)
    : [];
  const messages = Array.isArray(conversation?.messages)
    ? (conversation.messages as Array<Record<string, unknown>>)
    : [];

  return [
    ...messages.map((message) => String(message.id ?? "")).filter(Boolean),
    ...memories.map((memory) => String(memory.id ?? memory.memory_id ?? "")).filter(Boolean)
  ];
}

export class MemPalaceConnector implements LiveConnector {
  readonly name = "mempalace" as const;

  validate(config: CognaiConfig): string[] {
    const issues: string[] = [];

    if (!config.connectors.mempalace.command.trim()) {
      issues.push("MemPalace command must be configured.");
    }

    return issues;
  }

  async pull(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorPullResult> {
    const result = await execFileAsync(
      config.connectors.mempalace.command,
      config.connectors.mempalace.args,
      {
        cwd: config.connectors.mempalace.workingDirectory || process.cwd(),
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024
      }
    ).catch((error) => {
      throw new CognaiError(
        `MemPalace connector failed to execute "${config.connectors.mempalace.command}": ${
          error instanceof Error ? error.message : "Unknown error."
        }`
      );
    });

    const stdout = result.stdout.trim();
    if (!stdout) {
      throw new CognaiError("MemPalace connector returned empty stdout.");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(stdout) as unknown;
    } catch (error) {
      throw new CognaiError(
        `MemPalace connector returned invalid JSON: ${
          error instanceof Error ? error.message : "Unknown parse error."
        }`
      );
    }

    const sourceIds = extractIds(payload);

    return {
      source: this.name,
      payload,
      sourceIds,
      rangeSummary: state.lastSyncAt
        ? `incremental pull since ${state.lastSyncAt}`
        : "initial pull",
      metadata: {
        fetched_count: sourceIds.length
      }
    };
  }
}
