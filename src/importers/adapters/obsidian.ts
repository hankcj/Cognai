import { createId } from "../../shared/ids.js";
import {
  canonicalConversationEnvelopeSchema,
  type CanonicalConversationEnvelope
} from "../canonical.js";
import type { ImportAdapter } from "../types.js";

interface ObsidianShape {
  vault?: {
    path?: string;
    last_sync_at?: string | null;
  };
  notes?: Array<{
    id?: string;
    path?: string;
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class ObsidianImportAdapter implements ImportAdapter {
  source = "obsidian";

  canParse(input: unknown): boolean {
    return Boolean(
      input &&
        typeof input === "object" &&
        "notes" in (input as Record<string, unknown>)
    );
  }

  normalize(input: unknown): CanonicalConversationEnvelope {
    const obsidian = input as ObsidianShape;
    const now = new Date().toISOString();

    return canonicalConversationEnvelopeSchema.parse({
      source: this.source,
      conversation: {
        id: `obsidian-sync-${createId()}`,
        metadata: {
          external_system: "obsidian",
          vault_path: obsidian.vault?.path ?? null,
          last_sync_at: obsidian.vault?.last_sync_at ?? null
        }
      },
      messages: [],
      memory_entries: (obsidian.notes ?? []).map((note) => ({
        id: note.id ?? createId(),
        content: note.content ?? "",
        created_at:
          typeof note.metadata?.file_mtime === "string"
            ? note.metadata.file_mtime
            : now,
        metadata: {
          ...(note.metadata ?? {}),
          source_id: note.id ?? note.path ?? null,
          source_adapter: this.source,
          external_system: "obsidian",
          vault_path: obsidian.vault?.path ?? note.metadata?.vault_path ?? null,
          note_path: note.path ?? note.metadata?.note_path ?? null,
          title: note.title ?? note.metadata?.title ?? null
        }
      })),
      participants: [],
      metadata: {
        source_adapter: this.source,
        external_system: "obsidian",
        vault_path: obsidian.vault?.path ?? null
      }
    });
  }
}
