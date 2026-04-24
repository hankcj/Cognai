import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { CognaiConfig } from "../config/schema.js";
import { CognaiError } from "../shared/errors.js";
import type {
  MemPalaceDrawerRecord,
  MemPalaceDrawerReference,
  MemPalaceListDrawersResult
} from "./types.js";

const execFileAsync = promisify(execFile);

const REQUIRED_TOOLS = [
  "mempalace_status",
  "mempalace_get_taxonomy",
  "mempalace_list_drawers",
  "mempalace_get_drawer",
  "mempalace_search"
] as const;

/** MemPalace MCP caps `limit` at 100 for list_drawers. */
const MEMPALACE_LIST_MAX = 100;

function parseOffsetCursor(cursor: string | null | undefined): number {
  if (cursor == null || cursor === "") {
    return 0;
  }
  if (/^\d+$/.test(cursor)) {
    return Number.parseInt(cursor, 10);
  }
  return 0;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeToolPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const root = result as Record<string, unknown>;
  if (root.structuredContent !== undefined) {
    return root.structuredContent;
  }

  const content = Array.isArray(root.content)
    ? (root.content as Array<Record<string, unknown>>)
    : [];
  const textChunk = content.find((item) => item.type === "text");
  if (typeof textChunk?.text === "string") {
    return tryParseJson(textChunk.text);
  }

  return result;
}

function normalizeDrawerReference(
  value: Record<string, unknown>
): MemPalaceDrawerReference {
  return {
    drawer_id: String(value.drawer_id ?? value.id ?? ""),
    wing: String(value.wing ?? value.wing_name ?? "unknown"),
    room: String(value.room ?? value.room_name ?? "unknown"),
    source_file:
      typeof value.source_file === "string"
        ? value.source_file
        : typeof value.file_path === "string"
          ? value.file_path
          : null,
    drawer_hash:
      typeof value.drawer_hash === "string"
        ? value.drawer_hash
        : typeof value.hash === "string"
          ? value.hash
          : null
  };
}

function normalizeDrawerList(payload: unknown): MemPalaceListDrawersResult {
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const arrayPayload = Array.isArray(payload)
    ? (payload as Array<Record<string, unknown>>)
    : [];
  const drawers = (
    arrayPayload.length > 0
      ? arrayPayload
      : Array.isArray(root.drawers)
        ? (root.drawers as Array<Record<string, unknown>>)
        : Array.isArray(root.items)
          ? (root.items as Array<Record<string, unknown>>)
          : Array.isArray(root.results)
            ? (root.results as Array<Record<string, unknown>>)
            : []
  )
    .map((entry) => normalizeDrawerReference(entry))
    .filter((entry) => entry.drawer_id.trim().length > 0);

  const nextCursor =
    typeof root.next_cursor === "string"
      ? root.next_cursor
      : typeof root.nextCursor === "string"
        ? root.nextCursor
        : null;

  return {
    drawers,
    nextCursor
  };
}

function normalizeDrawer(payload: unknown): MemPalaceDrawerRecord {
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const reference = normalizeDrawerReference(root);
  const text =
    typeof root.text === "string"
      ? root.text
      : typeof root.content === "string"
        ? root.content
        : typeof root.body === "string"
          ? root.body
          : "";

  return {
    ...reference,
    text,
    metadata: root
  };
}

function deriveServerArgs(config: CognaiConfig): { command: string; args: string[] } {
  const { command, args, palacePath } = config.connectors.mempalace;
  const effectiveArgs = [...args];

  if (!effectiveArgs.includes("mcp")) {
    effectiveArgs.push("mcp");
  }
  if (!effectiveArgs.includes("--palace")) {
    effectiveArgs.push("--palace", palacePath);
  }

  return {
    command,
    args: effectiveArgs
  };
}

function parseCommandFromText(value: string): { command: string; args: string[] } | null {
  const trimmed = value.trim();
  const parsed = tryParseJson(trimmed);

  if (parsed && typeof parsed === "object") {
    const root = parsed as Record<string, unknown>;
    if (typeof root.command === "string") {
      return {
        command: root.command,
        args: Array.isArray(root.args) ? root.args.map(String) : []
      };
    }
  }

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) => line.includes("mempalace") || line.includes("python"));
  if (!candidate) {
    return null;
  }

  const tokens = candidate.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((token) =>
    token.replace(/^"|"$/g, "")
  );
  if (!tokens || tokens.length === 0) {
    return null;
  }

  return {
    command: tokens[0]!,
    args: tokens.slice(1)
  };
}

async function discoverServerCommand(
  config: CognaiConfig
): Promise<{ command: string; args: string[] }> {
  const explicit = deriveServerArgs(config);
  if (explicit.command.trim().length > 0) {
    return explicit;
  }

  try {
    const discovered = await execFileAsync(
      "mempalace",
      ["mcp", "--palace", config.connectors.mempalace.palacePath],
      {
        cwd: config.connectors.mempalace.workingDirectory || process.cwd(),
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024
      }
    );
    const parsed = parseCommandFromText(discovered.stdout);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to python module fallback.
  }

  return {
    command: "python3",
    args: [
      "-m",
      "mempalace.mcp_server",
      "--palace",
      config.connectors.mempalace.palacePath
    ]
  };
}

export class MemPalaceMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private toolNames: string[] = [];

  constructor(private readonly config: CognaiConfig) {}

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const server = await discoverServerCommand(this.config);
    this.client = new Client(
      { name: "cognai-mempalace-client", version: "0.2.0" },
      { capabilities: {} }
    );
    this.transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: this.config.connectors.mempalace.workingDirectory || process.cwd(),
      stderr: "pipe"
    });
    await this.client.connect(this.transport);
    const tools = await this.client.listTools();
    this.toolNames = tools.tools.map((tool) => tool.name);
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
    this.client = null;
    this.toolNames = [];
  }

  getAvailableToolNames(): string[] {
    return [...this.toolNames];
  }

  async assertRequiredTools(): Promise<void> {
    const missing = REQUIRED_TOOLS.filter((tool) => !this.toolNames.includes(tool));
    if (missing.length > 0) {
      throw new CognaiError(
        `MemPalace MCP server is missing required tools: ${missing.join(", ")}.`
      );
    }
  }

  async status(): Promise<Record<string, unknown>> {
    return this.callJsonTool("mempalace_status");
  }

  async getTaxonomy(): Promise<Record<string, unknown>> {
    return this.callJsonTool("mempalace_get_taxonomy");
  }

  async listDrawers(input: {
    wing?: string;
    room?: string;
    cursor?: string | null;
    limit?: number;
  } = {}): Promise<MemPalaceListDrawersResult> {
    const requestedLimit = input.limit ?? this.config.connectors.mempalace.pageSize;
    const limit = Math.min(Math.max(1, requestedLimit), MEMPALACE_LIST_MAX);
    const offset = parseOffsetCursor(input.cursor ?? null);

    const args: Record<string, unknown> = {
      limit,
      offset
    };
    if (input.wing) {
      args.wing = input.wing;
    }
    if (input.room) {
      args.room = input.room;
    }
    const palacePath = this.config.connectors.mempalace.palacePath;
    if (palacePath) {
      args.palace = palacePath;
    }

    const payload = await this.callJsonTool("mempalace_list_drawers", args);
    const parsed = normalizeDrawerList(payload);
    const nextCursor =
      parsed.nextCursor ??
      (parsed.drawers.length > 0 && parsed.drawers.length === limit
        ? String(offset + limit)
        : null);

    return { drawers: parsed.drawers, nextCursor };
  }

  async getDrawer(drawerId: string): Promise<MemPalaceDrawerRecord> {
    const payload = await this.callJsonTool("mempalace_get_drawer", {
      drawer_id: drawerId,
      id: drawerId
    });
    return normalizeDrawer(payload);
  }

  async search(query: string, limit: number): Promise<Record<string, unknown>> {
    return this.callJsonTool("mempalace_search", {
      query,
      limit
    });
  }

  private async callJsonTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new CognaiError("MemPalace MCP client is not connected.");
    }

    const result = await this.client.callTool({
      name,
      arguments: args
    });
    const payload = normalizeToolPayload(result);

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }

    if (Array.isArray(payload)) {
      return { items: payload };
    }

    return { value: payload };
  }
}
