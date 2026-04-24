#!/usr/bin/env node

import { Command } from "commander";

import { runInitCommand } from "./commands/init.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runSyncCommand } from "./commands/sync.js";
import { startServer } from "./server.js";

const program = new Command();

program
  .name("cognai")
  .description("Local-first MCP server for modeling cognitive architecture.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a new Cognai workspace.")
  .option("--user", "Initialize in single-user mode.")
  .option("--org", "Initialize in organization mode.")
  .action(async (options: { user?: boolean; org?: boolean }) => {
    await runInitCommand({ mode: options.org ? "org" : "user" });
  });

program
  .command("sync")
  .description("Run the inference pipeline over a transcript or time window.")
  .option("--transcript <path>", "Path to a conversation transcript.")
  .option("--since <value>", 'Relative time window, such as "7 days ago".')
  .action(async (options: { transcript?: string; since?: string }) => {
    await runSyncCommand(options);
  });

program
  .command("inspect")
  .description("Inspect graph state, provenance, or active tensions.")
  .option("--node <id>", "Inspect a specific node.")
  .option("--tensions", "List active contradiction pairs.")
  .action(async (options: { node?: string; tensions?: boolean }) => {
    await runInspectCommand(options);
  });

program
  .command("serve")
  .description("Start the Cognai MCP server.")
  .action(async () => {
    await startServer({ transport: "stdio" });
  });

await program.parseAsync(process.argv);
