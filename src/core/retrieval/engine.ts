import type { EmbeddingProvider } from "../../providers/embeddings/types.js";
import type { StorageAdapter } from "../../storage/types.js";
import { overlapScore } from "../../shared/text.js";
import type { CognaiEdge, CognaiNode, EdgeType } from "../graph/types.js";
import type { CognaiQueryResult } from "./types.js";

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
      Value: 1.2,
      Goal: 1.15,
      Fear: 1.12,
      Assumption: 1.1,
      Commitment: 1.05
    },
    strategy: {
      Goal: 1.2,
      Belief: 1.12,
      Assumption: 1.1,
      Value: 1.08
    },
    "identity-values": {
      Value: 1.25,
      "Identity Claim": 1.2,
      Preference: 1.1,
      Commitment: 1.05
    },
    "task-execution": {
      Goal: 1.18,
      Commitment: 1.15,
      Preference: 1.05,
      Fear: 1.05
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

export class RetrievalEngine {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly topK: number,
    private readonly confidenceFloor: number,
    private readonly telosAnchorLimit: number,
    private readonly edgeTraversalHops: number
  ) {}

  async query(intent: string): Promise<CognaiQueryResult> {
    const nodes = await this.storage.listNodes();
    const allEdges = await this.storage.listEdges();
    const classification = classifyIntent(intent);
    const anchors = await this.storage.getTopValueNodes(this.telosAnchorLimit);
    const intentVector = await this.embeddingProvider.embedText(intent);
    const anchorIds = new Set(anchors.map((node) => node.id));
    const selectionReasons = new Map<string, string[]>();

    const scored = nodes
      .map((node) => {
        const lexical = overlapScore(intent, `${node.label} ${node.description}`);
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
          reasons.push("local vector similarity");
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

        return {
          node,
          score
        };
      })
      .sort((left, right) => right.score - left.score)
      .filter((entry) => entry.score > 0)
      .slice(0, this.topK);
    const traversedNodeMap = new Map<string, CognaiNode>();
    const traversedTensions = new Map<string, CognaiEdge>();
    const traversalEdgeTypes: EdgeType[] = [
      "IN_SERVICE_OF",
      "CONTRADICTS",
      "CONFLICTS_WITH_BUT_HELD_IN_TENSION",
      "PROTECTS",
      "INHIBITS",
      "REVEALED_BY",
      "SUPPORTS",
      "DOWNSTREAM_OF"
    ];
    let traversalBoost = 0;

    for (const match of scored) {
      const subgraph = await this.storage.traverseEdges(
        match.node.id,
        traversalEdgeTypes,
        this.edgeTraversalHops
      );
      for (const node of subgraph.relevant_nodes) {
        traversedNodeMap.set(node.id, node);
      }
      for (const edge of subgraph.active_tensions) {
        traversedTensions.set(edge.id, edge);
        traversalBoost += edgeTypeWeight(edge.type);
      }
    }

    const relevantNodes: CognaiNode[] = [
      ...new Map([
        ...anchors.map((node) => [node.id, node] as const),
        ...scored.map((entry) => [entry.node.id, entry.node] as const),
        ...[...traversedNodeMap.values()].map((node) => [node.id, node] as const)
      ]).values()
    ];
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
                Math.min(traversalBoost, 0.18)
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

    return {
      subgraph: {
        telos_anchors: anchors,
        relevant_nodes: relevantNodes,
        active_tensions: [...traversedTensions.values()],
        confidence_floor_met: retrievalConfidence >= this.confidenceFloor
      },
      transparency: {
        classification,
        telos_anchors: anchors.map((node) => node.label),
        matched_nodes: scored.map((entry) => entry.node.label),
        traversed_nodes: [...traversedNodeMap.values()].map((node) => node.label),
        surfaced_tensions: [...traversedTensions.values()].map(
          (edge) => `${edge.from_node_id} ${edge.type} ${edge.to_node_id}`
        ),
        selected_nodes: scored.map((entry) => ({
          label: entry.node.label,
          type: entry.node.type,
          score: Number(entry.score.toFixed(3)),
          reasons: selectionReasons.get(entry.node.id) ?? []
        })),
        why:
          relevantNodes.length > 0
            ? "Intent was classified, telos anchors were pulled first, then lexical similarity, intent-weighted ranking, optional vectors, and prioritized edge traversal expanded the returned subgraph."
            : "No strong matches were found, so the response is leaning on anchors and explicit sparse-context warnings.",
        warnings
      },
      retrieval_confidence: retrievalConfidence,
      warnings
    };
  }
}
