import { confirm, input, select } from "@inquirer/prompts";

export interface InitPromptAnswers {
  mode: "user" | "org";
  storage: "file" | "memory" | "surrealdb";
  embeddingProvider: "none" | "openai";
  enrichmentProvider: "none" | "openai";
  connector: "none" | "mem0" | "mempalace" | "both";
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

  const enrichmentProvider = await select<"none" | "openai">({
    message: "Do you want to prepare optional enrichment settings too?",
    choices: [
      { name: "No enrichment yet", value: "none" },
      { name: "OpenAI-compatible enrichment scaffold", value: "openai" }
    ]
  });

  const connector = await select<"none" | "mem0" | "mempalace" | "both">({
    message: "Which live connectors should Cognai prepare?",
    choices: [
      { name: "None for now", value: "none" },
      { name: "Mem0 only", value: "mem0" },
      { name: "MemPalace only", value: "mempalace" },
      { name: "Both Mem0 and MemPalace", value: "both" }
    ]
  });

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
    enrichmentProvider,
    connector,
    seed,
    importNow
  };
}
