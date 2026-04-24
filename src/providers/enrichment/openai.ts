import { createId } from "../../shared/ids.js";
import { truncate } from "../../shared/text.js";
import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { CognaiEdge, CognaiNode } from "../../core/graph/types.js";
import type { InferenceProposal } from "../../core/inference/types.js";
import type {
  EnrichmentProposal,
  EnrichmentProvider,
  EnrichmentProviderConfig
} from "./types.js";

function buildNode(
  type: CognaiNode["type"],
  description: string,
  reason: string
): CognaiNode {
  const now = new Date().toISOString();

  return {
    id: createId(),
    type,
    label: truncate(description, 64),
    description,
    embedding: [],
    source: "inferred",
    confidence: type === "Assumption" ? 0.44 : 0.5,
    activation: 0.42,
    centrality: 0.28,
    construal_level: type === "Fear" ? "mid" : "low",
    created_at: now,
    updated_at: now,
    last_reinforced_at: now,
    metadata: {
      polarity: "negative",
      extraction_rationale: reason,
      confidence_explanation:
        "Optional enrichment suggestion added after deterministic extraction.",
      originating_source_type: "openai-compatible-enrichment"
    }
  };
}

export class ScaffoldOpenAiEnrichmentProvider implements EnrichmentProvider {
  name = "openai";

  constructor(private readonly config: EnrichmentProviderConfig) {}

  isConfigured(): boolean {
    return this.config.enabled && Boolean(process.env[this.config.apiKeyEnvVar]);
  }

  async enrich(
    envelope: CanonicalConversationEnvelope,
    proposals: InferenceProposal[]
  ): Promise<EnrichmentProposal[]> {
    const joinedText = envelope.messages.map((message) => message.content).join(" ");
    const lower = joinedText.toLowerCase();
    const hasFear = proposals.some((proposal) => proposal.node.type === "Fear");
    const hasAssumption = proposals.some((proposal) => proposal.node.type === "Assumption");
    const results: EnrichmentProposal[] = [];

    if (!hasFear && /\b(risk|worried|fragile|burn out|burnout|lose|fail)\b/.test(lower)) {
      const target = proposals.find(
        (proposal) => proposal.node.type === "Goal" || proposal.node.type === "Commitment"
      );
      const node = buildNode(
        "Fear",
        "Overextending could damage momentum or wellbeing.",
        "Enrichment inferred a protective fear signal from risk-oriented language."
      );
      const edges: CognaiEdge[] = target
        ? [
            {
              id: createId(),
              from_node_id: node.id,
              to_node_id: target.node.id,
              type: "INHIBITS",
              confidence: 0.42,
              source: "inferred",
              created_at: new Date().toISOString(),
              metadata: {
                rationale: "enrichment-risk-link"
              }
            }
          ]
        : [];
      results.push({
        proposal: {
          origin: "enriched",
          reason:
            "Optional enrichment added a conservative fear candidate after deterministic extraction.",
          node,
          edges,
          contradictionTargets: []
        },
        annotation: "Fear candidate added from enrichment."
      });
    }

    if (!hasAssumption && /\b(probably|assuming|if the market|if people|likely)\b/.test(lower)) {
      results.push({
        proposal: {
          origin: "enriched",
          reason:
            "Optional enrichment added a conservative assumption candidate after deterministic extraction.",
          node: buildNode(
            "Assumption",
            "External conditions will cooperate enough for the current plan to work.",
            "Enrichment inferred an assumption from conditional or probabilistic phrasing."
          ),
          edges: [],
          contradictionTargets: []
        },
        annotation: "Assumption candidate added from enrichment."
      });
    }

    return results;
  }
}

export class NoopEnrichmentProvider implements EnrichmentProvider {
  name = "none";

  isConfigured(): boolean {
    return false;
  }

  async enrich(): Promise<EnrichmentProposal[]> {
    return [];
  }
}

export function createEnrichmentProvider(
  config: EnrichmentProviderConfig
): EnrichmentProvider {
  if (config.provider === "openai") {
    return new ScaffoldOpenAiEnrichmentProvider(config);
  }

  return new NoopEnrichmentProvider();
}
