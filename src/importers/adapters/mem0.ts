import { createId } from "../../shared/ids.js";
import {
  canonicalConversationEnvelopeSchema,
  type CanonicalConversationEnvelope
} from "../canonical.js";
import type { ImportAdapter } from "../types.js";

interface Mem0Shape {
  conversation_id?: string;
  metadata?: Record<string, unknown>;
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
    created_at?: string;
    metadata?: Record<string, unknown>;
  }>;
  memories?: Array<{
    id?: string;
    memory?: string;
    created_at?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class Mem0ImportAdapter implements ImportAdapter {
  source = "mem0";

  canParse(input: unknown): boolean {
    return Boolean(
      input &&
        typeof input === "object" &&
        ("messages" in (input as Record<string, unknown>) ||
          "memories" in (input as Record<string, unknown>))
    );
  }

  normalize(input: unknown): CanonicalConversationEnvelope {
    const mem0 = input as Mem0Shape;

    return canonicalConversationEnvelopeSchema.parse({
      source: this.source,
      conversation: {
        id: mem0.conversation_id ?? createId(),
        metadata: mem0.metadata ?? {}
      },
      messages: (mem0.messages ?? []).map((message, index) => ({
        id: message.id ?? `${index + 1}`,
        role: message.role === "assistant" ? "ai" : "user",
        content: message.content ?? "",
        timestamp: message.created_at ?? new Date().toISOString(),
        metadata: {
          ...(message.metadata ?? {}),
          source_id: message.id ?? `${index + 1}`,
          source_timestamp: message.created_at ?? null,
          source_adapter: this.source
        }
      })),
      memory_entries: (mem0.memories ?? []).map((memory) => ({
        id: memory.id ?? createId(),
        content: memory.memory ?? "",
        created_at: memory.created_at,
        metadata: {
          ...(memory.metadata ?? {}),
          source_id: memory.id ?? null,
          source_timestamp: memory.created_at ?? null,
          source_adapter: this.source
        }
      })),
      participants: [],
      metadata: {
        source_adapter: this.source,
        external_conversation_id: mem0.conversation_id ?? null
      }
    });
  }
}
