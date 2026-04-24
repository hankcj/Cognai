import { requireConfig } from "../../config/loader.js";
import { createRuntime } from "../../mcp/context.js";
import { startMcpServer } from "../../mcp/server.js";
import { runSyncCommand } from "./sync.js";

export interface ServeCommandOptions {
  config?: string;
}

export async function runServeCommand(
  options: ServeCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const runtime = createRuntime(config);
  const timers: NodeJS.Timeout[] = [];

  for (const connector of runtime.connectors) {
    const connectorConfig = config.connectors[connector.name];
    if (!connectorConfig.enabled || !connectorConfig.autoSync) {
      continue;
    }

    timers.push(
      setInterval(() => {
        void runSyncCommand({
          config: options.config,
          connector: connector.name
        }).catch((error) => {
          console.error(
            `Scheduled sync for ${connector.name} failed: ${
              error instanceof Error ? error.message : "Unknown error."
            }`
          );
        });
      }, connectorConfig.pollIntervalMinutes * 60_000)
    );
  }

  const clearTimers = () => {
    for (const timer of timers) {
      clearInterval(timer);
    }
  };

  process.once("SIGINT", clearTimers);
  process.once("SIGTERM", clearTimers);

  await startMcpServer(runtime);
}
