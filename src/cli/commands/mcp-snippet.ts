import { requireConfig } from "../../config/loader.js";
import { printSection } from "../output.js";

export interface McpSnippetCommandOptions {
  config?: string;
}

export async function runMcpSnippetCommand(
  options: McpSnippetCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const command = "node";
  const args = ["dist/cli.js", "serve", "--config", config.paths.config];

  printSection(
    "Generic MCP Stdio Snippet",
    JSON.stringify(
      {
        command,
        args,
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
            command,
            args
          }
        }
      },
      null,
      2
    )
  );
}
