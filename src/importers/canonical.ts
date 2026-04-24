import * as z from "zod/v4";

export const canonicalMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "ai", "system"]),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const canonicalMemoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  created_at: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const canonicalConversationEnvelopeSchema = z.object({
  source: z.string(),
  conversation: z.object({
    id: z.string(),
    title: z.string().optional(),
    started_at: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  }),
  messages: z.array(canonicalMessageSchema),
  memory_entries: z.array(canonicalMemoryEntrySchema).default([]),
  participants: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "ai", "system"]),
        label: z.string().optional()
      })
    )
    .default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type CanonicalMessage = z.infer<typeof canonicalMessageSchema>;
export type CanonicalMemoryEntry = z.infer<typeof canonicalMemoryEntrySchema>;
export type CanonicalConversationEnvelope = z.infer<
  typeof canonicalConversationEnvelopeSchema
>;
