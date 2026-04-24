import {
  canonicalConversationEnvelopeSchema,
  type CanonicalConversationEnvelope
} from "../canonical.js";
import type { ImportAdapter } from "../types.js";

export class CognaiJsonImportAdapter implements ImportAdapter {
  source = "cognai-json";

  canParse(input: unknown): boolean {
    return canonicalConversationEnvelopeSchema.safeParse(input).success;
  }

  normalize(input: unknown): CanonicalConversationEnvelope {
    return canonicalConversationEnvelopeSchema.parse(input);
  }
}
