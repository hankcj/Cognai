import { createId } from "../../shared/ids.js";
import { truncate } from "../../shared/text.js";
import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { CognaiEdge, CognaiNode } from "../../core/graph/types.js";
import type { InferenceProposal } from "../../core/inference/types.js";
import type {
  AuxReasoningMessage,
  EnrichmentProposal,
  EnrichmentProvider,
  EnrichmentProviderConfig
} from "./types.js";

interface RemoteSuggestion {
  type: CognaiNode["type"];
  description: string;
  reason: string;
  target_label?: string;
  edge_type?: CognaiEdge["type"];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
      polarity: type === "Fear" ? "negative" : "positive",
      extraction_rationale: reason,
      confidence_explanation:
        "Optional auxiliary reasoning suggestion added after deterministic extraction.",
      originating_source_type: "aux-reasoning"
    }
  };
}

function buildPrompt(
  envelope: CanonicalConversationEnvelope,
  proposals: InferenceProposal[]
): AuxReasoningMessage[] {
  const deterministic = proposals.map((proposal) => ({
    type: proposal.node.type,
    label: proposal.node.label,
    description: proposal.node.description
  }));

  return [
    {
      role: "system",
      content:
        "You are assisting a local cognitive graph. Return only valid JSON with a top-level 'suggestions' array. Suggest at most 3 additive nodes that are strongly supported by the conversation. Never restate an existing node. Prefer Fear, Assumption, Belief, or Commitment. Each suggestion must include type, description, and reason. Optional fields: target_label and edge_type."
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          conversation: envelope.messages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          existing_nodes: deterministic
        },
        null,
        2
      )
    }
  ];
}

function suggestionsToProposals(
  suggestions: RemoteSuggestion[],
  proposals: InferenceProposal[]
): EnrichmentProposal[] {
  return suggestions.slice(0, 3).map((suggestion) => {
    const node = buildNode(suggestion.type, suggestion.description, suggestion.reason);
    const edges: CognaiEdge[] = [];
    const target =
      suggestion.target_label &&
      proposals.find(
        (proposal) =>
          proposal.node.label.toLowerCase() === suggestion.target_label?.toLowerCase()
      );

    if (target && suggestion.edge_type) {
      edges.push({
        id: createId(),
        from_node_id: node.id,
        to_node_id: target.node.id,
        type: suggestion.edge_type,
        confidence: 0.41,
        source: "inferred",
        created_at: new Date().toISOString(),
        metadata: {
          rationale: "aux-reasoning-link"
        }
      });
    }

    return {
      proposal: {
        origin: "enriched",
        reason: suggestion.reason,
        node,
        edges,
        contradictionTargets: []
      },
      annotation: `${suggestion.type} candidate added from auxiliary reasoning.`
    };
  });
}

abstract class BaseRemoteEnrichmentProvider implements EnrichmentProvider {
  abstract name: string;

  constructor(protected readonly config: EnrichmentProviderConfig) {}

  isConfigured(): boolean {
    return this.config.enabled && Boolean(process.env[this.config.apiKeyEnvVar]);
  }

  async enrich(
    envelope: CanonicalConversationEnvelope,
    proposals: InferenceProposal[]
  ): Promise<EnrichmentProposal[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const text = await this.completeText(buildPrompt(envelope, proposals));
      if (!text) {
        return [];
      }

      const parsed = extractJsonObject(text);
      const suggestions = Array.isArray(parsed?.suggestions)
        ? (parsed?.suggestions as RemoteSuggestion[])
        : [];

      return suggestionsToProposals(suggestions, proposals);
    } catch {
      return [];
    }
  }

  abstract completeText(messages: AuxReasoningMessage[]): Promise<string | null>;
}

export class OpenAiCompatibleEnrichmentProvider
  extends BaseRemoteEnrichmentProvider
  implements EnrichmentProvider
{
  name = "openai-compatible";

  async completeText(messages: AuxReasoningMessage[]): Promise<string | null> {
    const apiKey = process.env[this.config.apiKeyEnvVar];
    if (!apiKey) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(
        `${trimTrailingSlash(this.config.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0.1,
            messages
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return payload.choices?.[0]?.message?.content ?? null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class AnthropicEnrichmentProvider
  extends BaseRemoteEnrichmentProvider
  implements EnrichmentProvider
{
  name = "anthropic";

  async completeText(messages: AuxReasoningMessage[]): Promise<string | null> {
    const apiKey = process.env[this.config.apiKeyEnvVar];
    if (!apiKey) {
      return null;
    }

    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const user = messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(
        `${trimTrailingSlash(this.config.baseUrl || "https://api.anthropic.com")}/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: 1200,
            system,
            messages: [
              {
                role: "user",
                content: user
              }
            ]
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };

      return payload.content
        ?.filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n") ?? null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GoogleEnrichmentProvider
  extends BaseRemoteEnrichmentProvider
  implements EnrichmentProvider
{
  name = "google";

  async completeText(messages: AuxReasoningMessage[]): Promise<string | null> {
    const apiKey = process.env[this.config.apiKeyEnvVar];
    if (!apiKey) {
      return null;
    }

    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const user = messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");

    const baseUrl =
      trimTrailingSlash(this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/models");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(
        `${baseUrl}/${this.config.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: system }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: user }]
              }
            ],
            generationConfig: {
              temperature: 0.1
            }
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      return payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n") ?? null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class NoopEnrichmentProvider implements EnrichmentProvider {
  name = "none";

  isConfigured(): boolean {
    return false;
  }

  async completeText(): Promise<string | null> {
    return null;
  }

  async enrich(): Promise<EnrichmentProposal[]> {
    return [];
  }
}

export function createEnrichmentProvider(
  config: EnrichmentProviderConfig
): EnrichmentProvider {
  if (config.provider === "openai" || config.provider === "openai-compatible") {
    return new OpenAiCompatibleEnrichmentProvider(config);
  }

  if (config.provider === "anthropic") {
    return new AnthropicEnrichmentProvider(config);
  }

  if (config.provider === "google") {
    return new GoogleEnrichmentProvider(config);
  }

  return new NoopEnrichmentProvider();
}
