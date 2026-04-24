import { mkdir, writeFile } from "node:fs/promises";

import { createDefaultConfig } from "../config.js";

export interface InitCommandOptions {
  mode?: "user" | "org";
}

export async function runInitCommand(
  options: InitCommandOptions = {}
): Promise<void> {
  const config = createDefaultConfig();
  const mode = options.mode ?? "user";
  const nextConfig = { ...config, mode };

  await mkdir(nextConfig.paths.root, { recursive: true });
  await mkdir(nextConfig.paths.db, { recursive: true });
  await writeFile(
    nextConfig.paths.config,
    JSON.stringify(nextConfig, null, 2) + "\n",
    "utf8"
  );

  process.stdout.write(`Initialized Cognai in ${nextConfig.paths.root}\n`);
  process.stdout.write(`Mode: ${nextConfig.mode}\n`);
}
