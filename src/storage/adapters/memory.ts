import type { EpisodeRecord } from "../../core/episodes/types.js";
import type {
  CognaiEdge,
  CognaiNode,
  CognaiSubgraph,
  EdgeType,
  FlagType,
  GraphSummary
} from "../../core/graph/types.js";
import type { StorageAdapter } from "../types.js";

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

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = "memory";

  private nodes = new Map<string, CognaiNode>();
  private edges = new Map<string, CognaiEdge>();
  private episodes = new Map<string, EpisodeRecord>();

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async writeNode(node: CognaiNode): Promise<void> {
    this.nodes.set(node.id, node);
  }

  async updateNode(id: string, updates: Partial<CognaiNode>): Promise<void> {
    const current = this.nodes.get(id);
    if (!current) {
      return;
    }

    this.nodes.set(id, { ...current, ...updates });
  }

  async writeEdge(edge: CognaiEdge): Promise<void> {
    this.edges.set(edge.id, edge);
  }

  async getNode(id: string): Promise<CognaiNode | undefined> {
    return this.nodes.get(id);
  }

  async listNodes(): Promise<CognaiNode[]> {
    return [...this.nodes.values()];
  }

  async listEdges(): Promise<CognaiEdge[]> {
    return [...this.edges.values()];
  }

  async queryByEmbedding(_vector: number[], topK: number): Promise<CognaiNode[]> {
    return (await this.listNodes())
      .map((node) => ({
        node,
        score: cosineSimilarity(node.embedding ?? [], _vector)
      }))
      .sort((left, right) => right.score - left.score)
      .filter((entry) => entry.score > 0)
      .slice(0, topK)
      .map((entry) => entry.node);
  }

  async traverseEdges(
    nodeId: string,
    edgeTypes: EdgeType[],
    hops: number
  ): Promise<CognaiSubgraph> {
    const relevant = new Map<string, CognaiNode>();
    const tensions: CognaiEdge[] = [];
    let frontier = new Set<string>([nodeId]);

    for (let hop = 0; hop < hops; hop += 1) {
      const next = new Set<string>();
      for (const edge of this.edges.values()) {
        if (!edgeTypes.includes(edge.type)) {
          continue;
        }

        if (frontier.has(edge.from_node_id) || frontier.has(edge.to_node_id)) {
          const fromNode = this.nodes.get(edge.from_node_id);
          const toNode = this.nodes.get(edge.to_node_id);
          if (fromNode) {
            relevant.set(fromNode.id, fromNode);
          }
          if (toNode) {
            relevant.set(toNode.id, toNode);
          }
          next.add(edge.from_node_id);
          next.add(edge.to_node_id);

          if (
            edge.type === "CONTRADICTS" ||
            edge.type === "CONFLICTS_WITH_BUT_HELD_IN_TENSION" ||
            edge.type === "INHIBITS"
          ) {
            tensions.push(edge);
          }
        }
      }

      frontier = next;
    }

    return {
      telos_anchors: (await this.getTopValueNodes(3)).slice(0, 3),
      relevant_nodes: [...relevant.values()],
      active_tensions: tensions,
      confidence_floor_met: relevant.size > 0
    };
  }

  async getTopValueNodes(limit: number): Promise<CognaiNode[]> {
    return (await this.listNodes())
      .filter((node) => node.type === "Value")
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, limit);
  }

  async flagNode(id: string, flag: FlagType): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }

    const flags = Array.isArray(node.metadata.flags)
      ? [...(node.metadata.flags as string[]), flag]
      : [flag];

    this.nodes.set(id, {
      ...node,
      metadata: { ...node.metadata, flags }
    });
  }

  async decayConfidence(olderThan: Date, decayRate: number): Promise<void> {
    for (const [id, node] of this.nodes.entries()) {
      if (new Date(node.last_reinforced_at) >= olderThan) {
        continue;
      }

      this.nodes.set(id, {
        ...node,
        confidence: Math.max(0.2, Number((node.confidence - decayRate).toFixed(3)))
      });
    }
  }

  async writeEpisode(episode: EpisodeRecord): Promise<void> {
    this.episodes.set(episode.id, episode);
  }

  async getEpisode(id: string): Promise<EpisodeRecord | undefined> {
    return this.episodes.get(id);
  }

  async listEpisodes(): Promise<EpisodeRecord[]> {
    return [...this.episodes.values()];
  }

  async getSummary(): Promise<GraphSummary> {
    const nodeTypes = new Map<string, number>();
    for (const node of this.nodes.values()) {
      nodeTypes.set(node.type, (nodeTypes.get(node.type) ?? 0) + 1);
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      episodeCount: this.episodes.size,
      activeTensionCount: [...this.edges.values()].filter((edge) =>
        edge.type === "CONTRADICTS" ||
        edge.type === "CONFLICTS_WITH_BUT_HELD_IN_TENSION" ||
        edge.type === "INHIBITS"
      ).length,
      topNodeTypes: [...nodeTypes.entries()].map(([type, count]) => ({
        type: type as CognaiNode["type"],
        count
      }))
    };
  }
}
