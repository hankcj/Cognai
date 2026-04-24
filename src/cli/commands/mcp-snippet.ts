import { requireConfig } from "../../config/loader.js";
import { printSection } from "../output.js";

export interface McpSnippetCommandOptions {
  config?: string;
}

export async function runMcpSnippetCommand(
  options: McpSnippetCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const repoLocalCommand = "node";
  const repoLocalArgs = ["dist/cli.js", "serve", "--config", config.paths.config];
  const installedCommand = "cognai";
  const installedArgs = ["serve", "--config", config.paths.config];

  printSection(
    "Installed Package Example",
    JSON.stringify(
      {
        command: installedCommand,
        args: installedArgs,
        env: {}
      },
      null,
      2
    )
  );

  printSection(
    "Repo-Local MCP Stdio Snippet",
    JSON.stringify(
      {
        command: repoLocalCommand,
        args: repoLocalArgs,
        env: {}
      },
      null,
      2
    )
  );

  printSection(
    "Claude Desktop Example",
    JSON.stringify(
      {
        mcpServers: {
          cognai: {
            command: installedCommand,
            args: installedArgs
          }
        }
      },
      null,
      2
    )
  );

  printSection(
    "OpenClaw + MemPalace Sibling Example",
    JSON.stringify(
      {
        mcpServers: {
          cognai: {
            command: installedCommand,
            args: installedArgs
          },
          mempalace: {
            command: "mempalace",
            args: ["mcp", "--palace", config.connectors.mempalace.palacePath]
          }
        }
      },
      null,
      2
    )
  );

  printSection(
    "Obsidian Note",
    `Obsidian support is a local vault connector, not a sibling MCP server. Enable it during init or in config, then run:
cognai sync --connector obsidian --config ${config.paths.config}`
  );
}
