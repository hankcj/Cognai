import type { EpisodeRecord } from "../core/episodes/types.js";
import type {
  CognaiEdge,
  CognaiNode,
  CognaiSubgraph,
  EdgeType,
  FlagType,
  GraphSummary
} from "../core/graph/types.js";

export interface StorageAdapter {
  readonly kind: string;
  init(): Promise<void>;
  close(): Promise<void>;
  writeNode(node: CognaiNode): Promise<void>;
  updateNode(id: string, updates: Partial<CognaiNode>): Promise<void>;
  writeEdge(edge: CognaiEdge): Promise<void>;
  getNode(id: string): Promise<CognaiNode | undefined>;
  listNodes(): Promise<CognaiNode[]>;
  listEdges(): Promise<CognaiEdge[]>;
  queryByEmbedding(vector: number[], topK: number): Promise<CognaiNode[]>;
  traverseEdges(
    nodeId: string,
    edgeTypes: EdgeType[],
    hops: number
  ): Promise<CognaiSubgraph>;
  getTopValueNodes(limit: number): Promise<CognaiNode[]>;
  flagNode(id: string, flag: FlagType): Promise<void>;
  decayConfidence(olderThan: Date, decayRate: number): Promise<void>;
  writeEpisode(episode: EpisodeRecord): Promise<void>;
  getEpisode(id: string): Promise<EpisodeRecord | undefined>;
  listEpisodes(): Promise<EpisodeRecord[]>;
  getSummary(): Promise<GraphSummary>;
}
