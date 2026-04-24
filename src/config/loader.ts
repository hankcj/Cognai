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

function createDefaultState(): CognaiState {
  return {
    connectors: {
      mem0: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: []
      },
      mempalace: {
        lastSyncAt: null,
        lastRunStatus: "never",
        lastError: null,
        seenSourceIds: []
      }
    }
  };
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
  return cognaiConfigSchema.parse(raw);
}

export async function saveConfig(config: CognaiConfig): Promise<void> {
  await ensureDir(config.paths.root);
  await ensureDir(config.paths.data);
  await ensureDir(config.paths.imports);
  await writeJsonFile(config.paths.config, cognaiConfigSchema.parse(config));
}

export async function loadState(config: CognaiConfig): Promise<CognaiState> {
  const raw = await readJsonFile(config.paths.state, createDefaultState());
  return cognaiStateSchema.parse(raw);
}

export async function saveState(
  config: CognaiConfig,
  state: CognaiState
): Promise<void> {
  await ensureDir(config.paths.root);
  await writeJsonFile(config.paths.state, cognaiStateSchema.parse(state));
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
