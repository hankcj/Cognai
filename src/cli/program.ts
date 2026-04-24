import { Command } from "commander";

import { runConfigShowCommand } from "./commands/config-show.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInitCommand } from "./commands/init.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runMcpSnippetCommand } from "./commands/mcp-snippet.js";
import { runServeCommand } from "./commands/serve.js";
import { runSyncCommand } from "./commands/sync.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("cognai")
    .description("Local-first MCP server for modeling cognitive architecture.")
    .version("0.1.0");

  program
    .command("init")
    .description("Initialize a new Cognai workspace.")
    .option("--config <path>", "Write config to a custom path.")
    .option("--yes", "Run without interactive prompts.")
    .option("--mode <mode>", "user or org")
    .option("--storage <adapter>", "file, memory, or surrealdb")
    .option("--embedding-provider <provider>", "none or openai")
    .option("--enrichment-provider <provider>", "none or openai")
    .option("--connector <connector>", "none, mem0, mempalace, or both")
    .option("--seed <text>", "Seed the scaffold with a self-description.")
    .action(runInitCommand);

  program
    .command("sync")
    .description("Run the inference scaffold over an imported transcript or export.")
    .option("--config <path>", "Path to config file.")
    .option("--transcript <path>", "Path to importable JSON.")
    .option("--source <source>", "Adapter source, such as cognai-json, mem0, or mempalace.")
    .option("--connector <connector>", "Pull from mem0 or mempalace.")
    .option("--enable-schedule", "Confirm scheduled sync is enabled for the connector.")
    .option("--since <value>", 'Relative time window, such as "7 days ago".')
    .action(runSyncCommand);

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

  program
    .command("serve")
    .description("Start the Cognai MCP server over stdio.")
    .option("--config <path>", "Path to config file.")
    .action(runServeCommand);

  return program;
}
