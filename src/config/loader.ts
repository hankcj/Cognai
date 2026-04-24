import { access } from "node:fs/promises";
import { constants } from "node:fs";

import { ensureDir, readJsonFile, writeJsonFile } from "../shared/fs.js";
import { CognaiError } from "../shared/errors.js";
import { createDefaultConfig } from "./defaults.js";
import {
  cognaiConfigSchema,
  cognaiStateSchema,
  type CognaiConfig,
  type CognaiState
} from "./schema.js";

function normalizeConfigShape(raw: unknown, fallback: CognaiConfig): CognaiConfig {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawConnectors =
    value.connectors && typeof value.connectors === "object"
      ? (value.connectors as Record<string, unknown>)
      : {};
  const legacyEnrichment =
    value.enrichment && typeof value.enrichment === "object"
      ? (value.enrichment as Record<string, unknown>)
      : {};
  const rawMemPalace =
    rawConnectors.mempalace && typeof rawConnectors.mempalace === "object"
      ? (rawConnectors.mempalace as Record<string, unknown>)
      : {};
  const legacyBootstrap =
    rawMemPalace.bootstrap && typeof rawMemPalace.bootstrap === "object"
      ? (rawMemPalace.bootstrap as Record<string, unknown>)
      : {};
  const syncMode =
    typeof rawMemPalace.syncMode === "string" ? rawMemPalace.syncMode : undefined;
  const migratedBootstrapMode =
    syncMode === "wake-up"
      ? "wake_up"
      : syncMode === "search"
        ? "search_seed"
        : fallback.connectors.mempalace.bootstrapMode;
  const normalized = {
    ...fallback,
    ...value,
    embeddings: {
      ...fallback.embeddings,
      ...(value.embeddings as Record<string, unknown> | undefined)
    },
    aux_reasoning: {
      ...fallback.aux_reasoning,
      ...legacyEnrichment,
      ...(value.aux_reasoning as Record<string, unknown> | undefined)
    },
    retrieval: {
      ...fallback.retrieval,
      ...(value.retrieval as Record<string, unknown> | undefined)
    },
    inference: {
      ...fallback.inference,
      ...(value.inference as Record<string, unknown> | undefined)
    },
    decay: {
      ...fallback.decay,
      ...(value.decay as Record<string, unknown> | undefined)
    },
    imports: {
      ...fallback.imports,
      ...(value.imports as Record<string, unknown> | undefined)
    },
    mcp: {
      ...fallback.mcp,
      ...(value.mcp as Record<string, unknown> | undefined)
    },
    onboarding: {
      ...fallback.onboarding,
      ...(value.onboarding as Record<string, unknown> | undefined)
    },
    connectors: {
      mem0: {
        ...fallback.connectors.mem0,
        ...(rawConnectors.mem0 as Record<string, unknown> | undefined)
      },
      obsidian: {
        ...fallback.connectors.obsidian,
        ...(rawConnectors.obsidian as Record<string, unknown> | undefined)
      },
      mempalace: {
        ...fallback.connectors.mempalace,
        ...rawMemPalace,
        integrationMode: "sibling_mcp",
        bootstrapMode:
          typeof rawMemPalace.bootstrapMode === "string" &&
          !(
            typeof rawMemPalace.syncMode === "string" &&
            rawMemPalace.bootstrapMode === fallback.connectors.mempalace.bootstrapMode
          )
            ? rawMemPalace.bootstrapMode
            : migratedBootstrapMode,
        backfillScope:
          typeof rawMemPalace.backfillScope === "string"
            ? rawMemPalace.backfillScope
            : fallback.connectors.mempalace.backfillScope,
        includeWings: Array.isArray(rawMemPalace.includeWings)
          ? rawMemPalace.includeWings
          : fallback.connectors.mempalace.includeWings,
        excludeWings: Array.isArray(rawMemPalace.excludeWings)
          ? rawMemPalace.excludeWings
          : fallback.connectors.mempalace.excludeWings,
        includeRooms: Array.isArray(rawMemPalace.includeRooms)
          ? rawMemPalace.includeRooms
          : fallback.connectors.mempalace.includeRooms,
        excludeRooms: Array.isArray(rawMemPalace.excludeRooms)
          ? rawMemPalace.excludeRooms
          : fallback.connectors.mempalace.excludeRooms,
        bootstrap: {
          ...fallback.connectors.mempalace.bootstrap,
          ...legacyBootstrap,
          searchLimit:
            typeof rawMemPalace.searchLimit === "number"
              ? rawMemPalace.searchLimit
              : legacyBootstrap.searchLimit,
          wakeUpTokenBudget:
            typeof rawMemPalace.wakeUpTokenBudget === "number"
              ? rawMemPalace.wakeUpTokenBudget
              : legacyBootstrap.wakeUpTokenBudget
        }
      }
    },
    paths: {
      ...fallback.paths,
      ...(value.paths as Record<string, unknown> | undefined)
    }
  };

  return cognaiConfigSchema.parse(normalized);
}

function createDefaultState(): CognaiState {
  return {
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
      obsidian: {
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
  };
}

function normalizeStateShape(raw: unknown): CognaiState {
  const fallback = createDefaultState();
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const connectors =
    value.connectors && typeof value.connectors === "object"
      ? (value.connectors as Record<string, unknown>)
      : {};

  return cognaiStateSchema.parse({
    connectors: {
      mem0: {
        ...fallback.connectors.mem0,
        ...(connectors.mem0 as Record<string, unknown> | undefined)
      },
      obsidian: {
        ...fallback.connectors.obsidian,
        ...(connectors.obsidian as Record<string, unknown> | undefined)
      },
      mempalace: {
        ...fallback.connectors.mempalace,
        ...(connectors.mempalace as Record<string, unknown> | undefined)
      }
    }
  });
}

export async function configExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(path?: string): Promise<CognaiConfig> {
  const fallback = createDefaultConfig();
  const configPath = path ?? fallback.paths.config;
  const raw = await readJsonFile(configPath, fallback);
  return normalizeConfigShape(raw, fallback);
}

export async function saveConfig(config: CognaiConfig): Promise<void> {
  await ensureDir(config.paths.root);
  await ensureDir(config.paths.data);
  await ensureDir(config.paths.imports);
  await writeJsonFile(config.paths.config, cognaiConfigSchema.parse(config));
}

export async function loadState(config: CognaiConfig): Promise<CognaiState> {
  const raw = await readJsonFile(config.paths.state, createDefaultState());
  return normalizeStateShape(raw);
}

export async function saveState(
  config: CognaiConfig,
  state: CognaiState
): Promise<void> {
  await ensureDir(config.paths.root);
  await writeJsonFile(config.paths.state, normalizeStateShape(state));
}

export async function requireConfig(path?: string): Promise<CognaiConfig> {
  const config = createDefaultConfig();
  const configPath = path ?? config.paths.config;

  if (!(await configExists(configPath))) {
    throw new CognaiError(
      `No Cognai config found at ${configPath}. Run "cognai init" first.`
    );
  }

  return loadConfig(configPath);
}
