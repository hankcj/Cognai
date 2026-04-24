import { Command } from "commander";

import { runConfigShowCommand } from "./commands/config-show.js";
import { runDemoCommand } from "./commands/demo.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInitCommand } from "./commands/init.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runMcpSnippetCommand } from "./commands/mcp-snippet.js";
import {
  runMemPalaceAuditCommand,
  runMemPalaceBackfillCommand,
  runMemPalaceCoverageCommand,
  runMemPalaceInventoryCommand
} from "./commands/mempalace.js";
import { runServeCommand } from "./commands/serve.js";
import { runSyncCommand } from "./commands/sync.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("cognai")
    .description("Provider-agnostic MCP reasoning layer between AI clients and memory systems.")
    .version("0.2.0");

  program
    .command("init")
    .description("Initialize a new Cognai workspace.")
    .option("--config <path>", "Write config to a custom path.")
    .option("--yes", "Run without interactive prompts.")
    .option("--mode <mode>", "user or org")
    .option("--storage <adapter>", "file, memory, or surrealdb")
    .option("--embedding-provider <provider>", "none or openai")
    .option(
      "--aux-provider <provider>",
      "none, openai, anthropic, google, or openai-compatible"
    )
    .option(
      "--enrichment-provider <provider>",
      "deprecated alias for --aux-provider"
    )
    .option("--connector <connector>", "none, mem0, mempalace, obsidian, both, or all")
    .option("--mempalace-palace-path <path>", "Palace path for MemPalace onboarding.")
    .option(
      "--mempalace-backfill-scope <scope>",
      "audit_only, selected, or full"
    )
    .option(
      "--mempalace-include-wings <csv>",
      "Comma-separated MemPalace wings to include when backfill scope is selected."
    )
    .option(
      "--mempalace-include-rooms <csv>",
      "Comma-separated MemPalace rooms or wing/room pairs to include when backfill scope is selected."
    )
    .option("--obsidian-vault-path <path>", "Path to an Obsidian vault.")
    .option("--seed <text>", "Seed the scaffold with a self-description.")
    .action(runInitCommand);

  program
    .command("sync")
    .description("Run the inference scaffold over an imported transcript or export.")
    .option("--config <path>", "Path to config file.")
    .option("--transcript <path>", "Path to importable JSON.")
    .option("--source <source>", "Adapter source, such as cognai-json, mem0, mempalace, or obsidian.")
    .option("--connector <connector>", "Pull from mem0, mempalace, or obsidian.")
    .option("--enable-schedule", "Confirm scheduled sync is enabled for the connector.")
    .option("--since <value>", 'Relative time window, such as "7 days ago".')
    .action(runSyncCommand);

  program
    .command("demo")
    .description("Create a sample workspace and ingest a built-in demo transcript.")
    .option("--config <path>", "Path to the demo config file.")
    .action(runDemoCommand);

  program
    .command("inspect")
    .description("Inspect graph state, nodes, tensions, or episodes.")
    .option("--config <path>", "Path to config file.")
    .option("--node <id>", "Inspect a specific node.")
    .option("--tensions", "List contradiction edges.")
    .option("--episodes", "List stored episodes.")
    .option("--sync-state", "Inspect connector sync state.")
    .action(runInspectCommand);

  program
    .command("doctor")
    .description("Validate the local scaffold workspace.")
    .option("--config <path>", "Path to config file.")
    .action(runDoctorCommand);

  const configCommand = program.command("config").description("Config helpers.");
  configCommand
    .command("show")
    .option("--config <path>", "Path to config file.")
    .description("Print the resolved Cognai config.")
    .action(runConfigShowCommand);

  program
    .command("mcp")
    .description("MCP integration helpers.")
    .command("snippet")
    .option("--config <path>", "Path to config file.")
    .description("Print ready-to-paste stdio config snippets.")
    .action(runMcpSnippetCommand);

  const mempalace = program.command("mempalace").description("MemPalace audit and backfill helpers.");
  mempalace
    .command("audit")
    .option("--config <path>", "Path to config file.")
    .description("Run a MemPalace taxonomy audit.")
    .action(runMemPalaceAuditCommand);
  mempalace
    .command("inventory")
    .option("--config <path>", "Path to config file.")
    .description("Enumerate MemPalace drawers into the local inventory manifest.")
    .action(runMemPalaceInventoryCommand);
  mempalace
    .command("backfill")
    .option("--config <path>", "Path to config file.")
    .option("--all-pending", "Process all pending rows instead of only stale/pending deltas.")
    .description("Run MemPalace semantic backfill over inventoried drawers.")
    .action(runMemPalaceBackfillCommand);
  mempalace
    .command("coverage")
    .option("--config <path>", "Path to config file.")
    .description("Show MemPalace audit and coverage status.")
    .action(runMemPalaceCoverageCommand);

  program
    .command("serve")
    .description("Start the Cognai MCP server over stdio.")
    .option("--config <path>", "Path to config file.")
    .action(runServeCommand);

  return program;
}
