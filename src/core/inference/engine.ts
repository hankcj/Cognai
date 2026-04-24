import type { EmbeddingProvider } from "../../providers/embeddings/types.js";
import type { EnrichmentProvider } from "../../providers/enrichment/types.js";
import { createId } from "../../shared/ids.js";
import { overlapScore, tokenize, truncate } from "../../shared/text.js";
import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { CognaiEdge, CognaiNode, NodeType } from "../graph/types.js";
import type { InferenceProposal, InferenceResult } from "./types.js";

interface CandidateDefinition {
  type: NodeType;
  patterns: RegExp[];
  construal: CognaiNode["construal_level"];
  confidence: number;
  rationale: string;
}

interface ExtractedCandidate {
  type: NodeType;
  label: string;
  description: string;
  construal_level: CognaiNode["construal_level"];
  confidence: number;
  metadata: Record<string, unknown>;
}

const CANDIDATE_DEFINITIONS: CandidateDefinition[] = [
  {
    type: "Value",
    patterns: [
      /i care about ([^.?!]+)/i,
      /what matters to me is ([^.?!]+)/i,
      /i value ([^.?!]+)/i,
      /it'?s important to me to ([^.?!]+)/i
    ],
    construal: "high",
    confidence: 0.82,
    rationale: "Matched explicit value language."
  },
  {
    type: "Goal",
    patterns: [
      /i want to ([^.?!]+)/i,
      /my goal is to ([^.?!]+)/i,
      /i am trying to ([^.?!]+)/i,
      /i need to ([^.?!]+)/i
    ],
    construal: "mid",
    confidence: 0.74,
    rationale: "Matched explicit goal language."
  },
  {
    type: "Commitment",
    patterns: [
      /i will ([^.?!]+)/i,
      /i am committed to ([^.?!]+)/i,
      /i have committed to ([^.?!]+)/i
    ],
    construal: "mid",
    confidence: 0.78,
    rationale: "Matched explicit commitment language."
  },
  {
    type: "Preference",
    patterns: [
      /i prefer ([^.?!]+)/i,
      /i like ([^.?!]+)/i,
      /i tend to choose ([^.?!]+)/i
    ],
    construal: "low",
    confidence: 0.68,
    rationale: "Matched explicit preference language."
  },
  {
    type: "Identity Claim",
    patterns: [
      /i am the kind of person who ([^.?!]+)/i,
      /i am someone who ([^.?!]+)/i,
      /i am ([^.?!]+)/i
    ],
    construal: "high",
    confidence: 0.72,
    rationale: "Matched identity framing."
  },
  {
    type: "Belief",
    patterns: [
      /i believe ([^.?!]+)/i,
      /i think ([^.?!]+)/i,
      /i know ([^.?!]+)/i
    ],
    construal: "mid",
    confidence: 0.64,
    rationale: "Matched explicit belief language."
  },
  {
    type: "Fear",
    patterns: [
      /i fear ([^.?!]+)/i,
      /i(?:'m| am) afraid (?:that )?([^.?!]+)/i,
      /i(?:'m| am) worried (?:that )?([^.?!]+)/i,
      /i worry (?:that )?([^.?!]+)/i
    ],
    construal: "mid",
    confidence: 0.66,
    rationale: "Matched protective or risk-oriented language."
  },
  {
    type: "Assumption",
    patterns: [
      /i assume ([^.?!]+)/i,
      /i(?:'m| am) assuming ([^.?!]+)/i,
      /assuming ([^.?!]+)/i,
      /i take for granted that ([^.?!]+)/i
    ],
    construal: "low",
    confidence: 0.46,
    rationale: "Matched assumption or conditional language."
  }
];

function inferPolarity(content: string): "positive" | "negative" {
  return /\b(not|never|don't|cant|can't|won't|no longer|avoid|afraid|worried|fear)\b/i.test(
    content
  )
    ? "negative"
    : "positive";
}

function createCandidate(
  content: string,
  definition: CandidateDefinition
): ExtractedCandidate[] {
  const matches: ExtractedCandidate[] = [];

  for (const pattern of definition.patterns) {
    const match = content.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const fragment = match[1].trim();
    const polarity = inferPolarity(content);
    matches.push({
      type: definition.type,
      label: truncate(fragment, 64),
      description: fragment,
      construal_level: definition.construal,
      confidence: definition.confidence,
      metadata: {
        polarity,
        extracted_from: content,
        extraction_rationale: definition.rationale,
        confidence_explanation:
          definition.type === "Assumption"
            ? "Assumptions stay lower-confidence by default because they are implicit and revisable."
            : "Confidence reflects explicit language strength in the source message."
      }
    });
  }

  return matches;
}

export class InferenceEngine {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly enrichmentProvider: EnrichmentProvider
  ) {}

  async analyzeConversation(
    envelope: CanonicalConversationEnvelope
  ): Promise<InferenceResult> {
    const episodes = envelope.messages.map((message) => ({
      id: createId(),
      conversation_id: envelope.conversation.id,
      timestamp: message.timestamp,
      utterance: message.content,
      speaker: message.role,
      inferred_node_ids: [] as string[],
      metadata: {
        source: envelope.source,
        message_id: message.id,
        source_message_id:
          typeof message.metadata.source_id === "string"
            ? message.metadata.source_id
            : message.id
      }
    }));
    const proposals: InferenceProposal[] = [];
    const seenKeys = new Set<string>();
    const messageNodeMap = new Map<string, string[]>();

    for (const message of envelope.messages) {
      if (message.role !== "user" || message.content.trim().length === 0) {
        continue;
      }

      const targetEpisode =
        episodes.find((episode) => episode.metadata.message_id === message.id) ?? episodes[0];
      if (!targetEpisode) {
        continue;
      }

      const candidates = CANDIDATE_DEFINITIONS.flatMap((definition) =>
        createCandidate(message.content, definition)
      );

      for (const candidate of candidates) {
        const candidateKey = `${candidate.type}:${tokenize(candidate.label).join(" ")}`;
        if (!candidate.label || seenKeys.has(candidateKey)) {
          continue;
        }
        seenKeys.add(candidateKey);

        const now = new Date().toISOString();
        const node: CognaiNode = {
          id: createId(),
          type: candidate.type,
          label: candidate.label,
          description: candidate.description,
          embedding: await this.embeddingProvider.embedText(candidate.description),
          source: "inferred",
          confidence: candidate.confidence,
          activation: candidate.type === "Fear" ? 0.62 : 0.55,
          centrality:
            candidate.type === "Value"
              ? 0.8
              : candidate.type === "Fear"
                ? 0.52
                : 0.35,
          construal_level: candidate.construal_level,
          created_at: now,
          updated_at: now,
          last_reinforced_at: now,
          metadata: {
            ...candidate.metadata,
            conversation_source: envelope.source,
            originating_source_type: envelope.source
          }
        };

        targetEpisode.inferred_node_ids.push(node.id);
        messageNodeMap.set(message.id, [...(messageNodeMap.get(message.id) ?? []), node.id]);

        const edges: CognaiEdge[] = [
          {
            id: createId(),
            from_node_id: node.id,
            to_node_id: targetEpisode.id,
            type: "REVEALED_BY",
            confidence: node.confidence,
            source: "inferred",
            created_at: now,
            metadata: {
              extracted_from_message_id: message.id
            }
          }
        ];

        proposals.push({
          origin: "deterministic",
          reason: `Deterministic extraction from message "${truncate(message.content, 72)}".`,
          node,
          edges,
          contradictionTargets: []
        });
      }
    }

    const values = proposals.filter((proposal) => proposal.node.type === "Value");
    const goals = proposals.filter(
      (proposal) => proposal.node.type === "Goal" || proposal.node.type === "Commitment"
    );
    const fears = proposals.filter((proposal) => proposal.node.type === "Fear");
    const assumptions = proposals.filter((proposal) => proposal.node.type === "Assumption");

    for (const goal of goals) {
      const siblingValue = values.find((value) =>
        overlapScore(goal.node.description, value.node.description) >= 0.18
      );
      const targetValue = siblingValue ?? values[0];
      if (!targetValue) {
        continue;
      }

      goal.edges.push({
        id: createId(),
        from_node_id: goal.node.id,
        to_node_id: targetValue.node.id,
        type: "IN_SERVICE_OF",
        confidence: siblingValue ? 0.67 : 0.58,
        source: "inferred",
        created_at: new Date().toISOString(),
        metadata: {
          rationale: siblingValue ? "lexical-value-link" : "single-value-anchor"
        }
      });
    }

    for (const fear of fears) {
      const targetGoal = goals.find((goal) =>
        overlapScore(goal.node.description, fear.node.description) >= 0.18
      ) ?? goals[0];
      const targetValue = values.find((value) =>
        overlapScore(value.node.description, fear.node.description) >= 0.14
      ) ?? values[0];

      if (targetGoal) {
        fear.edges.push({
          id: createId(),
          from_node_id: fear.node.id,
          to_node_id: targetGoal.node.id,
          type: "INHIBITS",
          confidence: 0.61,
          source: "inferred",
          created_at: new Date().toISOString(),
          metadata: {
            rationale: "fear-goal-link"
          }
        });
      }

      if (targetValue) {
        fear.edges.push({
          id: createId(),
          from_node_id: fear.node.id,
          to_node_id: targetValue.node.id,
          type: "PROTECTS",
          confidence: 0.59,
          source: "inferred",
          created_at: new Date().toISOString(),
          metadata: {
            rationale: "fear-value-protection-link"
          }
        });
      }

      if (targetGoal && targetValue) {
        fear.edges.push({
          id: createId(),
          from_node_id: fear.node.id,
          to_node_id: targetGoal.node.id,
          type: "CONFLICTS_WITH_BUT_HELD_IN_TENSION",
          confidence: 0.49,
          source: "inferred",
          created_at: new Date().toISOString(),
          metadata: {
            protected_value_node_id: targetValue.node.id,
            rationale: "fear protects a value while inhibiting a goal."
          }
        });
      }
    }

    for (const assumption of assumptions) {
      const targetBelief = proposals.find(
        (proposal) =>
          proposal.node.type === "Belief" &&
          overlapScore(proposal.node.description, assumption.node.description) >= 0.16
      );

      if (targetBelief) {
        assumption.edges.push({
          id: createId(),
          from_node_id: targetBelief.node.id,
          to_node_id: assumption.node.id,
          type: "ASSUMES",
          confidence: 0.52,
          source: "inferred",
          created_at: new Date().toISOString(),
          metadata: {
            rationale: "belief appears to rest on a named assumption."
          }
        });
      }
    }

    for (let index = 0; index < proposals.length; index += 1) {
      const left = proposals[index]!;
      for (let otherIndex = index + 1; otherIndex < proposals.length; otherIndex += 1) {
        const right = proposals[otherIndex]!;
        if (left.node.type !== right.node.type) {
          continue;
        }

        const leftPolarity = left.node.metadata.polarity;
        const rightPolarity = right.node.metadata.polarity;
        const similarity = overlapScore(left.node.description, right.node.description);
        if (
          leftPolarity &&
          rightPolarity &&
          leftPolarity !== rightPolarity &&
          similarity >= 0.46
        ) {
          left.contradictionTargets?.push(right.node.id);
          right.contradictionTargets?.push(left.node.id);
        }
      }
    }

    const annotations: string[] = [];
    const enrichmentApplied = this.enrichmentProvider.isConfigured();
    if (enrichmentApplied) {
      const enriched = await this.enrichmentProvider.enrich(envelope, proposals);
      for (const candidate of enriched) {
        const dedupeKey = `${candidate.proposal.node.type}:${tokenize(
          candidate.proposal.node.label
        ).join(" ")}`;
        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);
        candidate.proposal.node.embedding = await this.embeddingProvider.embedText(
          candidate.proposal.node.description
        );
        proposals.push(candidate.proposal);
        if (candidate.annotation) {
          annotations.push(candidate.annotation);
        }
      }
    }

    return {
      envelope,
      episodes,
      proposals,
      enrichmentApplied,
      annotations
    };
  }
}
