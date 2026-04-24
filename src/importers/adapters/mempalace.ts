import { createId } from "../../shared/ids.js";
import {
  canonicalConversationEnvelopeSchema,
  type CanonicalConversationEnvelope
} from "../canonical.js";
import type { ImportAdapter } from "../types.js";

interface MemPalaceShape {
  conversation?: {
    id?: string;
    metadata?: Record<string, unknown>;
    messages?: Array<{
      id?: string;
      speaker?: string;
      text?: string;
      timestamp?: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  memories?: Array<{
    text?: string;
    id?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class MemPalaceImportAdapter implements ImportAdapter {
  source = "mempalace";

  canParse(input: unknown): boolean {
    return Boolean(
      input &&
        typeof input === "object" &&
        "conversation" in (input as Record<string, unknown>)
    );
  }

  normalize(input: unknown): CanonicalConversationEnvelope {
    const mempalace = input as MemPalaceShape;
    const conversation = mempalace.conversation ?? {};

    return canonicalConversationEnvelopeSchema.parse({
      source: this.source,
      conversation: {
        id: conversation.id ?? createId(),
        metadata: conversation.metadata ?? {}
      },
      messages: (conversation.messages ?? []).map((message, index) => ({
        id: message.id ?? `${index + 1}`,
        role: message.speaker === "assistant" ? "ai" : "user",
        content: message.text ?? "",
        timestamp: message.timestamp ?? new Date().toISOString(),
        metadata: {
          ...(message.metadata ?? {}),
          source_id: message.id ?? `${index + 1}`,
          source_timestamp: message.timestamp ?? null,
          source_adapter: this.source
        }
      })),
      memory_entries: (mempalace.memories ?? []).map((memory) => ({
        id: memory.id ?? createId(),
        content: memory.text ?? "",
        metadata: {
          ...(memory.metadata ?? {}),
          source_id: memory.id ?? null,
          source_adapter: this.source
        }
      })),
      participants: [],
      metadata: {
        source_adapter: this.source,
        external_conversation_id: conversation.id ?? null
      }
    });
  }
}
