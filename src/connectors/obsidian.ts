import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import type { CognaiConfig, ConnectorSyncState } from "../config/schema.js";
import { CognaiError } from "../shared/errors.js";
import type {
  ConnectorHealth,
  ConnectorPullResult,
  LiveConnector
} from "./types.js";

interface ObsidianNote {
  id: string;
  path: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function isExcluded(
  relativePath: string,
  includeDirs: string[],
  excludeDirs: string[]
): boolean {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split("/");

  if (
    excludeDirs.some((dir) => {
      const clean = dir.replace(/^\/+|\/+$/g, "");
      return parts.includes(clean) || normalized.startsWith(`${clean}/`);
    })
  ) {
    return true;
  }

  if (includeDirs.length === 0) {
    return false;
  }

  return !includeDirs.some((dir) => {
    const clean = dir.replace(/^\/+|\/+$/g, "");
    return normalized === clean || normalized.startsWith(`${clean}/`);
  });
}

function splitFrontmatter(raw: string): {
  body: string;
  frontmatter: Record<string, string | string[]>;
} {
  if (!raw.startsWith("---\n")) {
    return { body: raw, frontmatter: {} };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { body: raw, frontmatter: {} };
  }

  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).trimStart();
  const frontmatter: Record<string, string | string[]> = {};

  for (const line of block.split("\n")) {
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey?.trim();
    if (!key) {
      continue;
    }
    const value = rawValue.join(":").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^"|"$/g, "");
    }
  }

  return { body, frontmatter };
}

function extractTitle(relativePath: string, body: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  return relativePath.replace(/\.md$/i, "").split("/").at(-1) ?? relativePath;
}

async function walkMarkdownFiles(
  vaultPath: string,
  includeDirs: string[],
  excludeDirs: string[],
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }

      const fullPath = resolve(dir, entry.name);
      const relPath = normalizePath(relative(vaultPath, fullPath));
      if (isExcluded(relPath, includeDirs, excludeDirs)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(vaultPath);
  return files;
}

async function readNote(vaultPath: string, filePath: string): Promise<ObsidianNote> {
  const raw = await readFile(filePath, "utf8");
  const fileStat = await stat(filePath);
  const relativePath = normalizePath(relative(vaultPath, filePath));
  const { body, frontmatter } = splitFrontmatter(raw);
  const contentHash = hashText(raw);

  return {
    id: `${relativePath}:${contentHash}`,
    path: relativePath,
    title: extractTitle(relativePath, body, frontmatter),
    content: body.trim(),
    metadata: {
      external_system: "obsidian",
      vault_path: vaultPath,
      note_path: relativePath,
      title: extractTitle(relativePath, body, frontmatter),
      frontmatter,
      content_hash: contentHash,
      file_mtime: fileStat.mtime.toISOString(),
      source_id: `${relativePath}:${contentHash}`,
      source_adapter: "obsidian"
    }
  };
}

export class ObsidianConnector implements LiveConnector {
  readonly name = "obsidian" as const;

  validate(config: CognaiConfig): string[] {
    const issues: string[] = [];
    if (!config.connectors.obsidian.vaultPath.trim()) {
      issues.push("Obsidian vaultPath must be configured.");
    }
    if (config.connectors.obsidian.maxFilesPerSync <= 0) {
      issues.push("Obsidian maxFilesPerSync must be positive.");
    }
    return issues;
  }

  async checkHealth(config: CognaiConfig): Promise<ConnectorHealth> {
    try {
      const vaultPath = resolve(config.connectors.obsidian.vaultPath);
      const vaultStat = await stat(vaultPath);
      if (!vaultStat.isDirectory()) {
        throw new CognaiError(`${vaultPath} is not a directory.`);
      }

      const files = await walkMarkdownFiles(
        vaultPath,
        config.connectors.obsidian.includeDirs,
        config.connectors.obsidian.excludeDirs,
        Math.min(config.connectors.obsidian.maxFilesPerSync, 25)
      );

      return {
        status: files.length > 0 ? "ok" : "warning",
        detail:
          files.length > 0
            ? `Found Markdown notes in ${vaultPath}.`
            : `No Markdown notes found in ${vaultPath} with the configured scope.`
      };
    } catch (error) {
      return {
        status: "warning",
        detail: error instanceof Error ? error.message : "Obsidian health check failed."
      };
    }
  }

  async pull(
    config: CognaiConfig,
    state: ConnectorSyncState
  ): Promise<ConnectorPullResult> {
    const vaultPath = resolve(config.connectors.obsidian.vaultPath);
    const files = await walkMarkdownFiles(
      vaultPath,
      config.connectors.obsidian.includeDirs,
      config.connectors.obsidian.excludeDirs,
      config.connectors.obsidian.maxFilesPerSync
    );
    const notes = (
      await Promise.all(files.map((filePath) => readNote(vaultPath, filePath)))
    ).filter((note) => note.content.trim().length > 0);

    return {
      source: this.name,
      payload: {
        vault: {
          path: vaultPath,
          last_sync_at: state.lastSyncAt
        },
        notes
      },
      sourceIds: notes.map((note) => note.id),
      rangeSummary: `${notes.length} Markdown note${notes.length === 1 ? "" : "s"} from ${vaultPath}`,
      metadata: {
        fetched_count: notes.length,
        vault_path: vaultPath,
        max_files_per_sync: config.connectors.obsidian.maxFilesPerSync
      }
    };
  }
}
