import type { CognaiConfig } from "../../config/schema.js";
import { loadMemPalaceCoverage } from "../../mempalace/state.js";
import type { EmbeddingProvider } from "../../providers/embeddings/types.js";
import type { StorageAdapter } from "../../storage/types.js";
import { overlapScore } from "../../shared/text.js";
import type { CognaiEdge, CognaiNode, EdgeType } from "../graph/types.js";
import type {
  CognitiveContextPacket,
  CognitiveNodeSummary,
  CognitiveTensionSummary,
  CognaiQueryResult,
  MemoryLookupPlan,
  ModelReadySummary,
  ResponseGuidance
} from "./types.js";

interface QueryInput {
  intent: string;
  recent_turn_summary?: string;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! * left[index]!;
    rightMagnitude += right[index]! * right[index]!;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function classifyIntent(intent: string): string {
  const lower = intent.toLowerCase();

  if (/\b(decide|should i|choice|option|tradeoff)\b/.test(lower)) {
    return "decision";
  }

  if (/\b(strategy|positioning|plan|roadmap|brand)\b/.test(lower)) {
    return "strategy";
  }

  if (/\b(identity|value|purpose|who am i|what matters)\b/.test(lower)) {
    return "identity-values";
  }

  if (/\b(task|todo|implement|fix|build)\b/.test(lower)) {
    return "task-execution";
  }

  if (/\brelationship|friend|team|conflict|conversation\b/.test(lower)) {
    return "interpersonal";
  }

  return "general";
}

function nodeTypeWeight(classification: string, node: CognaiNode): number {
  const weightMap: Record<string, Partial<Record<CognaiNode["type"], number>>> = {
    decision: {
      Value: 1.24,
      Goal: 1.18,
      Fear: 1.16,
      Assumption: 1.13,
      Commitment: 1.08
    },
    strategy: {
      Goal: 1.2,
      Belief: 1.14,
      Assumption: 1.12,
      Value: 1.08
    },
    "identity-values": {
      Value: 1.25,
      "Identity Claim": 1.18,
      Preference: 1.12,
      Commitment: 1.05
    },
    "task-execution": {
      Goal: 1.2,
      Commitment: 1.15,
      Preference: 1.06,
      Fear: 1.08
    },
    interpersonal: {
      Value: 1.12,
      Belief: 1.1,
      Fear: 1.08,
      "Identity Claim": 1.06
    }
  };

  return weightMap[classification]?.[node.type] ?? 1;
}

function edgeTypeWeight(edgeType: EdgeType): number {
  switch (edgeType) {
    case "IN_SERVICE_OF":
      return 0.12;
    case "CONTRADICTS":
    case "CONFLICTS_WITH_BUT_HELD_IN_TENSION":
      return 0.18;
    case "PROTECTS":
    case "INHIBITS":
      return 0.14;
    case "SUPPORTS":
    case "DOWNSTREAM_OF":
      return 0.08;
    case "REVEALED_BY":
      return 0.05;
    default:
      return 0.03;
  }
}

function estimateTokens(nodes: CognaiNode[], edges: CognaiEdge[]): number {
  const text = [
    ...nodes.map((node) => `${node.type}:${node.label}:${node.description}`),
    ...edges.map((edge) => `${edge.type}:${edge.from_node_id}:${edge.to_node_id}`)
  ].join(" ");

  return Math.max(1, Math.ceil(text.length / 4));
}

function summarizeNode(node: CognaiNode, reasons?: string[]): CognitiveNodeSummary {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    description: node.description,
    confidence: node.confidence,
    reasons
  };
}

function summarizeTension(
  edge: CognaiEdge,
  nodes: Map<string, CognaiNode>
): CognitiveTensionSummary {
  return {
    id: edge.id,
    type: edge.type,
    from_node_id: edge.from_node_id,
    to_node_id: edge.to_node_id,
    from_label: nodes.get(edge.from_node_id)?.label ?? edge.from_node_id,
    to_label: nodes.get(edge.to_node_id)?.label ?? edge.to_node_id,
    confidence: edge.confidence,
    rationale:
      typeof edge.metadata.rationale === "string" ? edge.metadata.rationale : undefined
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function takeLabels(nodes: CognaiNode[], limit: number): string[] {
  return uniqueStrings(nodes.map((node) => node.label)).slice(0, limit);
}

function desiredMemoryTypesForIntent(classification: string): string[] {
  switch (classification) {
    case "decision":
      return ["past_decisions", "commitments", "project_notes", "reflections"];
    case "strategy":
      return ["project_notes", "plans", "retrospectives", "research"];
    case "identity-values":
      return ["reflections", "journals", "self_descriptions", "commitments"];
    case "task-execution":
      return ["todos", "project_notes", "recent_conversations", "blockers"];
    case "interpersonal":
      return ["recent_conversations", "relationship_notes", "reflections"];
    default:
      return ["recent_conversations", "project_notes", "reflections"];
  }
}

function suggestedAnswerShape(classification: string): string {
  switch (classification) {
    case "decision":
      return "Start with the highest-priority values, weigh the main tension, then recommend one clear direction and why.";
    case "strategy":
      return "Summarize the strategic goal, cite the key assumptions, then outline a low-regret path.";
    case "task-execution":
      return "Give a short execution recommendation, likely blocker, and the next concrete step.";
    case "identity-values":
      return "Reflect the strongest values and identity claims before offering advice.";
    case "interpersonal":
      return "Lead with likely interpersonal risks, then suggest a value-aligned response.";
    default:
      return "Answer directly, but surface the strongest values and cautions that apply.";
  }
}

export class RetrievalEngine {
  private nodeIndexKey = "";
  private adjacencyIndex = new Map<string, CognaiEdge[]>();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly topK: number,
    private readonly confidenceFloor: number,
    private readonly telosAnchorLimit: number,
    private readonly edgeTraversalHops: number,
    private readonly maxReturnedNodes: number,
    private readonly maxReturnedEdges: number,
    private readonly maxContextTokens: number,
    private readonly config?: CognaiConfig
  ) {}

  private rebuildAdjacencyIndex(nodes: CognaiNode[], edges: CognaiEdge[]): void {
    const key = `${nodes.length}:${edges.length}:${nodes.map((node) => node.id).join("|")}:${edges
      .map((edge) => edge.id)
      .join("|")}`;
    if (key === this.nodeIndexKey) {
      return;
    }

    this.nodeIndexKey = key;
    this.adjacencyIndex = new Map();

    for (const edge of edges) {
      this.adjacencyIndex.set(edge.from_node_id, [
        ...(this.adjacencyIndex.get(edge.from_node_id) ?? []),
        edge
      ]);
      this.adjacencyIndex.set(edge.to_node_id, [
        ...(this.adjacencyIndex.get(edge.to_node_id) ?? []),
        edge
      ]);
    }
  }

  private traverse(
    seedNodeIds: string[],
    edges: CognaiEdge[]
  ): { nodes: Set<string>; edges: CognaiEdge[]; tensions: CognaiEdge[] } {
    const allowedTypes: EdgeType[] = [
      "IN_SERVICE_OF",
      "CONTRADICTS",
      "CONFLICTS_WITH_BUT_HELD_IN_TENSION",
      "PROTECTS",
      "INHIBITS",
      "REVEALED_BY",
      "SUPPORTS",
      "DOWNSTREAM_OF"
    ];
    const visitedNodes = new Set<string>(seedNodeIds);
    const visitedEdges = new Map<string, CognaiEdge>();
    const tensions = new Map<string, CognaiEdge>();
    let frontier = new Set<string>(seedNodeIds);

    for (let hop = 0; hop < this.edgeTraversalHops; hop += 1) {
      const next = new Set<string>();

      for (const nodeId of frontier) {
        for (const edge of this.adjacencyIndex.get(nodeId) ?? []) {
          if (!allowedTypes.includes(edge.type)) {
            continue;
          }

          visitedEdges.set(edge.id, edge);
          visitedNodes.add(edge.from_node_id);
          visitedNodes.add(edge.to_node_id);
          next.add(edge.from_node_id);
          next.add(edge.to_node_id);

          if (
            edge.type === "CONTRADICTS" ||
            edge.type === "CONFLICTS_WITH_BUT_HELD_IN_TENSION" ||
            edge.type === "INHIBITS"
          ) {
            tensions.set(edge.id, edge);
          }
        }
      }

      frontier = next;
    }

    return {
      nodes: visitedNodes,
      edges: [...visitedEdges.values()],
      tensions: [...tensions.values()]
    };
  }

  private buildMemoryLookupPlan(
    classification: string,
    anchors: CognaiNode[],
    selectedNodes: CognaiNode[],
    tensions: CognitiveTensionSummary[],
    provenance: {
      wing_hints: string[];
      room_hints: string[];
      drawer_hints: string[];
      bootstrapOnly: boolean;
    },
    coverageStatus: "full" | "partial" | "unknown"
  ): MemoryLookupPlan {
    const anchorLabels = anchors.map((node) => node.label);
    const fearLabels = selectedNodes
      .filter((node) => node.type === "Fear")
      .map((node) => node.label);
    const goalLabels = selectedNodes
      .filter((node) => node.type === "Goal" || node.type === "Commitment")
      .map((node) => node.label);
    const assumptionLabels = selectedNodes
      .filter((node) => node.type === "Assumption")
      .map((node) => node.label);
    const entityLabels = selectedNodes
      .filter(
        (node) =>
          node.type === "Identity Claim" ||
          node.type === "Value" ||
          node.type === "Goal"
      )
      .map((node) => node.label);

    return {
      memory_system:
        this.config?.connectors.mempalace.enabled &&
        provenance.wing_hints.length + provenance.room_hints.length + provenance.drawer_hints.length > 0
          ? "mempalace"
          : "generic",
      suggested_queries: uniqueStrings([
        ...anchorLabels.map((label) => `memories about ${label}`),
        ...goalLabels.map((label) => `times I pursued ${label}`),
        ...fearLabels.map((label) => `past evidence around ${label}`),
        ...assumptionLabels.map((label) => `evidence confirming or disproving ${label}`)
      ]).slice(0, 6),
      entities: uniqueStrings(entityLabels).slice(0, 6),
      time_windows:
        classification === "decision"
          ? ["recent similar decisions", "past 6-12 months", "earlier successful examples"]
          : ["recent relevant history", "past similar situations"],
      desired_memory_types: desiredMemoryTypesForIntent(classification),
      questions: uniqueStrings([
        anchorLabels[0]
          ? `What past situations best reflect the value "${anchorLabels[0]}"?`
          : "",
        goalLabels[0]
          ? `What past decisions or projects are closest to the goal "${goalLabels[0]}"?`
          : "",
        fearLabels[0]
          ? `What evidence supports or weakens the concern "${fearLabels[0]}"?`
          : "",
        tensions[0]
          ? `When have these competing pressures shown up together before?`
          : ""
      ]).slice(0, 4),
      lookup_order: [
        "Start with high-confidence value and goal matches.",
        "Then retrieve evidence related to fears, assumptions, and tensions.",
        "Finally, pull recent outcomes or resolutions that update the picture."
      ],
      wing_hints: provenance.wing_hints,
      room_hints: provenance.room_hints,
      drawer_hints: provenance.drawer_hints,
      tool_sequence:
        this.config?.connectors.mempalace.enabled
          ? [
              "mempalace_search",
              "mempalace_get_drawer",
              "mempalace_traverse",
              "mempalace_kg_query"
            ]
          : ["memory_search", "memory_get_item"],
      coverage_status: coverageStatus,
      rationale:
        "This plan is designed to help the AI client ask the memory system for concrete evidence before it answers."
    };
  }

  private buildResponseGuidance(
    classification: string,
    anchors: CognaiNode[],
    selectedNodes: CognaiNode[],
    tensions: CognitiveTensionSummary[]
  ): ResponseGuidance {
    const priorities = uniqueStrings([
      ...anchors.map((node) => `Protect ${node.label}.`),
      ...selectedNodes
        .filter((node) => node.type === "Goal" || node.type === "Commitment")
        .map((node) => `Keep progress on ${node.label}.`)
    ]).slice(0, 4);
    const cautions = uniqueStrings([
      ...selectedNodes
        .filter((node) => node.type === "Fear" || node.type === "Assumption")
        .map((node) => `${node.type}: ${node.label}`),
      ...tensions.map((tension) => `Tension: ${tension.from_label} ${tension.type} ${tension.to_label}`)
    ]).slice(0, 4);

    return {
      priorities,
      cautions,
      suggested_answer_shape: suggestedAnswerShape(classification)
    };
  }

  private buildModelReadySummary(
    classification: string,
    retrievalConfidence: number,
    anchors: CognaiNode[],
    selectedNodes: CognaiNode[],
    tensions: CognitiveTensionSummary[],
    memoryLookupPlan: MemoryLookupPlan,
    responseGuidance: ResponseGuidance,
    warnings: string[]
  ): ModelReadySummary {
    const anchorLabels = takeLabels(anchors, 3);
    const goalLabels = takeLabels(
      selectedNodes.filter((node) => node.type === "Goal" || node.type === "Commitment"),
      4
    );
    const beliefLabels = takeLabels(
      selectedNodes.filter(
        (node) => node.type === "Belief" || node.type === "Identity Claim" || node.type === "Assumption"
      ),
      4
    );
    const fearLabels = takeLabels(
      selectedNodes.filter((node) => node.type === "Fear"),
      3
    );
    const preferenceLabels = takeLabels(
      selectedNodes.filter((node) => node.type === "Preference"),
      3
    );
    const tensionLabels = uniqueStrings(
      tensions.map((tension) => `${tension.from_label} ${tension.type} ${tension.to_label}`)
    ).slice(0, 3);
    const cautionLines = uniqueStrings([
      ...responseGuidance.cautions,
      ...warnings
    ]).slice(0, 4);
    const keyPoints = uniqueStrings([
      ...anchorLabels.map((label) => `Value: ${label}`),
      ...goalLabels.map((label) => `Goal: ${label}`),
      ...beliefLabels.map((label) => `Belief/assumption: ${label}`),
      ...fearLabels.map((label) => `Fear: ${label}`),
      ...preferenceLabels.map((label) => `Preference: ${label}`)
    ]).slice(0, 8);

    const promptLines = [
      `Intent class: ${classification}`,
      `Retrieval confidence: ${retrievalConfidence.toFixed(2)}`,
      anchorLabels.length > 0 ? `Top values: ${anchorLabels.join("; ")}` : "",
      goalLabels.length > 0 ? `Active goals and commitments: ${goalLabels.join("; ")}` : "",
      beliefLabels.length > 0
        ? `Beliefs and assumptions affecting this answer: ${beliefLabels.join("; ")}`
        : "",
      fearLabels.length > 0 ? `Key fears: ${fearLabels.join("; ")}` : "",
      preferenceLabels.length > 0 ? `Relevant preferences: ${preferenceLabels.join("; ")}` : "",
      tensionLabels.length > 0 ? `Important tensions: ${tensionLabels.join("; ")}` : "",
      responseGuidance.priorities.length > 0
        ? `Priorities for the answer: ${responseGuidance.priorities.join("; ")}`
        : "",
      cautionLines.length > 0 ? `Cautions: ${cautionLines.join("; ")}` : "",
      memoryLookupPlan.questions.length > 0
        ? `Memory follow-up questions: ${memoryLookupPlan.questions.join("; ")}`
        : "",
      memoryLookupPlan.coverage_status !== "full"
        ? `MemPalace coverage: ${memoryLookupPlan.coverage_status}; live search required before answering confidently.`
        : "",
      `Suggested answer shape: ${responseGuidance.suggested_answer_shape}`
    ].filter(Boolean);

    const promptContext = promptLines.join("\n");

    return {
      prompt_context: promptContext,
      token_estimate: Math.max(1, Math.ceil(promptContext.length / 4)),
      anchors: anchorLabels,
      active_goals: goalLabels,
      key_points: keyPoints,
      active_tensions: tensionLabels,
      cautions: cautionLines,
      memory_questions: memoryLookupPlan.questions.slice(0, 4),
      answer_shape: responseGuidance.suggested_answer_shape,
      coverage_note:
        memoryLookupPlan.coverage_status !== "full"
          ? `MemPalace coverage for this topic is ${memoryLookupPlan.coverage_status}; live search required before answering confidently.`
          : undefined
    };
  }

  private async resolveCoverageStatus(): Promise<"full" | "partial" | "unknown"> {
    if (!this.config?.connectors.mempalace.enabled) {
      return "unknown";
    }

    const coverage = await loadMemPalaceCoverage(this.config);
    return coverage.coverage_status;
  }

  private async collectMemPalaceHints(selectedNodes: CognaiNode[]): Promise<{
    wing_hints: string[];
    room_hints: string[];
    drawer_hints: string[];
    bootstrapOnly: boolean;
  }> {
    const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
    const episodes = await this.storage.listEpisodes();
    const relevant = episodes.filter(
      (episode) =>
        episode.metadata.external_system === "mempalace" &&
        episode.inferred_node_ids.some((nodeId) => selectedNodeIds.has(nodeId))
    );

    const wingCounts = new Map<string, number>();
    const roomCounts = new Map<string, number>();
    const drawerCounts = new Map<string, number>();
    let bootstrapOnly = relevant.length > 0;

    for (const episode of relevant) {
      const wing =
        typeof episode.metadata.wing === "string" ? episode.metadata.wing : "";
      const room =
        typeof episode.metadata.room === "string" ? episode.metadata.room : "";
      const drawerId =
        typeof episode.metadata.drawer_id === "string" ? episode.metadata.drawer_id : "";
      const ingestMode =
        typeof episode.metadata.ingest_mode === "string"
          ? episode.metadata.ingest_mode
          : "";

      if (wing) {
        wingCounts.set(wing, (wingCounts.get(wing) ?? 0) + 1);
      }
      if (room) {
        roomCounts.set(room, (roomCounts.get(room) ?? 0) + 1);
      }
      if (drawerId) {
        drawerCounts.set(drawerId, (drawerCounts.get(drawerId) ?? 0) + 1);
      }
      if (!ingestMode.startsWith("bootstrap_")) {
        bootstrapOnly = false;
      }
    }

    const topValues = (map: Map<string, number>, limit: number) =>
      [...map.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([value]) => value)
        .slice(0, limit);

    return {
      wing_hints: topValues(wingCounts, 3),
      room_hints: topValues(roomCounts, 4),
      drawer_hints: topValues(drawerCounts, 5),
      bootstrapOnly
    };
  }

  async query(input: string | QueryInput): Promise<CognaiQueryResult> {
    const intent = typeof input === "string" ? input : input.intent;
    const recentTurnSummary =
      typeof input === "string" ? "" : input.recent_turn_summary ?? "";
    const combinedIntent = [intent, recentTurnSummary].filter(Boolean).join("\n");

    const nodes = await this.storage.listNodes();
    const allEdges = await this.storage.listEdges();
    this.rebuildAdjacencyIndex(nodes, allEdges);

    const classification = classifyIntent(combinedIntent);
    const anchors = await this.storage.getTopValueNodes(this.telosAnchorLimit);
    const intentVector = await this.embeddingProvider.embedText(combinedIntent);
    const anchorIds = new Set(anchors.map((node) => node.id));
    const selectionReasons = new Map<string, string[]>();
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const scored = nodes
      .map((node) => {
        const lexical = overlapScore(combinedIntent, `${node.label} ${node.description}`);
        const vector = cosineSimilarity(node.embedding ?? [], intentVector);
        const typeWeight = nodeTypeWeight(classification, node);
        const edgeConnectedness = allEdges.some(
          (edge) =>
            (edge.from_node_id === node.id && anchorIds.has(edge.to_node_id)) ||
            (edge.to_node_id === node.id && anchorIds.has(edge.from_node_id))
        )
          ? 0.12
          : 0;
        const tensionBoost = allEdges.some(
          (edge) =>
            (edge.from_node_id === node.id || edge.to_node_id === node.id) &&
            (edge.type === "CONTRADICTS" ||
              edge.type === "CONFLICTS_WITH_BUT_HELD_IN_TENSION" ||
              edge.type === "INHIBITS")
        )
          ? 0.15
          : 0;
        const score = Math.min(
          1,
          (lexical * 0.52 + vector * 0.18 + edgeConnectedness + tensionBoost) * typeWeight
        );
        const reasons: string[] = [];

        if (lexical > 0.16) {
          reasons.push("lexical overlap");
        }
        if (vector > 0.18) {
          reasons.push("vector similarity");
        }
        if (typeWeight > 1) {
          reasons.push(`intent-weighted ${node.type.toLowerCase()} node`);
        }
        if (edgeConnectedness > 0) {
          reasons.push("connected to a telos anchor");
        }
        if (tensionBoost > 0) {
          reasons.push("tension-aware boost");
        }

        selectionReasons.set(node.id, reasons);

        return { node, score };
      })
      .sort((left, right) => right.score - left.score)
      .filter((entry) => entry.score > 0)
      .slice(0, this.topK);

    const traversed = this.traverse(
      uniqueStrings([
        ...anchors.map((node) => node.id),
        ...scored.map((entry) => entry.node.id)
      ]),
      allEdges
    );

    const orderedRelevantNodes = [
      ...anchors,
      ...scored.map((entry) => entry.node),
      ...[...traversed.nodes]
        .map((id) => nodesById.get(id))
        .filter((node): node is CognaiNode => Boolean(node))
    ];
    const dedupedRelevantNodes = [...new Map(orderedRelevantNodes.map((node) => [node.id, node])).values()];
    const prunedNodeLabels = dedupedRelevantNodes
      .slice(this.maxReturnedNodes)
      .map((node) => node.label);
    const relevantNodes = dedupedRelevantNodes.slice(0, this.maxReturnedNodes);
    const relevantNodeIds = new Set(relevantNodes.map((node) => node.id));

    const orderedRelevantEdges = traversed.edges
      .filter(
        (edge) =>
          relevantNodeIds.has(edge.from_node_id) && relevantNodeIds.has(edge.to_node_id)
      )
      .sort((left, right) => edgeTypeWeight(right.type) - edgeTypeWeight(left.type));
    const relevantEdges = orderedRelevantEdges.slice(0, this.maxReturnedEdges);
    const activeTensions = traversed.tensions
      .filter(
        (edge) =>
          relevantNodeIds.has(edge.from_node_id) && relevantNodeIds.has(edge.to_node_id)
      )
      .slice(0, this.maxReturnedEdges);

    const estimatedTokens = estimateTokens(relevantNodes, relevantEdges);
    const memPalaceHints = await this.collectMemPalaceHints(relevantNodes);
    const coverageStatus = await this.resolveCoverageStatus();
    const retrievalConfidence =
      relevantNodes.length > 0
        ? Math.min(
            0.96,
            Number(
              (
                (scored.reduce((sum, entry) => sum + entry.score, 0) /
                  Math.max(1, scored.length)) *
                0.68 +
                Math.min(anchors.length, 2) * 0.08 +
                Math.min(
                  activeTensions.reduce((sum, edge) => sum + edgeTypeWeight(edge.type), 0),
                  0.18
                )
              ).toFixed(2)
            )
          )
        : 0.28;
    const warnings: string[] = [];

    if (!this.embeddingProvider.isConfigured()) {
      warnings.push(
        "Embedding provider is not configured. Retrieval is relying on lexical matching and deterministic local vectors."
      );
    }

    if (relevantNodes.length === 0) {
      warnings.push("No high-similarity nodes were found for this intent.");
    }

    if (anchors.length === 0) {
      warnings.push("No Value nodes are available yet, so telos anchoring is sparse.");
    }

    if (scored.length < 2) {
      warnings.push("Context is still sparse, so this result should be treated as low-confidence scaffolding.");
    }

    if (anchors.length === 0 && classification === "decision") {
      warnings.push("No strong telos anchor was found for this decision-oriented query.");
    }

    if (estimatedTokens > this.maxContextTokens) {
      warnings.push("Context budget was exceeded before assembly, so low-priority items were pruned.");
    }

    if (
      this.config?.connectors.mempalace.enabled &&
      coverageStatus !== "full"
    ) {
      warnings.push(
        `MemPalace coverage is ${coverageStatus} for this workspace, so a live memory search is still recommended before answering confidently.`
      );
    }

    if (memPalaceHints.bootstrapOnly) {
      warnings.push(
        "Selected context is leaning on bootstrap-only MemPalace evidence, so live search should confirm the final answer."
      );
    }

    const tensionSummaries = activeTensions.map((edge) => summarizeTension(edge, nodesById));
    const cognitiveContext: CognitiveContextPacket = {
      anchors: anchors.map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      goals: relevantNodes
        .filter((node) => node.type === "Goal" || node.type === "Commitment")
        .map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      beliefs: relevantNodes
        .filter((node) => node.type === "Belief" || node.type === "Identity Claim")
        .map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      fears: relevantNodes
        .filter((node) => node.type === "Fear")
        .map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      assumptions: relevantNodes
        .filter((node) => node.type === "Assumption")
        .map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      preferences: relevantNodes
        .filter((node) => node.type === "Preference")
        .map((node) => summarizeNode(node, selectionReasons.get(node.id))),
      tensions: tensionSummaries,
      subgraph: {
        telos_anchors: anchors,
        relevant_nodes: relevantNodes,
        relevant_edges: relevantEdges,
        active_tensions: activeTensions,
        confidence_floor_met: retrievalConfidence >= this.confidenceFloor,
        estimated_tokens: estimatedTokens,
        truncated:
          prunedNodeLabels.length > 0 ||
          orderedRelevantEdges.length > relevantEdges.length ||
          estimatedTokens > this.maxContextTokens
      }
    };

    const memoryLookupPlan = this.buildMemoryLookupPlan(
      classification,
      anchors,
      relevantNodes,
      tensionSummaries,
      memPalaceHints,
      coverageStatus
    );
    const responseGuidance = this.buildResponseGuidance(
      classification,
      anchors,
      relevantNodes,
      tensionSummaries
    );
    const modelReadySummary = this.buildModelReadySummary(
      classification,
      retrievalConfidence,
      anchors,
      relevantNodes,
      tensionSummaries,
      memoryLookupPlan,
      responseGuidance,
      warnings
    );

    return {
      cognitive_context: cognitiveContext,
      memory_lookup_plan: memoryLookupPlan,
      response_guidance: responseGuidance,
      model_ready_summary: modelReadySummary,
      transparency: {
        classification,
        telos_anchors: anchors.map((node) => node.label),
        matched_nodes: scored.map((entry) => entry.node.label),
        traversed_nodes: [...traversed.nodes]
          .map((id) => nodesById.get(id)?.label ?? id)
          .slice(0, this.maxReturnedNodes),
        surfaced_tensions: tensionSummaries.map(
          (edge) => `${edge.from_label} ${edge.type} ${edge.to_label}`
        ),
        selected_nodes: relevantNodes.map((node) => ({
          label: node.label,
          type: node.type,
          score: Number((scored.find((entry) => entry.node.id === node.id)?.score ?? 0).toFixed(3)),
          reasons: selectionReasons.get(node.id) ?? []
        })),
        pruned_nodes: prunedNodeLabels,
        estimated_context_tokens: estimatedTokens,
        why:
          relevantNodes.length > 0
            ? "Intent was classified, telos anchors were pulled first, then lexical similarity, optional vectors, graph traversal, and available MemPalace provenance were used to build a reasoning packet plus a memory lookup plan."
            : "No strong matches were found, so the response is leaning on anchors and explicit sparse-context warnings.",
        warnings
      },
      retrieval_confidence: retrievalConfidence,
      warnings
    };
  }
}
