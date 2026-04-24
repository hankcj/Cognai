import type { CanonicalConversationEnvelope } from "./canonical.js";

export interface ImportAdapter {
  source: string;
  canParse(input: unknown): boolean;
  normalize(input: unknown): CanonicalConversationEnvelope;
}
