import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { createDefaultConfig } from "../src/config/defaults.js";
import { saveConfig, saveState } from "../src/config/loader.js";
import { createStorageAdapter } from "../src/storage/factory.js";

test("mcp query and update expose structured reasoning-layer outputs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-mcp-"));
  const config = createDefaultConfig(cwd);
  await saveConfig(config);
  await saveState(config, {
    connectors: {
      mem0: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: [],
        lastAuditAt: null,
        lastInventoryAt: null,
        lastBackfillAt: null
      },
      mempalace: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: [],
        lastAuditAt: null,
        lastInventoryAt: null,
        lastBackfillAt: null
      }
    }
  });

  const storage = createStorageAdapter(config);
  await storage.init();
  await storage.writeNode({
    id: "value-1",
    type: "Value",
    label: "Independence",
    description: "independence and creative ownership",
    embedding: [0.1, 0.2, 0.3],
    source: "stated",
    confidence: 0.9,
    activation: 0.8,
    centrality: 0.9,
    construal_level: "high",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    metadata: {}
  });
  await storage.close();

  const client = new Client(
    { name: "cognai-test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: "node",
    args: [
      "--import",
      "tsx",
      resolve(process.cwd(), "src/cli.ts"),
      "serve",
      "--config",
      config.paths.config
    ],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "cognai_query"));

  const query = await client.callTool({
    name: "cognai_query",
    arguments: {
      intent: "How should I decide what to build?"
    }
  });
  const queryResult = query.structuredContent as Record<string, unknown>;
  assert.ok(queryResult.memory_lookup_plan);
  assert.ok(queryResult.response_guidance);
  assert.ok(queryResult.model_ready_summary);
  assert.ok(
    ["generic", "mempalace"].includes(
      String((queryResult.memory_lookup_plan as Record<string, unknown>).memory_system)
    )
  );
  assert.equal(
    typeof (queryResult.model_ready_summary as Record<string, unknown>).prompt_context,
    "string"
  );

  const update = await client.callTool({
    name: "cognai_update",
    arguments: {
      user_message:
        "I want to build a small profitable software business without burning out.",
      assistant_response:
        "Favor calm, high-quality growth over fast chaotic scaling.",
      memory_evidence: [
        {
          source: "memory-test",
          summary: "Past projects went best when the user moved slowly and kept control.",
          memory_system: "mempalace",
          drawer_ids: ["drawer-1"],
          wing: "founder",
          room: "product",
          source_file: "/notes/product.md"
        }
      ],
      memory_writes: [
        {
          source: "memory-test",
          summary: "Stored the advice and supporting rationale.",
          status: "written"
        }
      ],
      interaction_outcome: "The user agreed this sounded right."
    }
  });
  const updateResult = update.structuredContent as Record<string, unknown>;
  assert.ok(typeof updateResult.nodes_written === "number");
  assert.ok(Array.isArray(updateResult.warnings));

  await transport.close();
});
