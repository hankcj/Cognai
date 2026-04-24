import { homedir } from "node:os";
import { resolve } from "node:path";

export interface CognaiPaths {
  root: string;
  db: string;
  config: string;
}

export interface CognaiConfig {
  mode: "user" | "org";
  paths: CognaiPaths;
}

export function getDefaultPaths(cwd: string = process.cwd()): CognaiPaths {
  const root = resolve(cwd, ".cognai");

  return {
    root,
    db: resolve(root, "graph"),
    config: resolve(root, "config.json")
  };
}

export function getDefaultGlobalRoot(): string {
  return resolve(homedir(), ".cognai");
}

export function createDefaultConfig(cwd: string = process.cwd()): CognaiConfig {
  return {
    mode: "user",
    paths: getDefaultPaths(cwd)
  };
}
