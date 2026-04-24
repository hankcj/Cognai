import { confirm, input, select } from "@inquirer/prompts";

export interface InitPromptAnswers {
  mode: "user" | "org";
  storage: "file" | "memory" | "surrealdb";
  embeddingProvider: "none" | "openai";
  auxReasoningProvider:
    | "none"
    | "openai"
    | "anthropic"
    | "google"
    | "openai-compatible";
  connector: "none" | "mem0" | "mempalace" | "obsidian" | "all" | "both";
  mempalacePalacePath: string;
  mempalaceBackfillScope: "audit_only" | "selected" | "full";
  mempalaceIncludeWings: string[];
  mempalaceIncludeRooms: string[];
  obsidianVaultPath: string;
  seed: string;
  importNow: boolean;
}

export async function runInitPrompts(): Promise<InitPromptAnswers> {
  const mode = await select<"user" | "org">({
    message: "Who is this Cognai workspace for?",
    choices: [
      { name: "Single user", value: "user" },
      { name: "Organization", value: "org" }
    ]
  });

  const storage = await select<"file" | "memory" | "surrealdb">({
    message: "Which storage adapter should Cognai initialize?",
    choices: [
      {
        name: "SurrealDB embedded (recommended)",
        value: "surrealdb"
      },
      {
        name: "File fallback (dev/debugging)",
        value: "file"
      },
      { name: "Memory (ephemeral/testing)", value: "memory" }
    ]
  });

  const embeddingProvider = await select<"none" | "openai">({
    message: "Which embedding provider should the scaffold configure?",
    choices: [
      { name: "None for now", value: "none" },
      { name: "OpenAI-compatible scaffold config", value: "openai" }
    ]
  });

  const auxReasoningProvider = await select<
    "none" | "openai" | "anthropic" | "google" | "openai-compatible"
  >({
    message: "Do you want to prepare an optional auxiliary reasoning provider too?",
    choices: [
      { name: "No auxiliary reasoning yet", value: "none" },
      { name: "OpenAI", value: "openai" },
      { name: "Anthropic", value: "anthropic" },
      { name: "Google", value: "google" },
      { name: "OpenAI-compatible gateway", value: "openai-compatible" }
    ]
  });

  const connector = await select<"none" | "mem0" | "mempalace" | "obsidian" | "all">({
    message: "Which live connectors should Cognai prepare?",
    choices: [
      { name: "None for now", value: "none" },
      { name: "Mem0 only", value: "mem0" },
      { name: "MemPalace only", value: "mempalace" },
      { name: "Obsidian only", value: "obsidian" },
      { name: "All supported connectors", value: "all" }
    ]
  });

  let mempalacePalacePath = "";
  let mempalaceBackfillScope: "audit_only" | "selected" | "full" = "audit_only";
  let mempalaceIncludeWings: string[] = [];
  let mempalaceIncludeRooms: string[] = [];

  if (connector === "mempalace" || connector === "all") {
    mempalacePalacePath = await input({
      message: "Where is the MemPalace palace path?",
      default: ".mempalace"
    });

    mempalaceBackfillScope = await select<"audit_only" | "selected" | "full">({
      message: "How much MemPalace content should Cognai semantically backfill at first?",
      choices: [
        { name: "Audit only (recommended first run)", value: "audit_only" },
        { name: "Selected wings / rooms", value: "selected" },
        { name: "Full semantic backfill", value: "full" }
      ]
    });

    if (mempalaceBackfillScope === "selected") {
      const wings = await input({
        message: "Optional: comma-separated wing names to include.",
        default: ""
      });
      const rooms = await input({
        message: "Optional: comma-separated room names or wing/room pairs to include.",
        default: ""
      });
      mempalaceIncludeWings = wings
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      mempalaceIncludeRooms = rooms
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  const obsidianVaultPath =
    connector === "obsidian" || connector === "all"
      ? await input({
          message: "Where is the Obsidian vault path?",
          default: "Obsidian"
        })
      : "";

  const seed = await input({
    message:
      "Optional: give a brief self-description or mission statement to seed the graph.",
    default: ""
  });

  const importNow = await confirm({
    message: "Do you want the scaffold to prepare for an immediate import workflow?",
    default: true
  });

  return {
    mode,
    storage,
    embeddingProvider,
    auxReasoningProvider,
    connector,
    mempalacePalacePath,
    mempalaceBackfillScope,
    mempalaceIncludeWings,
    mempalaceIncludeRooms,
    obsidianVaultPath,
    seed,
    importNow
  };
}
