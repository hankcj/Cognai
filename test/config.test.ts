import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultConfig } from "../src/config/defaults.js";
import { loadConfig, loadState, saveConfig, saveState } from "../src/config/loader.js";

test("config round-trips through disk", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-config-"));
  const config = createDefaultConfig(cwd);
  config.mode = "org";

  await saveConfig(config);
  const loaded = await loadConfig(config.paths.config);

  assert.equal(loaded.mode, "org");
  assert.equal(loaded.paths.config, config.paths.config);
});

test("state round-trips connector checkpoints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-state-"));
  const config = createDefaultConfig(cwd);

  await saveState(config, {
    connectors: {
      mem0: {
        lastSyncAt: "2026-04-24T12:00:00.000Z",
        lastRunStatus: "ok",
        lastError: null,
        seenSourceIds: ["m-1"]
      },
      mempalace: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: []
      }
    }
  });

  const loaded = await loadState(config);
  assert.equal(loaded.connectors.mem0.lastRunStatus, "ok");
  assert.deepEqual(loaded.connectors.mem0.seenSourceIds, ["m-1"]);
});
