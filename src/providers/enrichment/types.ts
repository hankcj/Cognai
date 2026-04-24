import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { InferenceProposal } from "../../core/inference/types.js";

export interface EnrichmentProviderConfig {
  enabled: boolean;
  provider: "none" | "openai" | "anthropic" | "google" | "openai-compatible";
  model: string;
  apiKeyEnvVar: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface AuxReasoningMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EnrichmentProposal {
  proposal: InferenceProposal;
  annotation?: string;
}

export interface EnrichmentProvider {
  name: string;
  isConfigured(): boolean;
  completeText?(messages: AuxReasoningMessage[]): Promise<string | null>;
  enrich(
    envelope: CanonicalConversationEnvelope,
    proposals: InferenceProposal[]
  ): Promise<EnrichmentProposal[]>;
}
