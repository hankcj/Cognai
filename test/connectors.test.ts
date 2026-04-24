import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultConfig } from "../src/config/defaults.js";
import { Mem0Connector } from "../src/connectors/mem0.js";
import { MemPalaceConnector } from "../src/connectors/mempalace.js";
import { ObsidianConnector } from "../src/connectors/obsidian.js";
import { MemPalaceService } from "../src/mempalace/service.js";
import { MemoryStorageAdapter } from "../src/storage/adapters/memory.js";

test("mem0 connector pulls JSON payloads and extracts source ids", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-mem0-"));
  const config = createDefaultConfig(cwd);
  const connector = new Mem0Connector();
  const server = createServer((_, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        memories: [{ id: "mem-1", memory: "user values craft" }]
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server.");
  }

  config.connectors.mem0.baseUrl = `http://127.0.0.1:${address.port}`;
  process.env[config.connectors.mem0.apiKeyEnvVar] = "test-token";

  const result = await connector.pull(config, {
    lastSyncAt: null,
    lastRunStatus: "never",
    lastError: null,
    seenSourceIds: [],
    lastAuditAt: null,
    lastInventoryAt: null,
    lastBackfillAt: null
  });

  assert.equal(result.source, "mem0");
  assert.deepEqual(result.sourceIds, ["mem-1"]);
  server.close();
});

test("mempalace connector health validates required MCP tools", async () => {
  const config = createDefaultConfig();
  const connector = new MemPalaceConnector(
    () =>
      ({
        connect: async () => {},
        assertRequiredTools: async () => {},
        getAvailableToolNames: () => [
          "mempalace_status",
          "mempalace_get_taxonomy",
          "mempalace_list_drawers",
          "mempalace_get_drawer",
          "mempalace_search"
        ],
        close: async () => {}
      }) as never
  );

  const health = await connector.checkHealth(config, {
    lastSyncAt: null,
    lastRunStatus: "never",
    lastError: null,
    seenSourceIds: [],
    lastAuditAt: null,
    lastInventoryAt: null,
    lastBackfillAt: null
  });

  assert.equal(health.status, "ok");
  assert.match(health.detail, /mempalace_status/);
});

test("mempalace service audits, inventories, and backfills drawer-based provenance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-mempalace-service-"));
  const config = createDefaultConfig(cwd);
  config.storage.adapter = "memory";
  config.connectors.mempalace.enabled = true;
  config.connectors.mempalace.backfillScope = "full";
  const storage = new MemoryStorageAdapter();
  await storage.init();

  const drawersByScope = new Map<string, Array<Record<string, unknown>>>([
    [
      "founder::product",
      [
        {
          drawer_id: "drawer-1",
          wing: "founder",
          room: "product",
          source_file: "/notes/product.md",
          drawer_hash: "hash-1"
        },
        {
          drawer_id: "drawer-2",
          wing: "founder",
          room: "product",
          source_file: "/notes/product.md",
          drawer_hash: "hash-2"
        }
      ]
    ],
    [
      "founder::ops",
      [
        {
          drawer_id: "drawer-3",
          wing: "founder",
          room: "ops",
          source_file: "/notes/ops.md",
          drawer_hash: "hash-3"
        }
      ]
    ],
    [
      "personal::journal",
      [
        {
          drawer_id: "drawer-4",
          wing: "personal",
          room: "journal",
          source_file: "/notes/journal.md",
          drawer_hash: "hash-4"
        }
      ]
    ]
  ]);

  const fakeClient = {
    connect: async () => {},
    assertRequiredTools: async () => {},
    status: async () => ({ status: "ok" }),
    getTaxonomy: async () => ({
      total_drawers: 4,
      wings: [
        {
          name: "founder",
          rooms: [
            { name: "product", drawer_count: 2 },
            { name: "ops", drawer_count: 1 }
          ]
        },
        {
          name: "personal",
          rooms: [{ name: "journal", drawer_count: 1 }]
        }
      ]
    }),
    listDrawers: async ({
      wing,
      room
    }: {
      wing?: string;
      room?: string;
    }) => ({
      drawers: drawersByScope.get(`${wing ?? ""}::${room ?? ""}`)?.map((entry) => ({
        drawer_id: String(entry.drawer_id),
        wing: String(entry.wing),
        room: String(entry.room),
        source_file: String(entry.source_file),
        drawer_hash: String(entry.drawer_hash)
      })) ?? [],
      nextCursor: null
    }),
    getDrawer: async (drawerId: string) => ({
      drawer_id: drawerId,
      wing: drawerId === "drawer-4" ? "personal" : "founder",
      room:
        drawerId === "drawer-3"
          ? "ops"
          : drawerId === "drawer-4"
            ? "journal"
            : "product",
      source_file:
        drawerId === "drawer-3"
          ? "/notes/ops.md"
          : drawerId === "drawer-4"
            ? "/notes/journal.md"
            : "/notes/product.md",
      drawer_hash: `hash-${drawerId.at(-1)}`,
      text: `Evidence from ${drawerId}`,
      metadata: {
        updated_at: "2026-04-24T12:00:00.000Z"
      }
    }),
    close: async () => {}
  };

  const service = new MemPalaceService(config, storage, fakeClient as never);
  const audit = await service.audit();
  assert.equal(audit.total_wings, 2);
  assert.equal(audit.total_rooms, 3);
  assert.equal(audit.total_drawers, 4);

  const inventory = await service.inventory();
  assert.equal(inventory.inventoried_drawers, 4);
  assert.equal(inventory.coverage_status, "partial");

  const backfill = await service.backfill(false);
  assert.equal(backfill.envelope.memory_entries.length, 4);
  assert.equal(backfill.coverage.semantically_synced_drawers, 4);
  assert.equal(backfill.coverage.coverage_status, "full");
});

test("obsidian connector reads markdown notes and preserves vault provenance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-obsidian-"));
  const vault = join(cwd, "Vault");
  await mkdir(join(vault, "Projects"), { recursive: true });
  await mkdir(join(vault, ".obsidian"), { recursive: true });
  await writeFile(
    join(vault, "Projects", "Founder.md"),
    `---\ntags: [founder, strategy]\n---\n# Founder\nI care about independence and calm sustainable work.\n`,
    "utf8"
  );
  await writeFile(join(vault, ".obsidian", "app.json"), "{}", "utf8");

  const config = createDefaultConfig(cwd);
  config.connectors.obsidian.enabled = true;
  config.connectors.obsidian.vaultPath = vault;
  const connector = new ObsidianConnector();
  const result = await connector.pull(config, {
    lastSyncAt: null,
    lastRunStatus: "never",
    lastError: null,
    seenSourceIds: [],
    lastAuditAt: null,
    lastInventoryAt: null,
    lastBackfillAt: null
  });

  assert.equal(result.source, "obsidian");
  assert.equal(result.sourceIds.length, 1);
  const payload = result.payload as {
    notes: Array<{ path: string; metadata: Record<string, unknown> }>;
  };
  assert.equal(payload.notes[0]?.path, "Projects/Founder.md");
  assert.equal(payload.notes[0]?.metadata.external_system, "obsidian");
});
