import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
        seenSourceIds: ["m-1"],
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

  const loaded = await loadState(config);
  assert.equal(loaded.connectors.mem0.lastRunStatus, "ok");
  assert.deepEqual(loaded.connectors.mem0.seenSourceIds, ["m-1"]);
});

test("legacy enrichment config migrates to aux_reasoning", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-config-migrate-"));
  const config = createDefaultConfig(cwd);
  const { aux_reasoning: _legacyOmitted, ...legacyConfig } = config;
  await mkdir(dirname(config.paths.config), { recursive: true });

  await writeFile(
    config.paths.config,
    JSON.stringify(
      {
        ...legacyConfig,
        enrichment: {
          enabled: true,
          provider: "openai-compatible",
          model: "test-model",
          apiKeyEnvVar: "TEST_KEY",
          baseUrl: "https://example.com/v1"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const loaded = await loadConfig(config.paths.config);
  assert.equal(loaded.aux_reasoning.enabled, true);
  assert.equal(loaded.aux_reasoning.provider, "openai-compatible");
  assert.equal(loaded.aux_reasoning.model, "test-model");
  assert.equal(loaded.aux_reasoning.apiKeyEnvVar, "TEST_KEY");
  assert.equal(loaded.aux_reasoning.baseUrl, "https://example.com/v1");
});

test("legacy mempalace connector config migrates to audit/backfill model", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-config-mempalace-migrate-"));
  const config = createDefaultConfig(cwd);
  await mkdir(dirname(config.paths.config), { recursive: true });

  await writeFile(
    config.paths.config,
    JSON.stringify(
      {
        ...config,
        connectors: {
          ...config.connectors,
          mempalace: {
            ...config.connectors.mempalace,
            syncMode: "wake-up",
            searchLimit: 12,
            wakeUpTokenBudget: 900
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const loaded = await loadConfig(config.paths.config);
  assert.equal(loaded.connectors.mempalace.integrationMode, "sibling_mcp");
  assert.equal(loaded.connectors.mempalace.bootstrapMode, "wake_up");
  assert.equal(loaded.connectors.mempalace.bootstrap.searchLimit, 12);
  assert.equal(loaded.connectors.mempalace.bootstrap.wakeUpTokenBudget, 900);
});
