import { requireConfig } from "../../config/loader.js";
import { printJson } from "../output.js";

export interface ConfigShowCommandOptions {
  config?: string;
}

export async function runConfigShowCommand(
  options: ConfigShowCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  printJson(config);
}
