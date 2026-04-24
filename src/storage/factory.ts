import type { CognaiConfig } from "../config/schema.js";
import type { StorageAdapter } from "./types.js";
import { FileStorageAdapter } from "./adapters/file.js";
import { MemoryStorageAdapter } from "./adapters/memory.js";
import { SurrealStorageAdapter } from "./adapters/surreal.js";

export function createStorageAdapter(config: CognaiConfig): StorageAdapter {
  switch (config.storage.adapter) {
    case "memory":
      return new MemoryStorageAdapter();
    case "surrealdb":
      return new SurrealStorageAdapter(
        config.storage.surrealkvPath,
        config.storage.namespace,
        config.storage.database
      );
    case "file":
    default:
      return new FileStorageAdapter(config.storage.fileDataPath);
  }
}
