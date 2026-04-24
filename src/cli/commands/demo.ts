import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { runSyncCommand } from "./sync.js";
import { requireConfig } from "../../config/loader.js";
import { createDefaultConfig } from "../../config/defaults.js";
import { saveConfig, saveState } from "../../config/loader.js";
import { printSection } from "../output.js";

export interface DemoCommandOptions {
  config?: string;
}

const demoTranscript = {
  source: "cognai-json",
  conversation: {
    id: "demo-conversation",
    metadata: {
      source: "cognai-demo"
    }
  },
  messages: [
    {
      id: "1",
      role: "user",
      content:
        "I care about independence and creative freedom. I want to build a small profitable software business.",
      timestamp: "2026-04-24T12:00:00.000Z",
      metadata: {}
    },
    {
      id: "2",
      role: "user",
      content:
        "I prefer calm, sustainable work over chaotic rapid growth. I am worried that burnout will make me quit. I assume customers will pay more for quality than speed.",
      timestamp: "2026-04-24T12:05:00.000Z",
      metadata: {}
    }
  ],
  memory_entries: [],
  participants: [],
  metadata: {}
};

export async function runDemoCommand(
  options: DemoCommandOptions = {}
): Promise<void> {
  const configPath = resolve(options.config ?? resolve(process.cwd(), ".cognai-demo", "config.json"));
  const config = createDefaultConfig();
  const root = dirname(configPath);

  config.mode = "user";
  config.storage.adapter = "surrealdb";
  config.embeddings.provider = "none";
  config.aux_reasoning.enabled = false;
  config.aux_reasoning.provider = "none";
  config.connectors.mem0.enabled = false;
  config.connectors.mempalace.enabled = false;
  config.paths.root = root;
  config.paths.config = configPath;
  config.paths.data = resolve(root, "data");
  config.paths.imports = resolve(root, "imports");
  config.paths.state = resolve(root, "state.json");
  config.storage.fileDataPath = resolve(config.paths.data, "file-store");
  config.storage.surrealkvPath = resolve(config.paths.data, "surreal-store");

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
  });

  const resolvedConfig = await requireConfig(configPath);
  const demoPath = resolve(resolvedConfig.paths.imports, "demo-transcript.json");
  await writeFile(demoPath, JSON.stringify(demoTranscript, null, 2) + "\n", "utf8");

  await runSyncCommand({
    config: configPath,
    transcript: demoPath
  });

  printSection(
    "Demo Ready",
    `Workspace: ${dirname(configPath)}
Config: ${configPath}
Demo transcript: ${demoPath}
Next steps:
- Run "cognai inspect --config ${configPath}"
- Run "cognai mcp snippet --config ${configPath}"
- Run "cognai serve --config ${configPath}"`
  );
}
