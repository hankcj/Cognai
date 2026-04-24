import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultConfig } from "../src/config/defaults.js";
import { Mem0Connector } from "../src/connectors/mem0.js";
import { MemPalaceConnector } from "../src/connectors/mempalace.js";

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
    seenSourceIds: []
  });

  assert.equal(result.source, "mem0");
  assert.deepEqual(result.sourceIds, ["mem-1"]);
  server.close();
});

test("mempalace connector executes a local command and parses JSON", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-mempalace-"));
  const config = createDefaultConfig(cwd);
  const connector = new MemPalaceConnector();
  const scriptPath = join(cwd, "mempalace-export.cjs");

  await writeFile(
    scriptPath,
    `process.stdout.write(JSON.stringify({ conversation: { id: "conv-1", messages: [{ id: "msg-1", speaker: "assistant", text: "hi" }] }, memories: [{ id: "mem-1", text: "builder values autonomy" }] }));\n`,
    "utf8"
  );

  config.connectors.mempalace.command = "node";
  config.connectors.mempalace.args = [scriptPath];
  config.connectors.mempalace.workingDirectory = cwd;

  const result = await connector.pull(config, {
    lastSyncAt: null,
    lastRunStatus: "never",
    lastError: null,
    seenSourceIds: []
  });

  assert.equal(result.source, "mempalace");
  assert.deepEqual(result.sourceIds.sort(), ["mem-1", "msg-1"]);
});
