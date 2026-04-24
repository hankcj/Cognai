import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { InferenceProposal } from "../../core/inference/types.js";

export interface EnrichmentProviderConfig {
  enabled: boolean;
  provider: "none" | "openai";
  model: string;
  apiKeyEnvVar: string;
}

export interface EnrichmentProposal {
  proposal: InferenceProposal;
  annotation?: string;
}

export interface EnrichmentProvider {
  name: string;
  isConfigured(): boolean;
  enrich(
    envelope: CanonicalConversationEnvelope,
    proposals: InferenceProposal[]
  ): Promise<EnrichmentProposal[]>;
}
