import { CognaiError } from "../../shared/errors.js";
import { ensureDir } from "../../shared/fs.js";
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
import { Surreal, Table, RecordId } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";

const NODE_TABLE = "cognai_node";
const EDGE_TABLE = "cognai_edge";
const EPISODE_TABLE = "cognai_episode";

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

type SurrealNodeRecord = Omit<CognaiNode, "id"> & {
  id: string;
  entity_id?: string;
};

type SurrealEdgeRecord = Omit<CognaiEdge, "id"> & {
  id: string;
  entity_id?: string;
};

type SurrealEpisodeRecord = Omit<EpisodeRecord, "id"> & {
  id: string;
  entity_id?: string;
};

export class SurrealStorageAdapter implements StorageAdapter {
  readonly kind = "surrealdb";
  private db: Surreal | null = null;

  constructor(
    private readonly surrealkvPath: string,
    private readonly namespace: string,
    private readonly database: string
  ) {}

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    await ensureDir(this.surrealkvPath);
    this.db = new Surreal({
      engines: createNodeEngines()
    });
    await this.db.connect(`surrealkv://${this.surrealkvPath}`);
    await this.db.use({
      namespace: this.namespace,
      database: this.database
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
  async writeNode(node: CognaiNode): Promise<void> {
    const db = this.requireDb();
    await db
      .upsert(new RecordId(NODE_TABLE, node.id))
      .content(this.serializeNode(node));
  }
  async updateNode(id: string, updates: Partial<CognaiNode>): Promise<void> {
    const existing = await this.getNode(id);
    if (!existing) {
      return;
    }

    await this.writeNode({
      ...existing,
      ...updates,
      id
    });
  }
  async writeEdge(edge: CognaiEdge): Promise<void> {
    const db = this.requireDb();
    await db
      .upsert(new RecordId(EDGE_TABLE, edge.id))
      .content(this.serializeEdge(edge));
  }
  async getNode(id: string): Promise<CognaiNode | undefined> {
    const db = this.requireDb();
    const record = (await db.select(
      new RecordId(NODE_TABLE, id)
    )) as unknown as SurrealNodeRecord | undefined;

    if (!record) {
      return undefined;
    }

    return this.deserializeNode(record);
  }
  async listNodes(): Promise<CognaiNode[]> {
    const db = this.requireDb();
    const records = (await this.safeSelectMany(
      () => db.select(new Table(NODE_TABLE))
    )) as unknown as SurrealNodeRecord[];
    return records.map((record) => this.deserializeNode(record));
  }
  async listEdges(): Promise<CognaiEdge[]> {
    const db = this.requireDb();
    const records = (await this.safeSelectMany(
      () => db.select(new Table(EDGE_TABLE))
    )) as unknown as SurrealEdgeRecord[];
    return records.map((record) => this.deserializeEdge(record));
  }
  async queryByEmbedding(
    vector: number[],
    topK: number
  ): Promise<CognaiNode[]> {
    return (await this.listNodes())
      .map((node) => ({
        node,
        score: cosineSimilarity(node.embedding ?? [], vector)
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
    const nodes = new Map((await this.listNodes()).map((node) => [node.id, node]));
    const relevant = new Map<string, CognaiNode>();
    const tensions: CognaiEdge[] = [];
    const edges = await this.listEdges();
    let frontier = new Set<string>([nodeId]);

    for (let hop = 0; hop < hops; hop += 1) {
      const next = new Set<string>();

      for (const edge of edges) {
        if (!edgeTypes.includes(edge.type)) {
          continue;
        }

        if (frontier.has(edge.from_node_id) || frontier.has(edge.to_node_id)) {
          const fromNode = nodes.get(edge.from_node_id);
          const toNode = nodes.get(edge.to_node_id);
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
      telos_anchors: await this.getTopValueNodes(3),
      relevant_nodes: [...relevant.values()],
      relevant_edges: edges.filter(
        (edge) => relevant.has(edge.from_node_id) && relevant.has(edge.to_node_id)
      ),
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
    const node = await this.getNode(id);
    if (!node) {
      return;
    }

    const flags = Array.isArray(node.metadata.flags)
      ? [...new Set([...(node.metadata.flags as string[]), flag])]
      : [flag];

    await this.updateNode(id, {
      metadata: {
        ...node.metadata,
        flags
      }
    });
  }
  async decayConfidence(
    olderThan: Date,
    decayRate: number
  ): Promise<void> {
    const nodes = await this.listNodes();
    for (const node of nodes) {
      if (new Date(node.last_reinforced_at) >= olderThan) {
        continue;
      }

      await this.updateNode(node.id, {
        confidence: Math.max(0.2, Number((node.confidence - decayRate).toFixed(3)))
      });
    }
  }
  async writeEpisode(episode: EpisodeRecord): Promise<void> {
    const db = this.requireDb();
    await db
      .upsert(new RecordId(EPISODE_TABLE, episode.id))
      .content(this.serializeEpisode(episode));
  }
  async getEpisode(id: string): Promise<EpisodeRecord | undefined> {
    const db = this.requireDb();
    const record = (await db.select(
      new RecordId(EPISODE_TABLE, id)
    )) as unknown as SurrealEpisodeRecord | undefined;

    if (!record) {
      return undefined;
    }

    return this.deserializeEpisode(record);
  }
  async listEpisodes(): Promise<EpisodeRecord[]> {
    const db = this.requireDb();
    const records = (await this.safeSelectMany(
      () => db.select(new Table(EPISODE_TABLE))
    )) as unknown as SurrealEpisodeRecord[];
    return records.map((record) => this.deserializeEpisode(record));
  }
  async getSummary(): Promise<GraphSummary> {
    const nodes = await this.listNodes();
    const edges = await this.listEdges();
    const episodes = await this.listEpisodes();
    const nodeTypes = new Map<string, number>();

    for (const node of nodes) {
      nodeTypes.set(node.type, (nodeTypes.get(node.type) ?? 0) + 1);
    }

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      episodeCount: episodes.length,
      activeTensionCount: edges.filter(
        (edge) =>
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

  private requireDb(): Surreal {
    if (!this.db) {
      throw new CognaiError(
        "SurrealDB adapter has not been initialized. Call init() before using it."
      );
    }

    return this.db;
  }

  private serializeNode(node: CognaiNode): SurrealNodeRecord {
    return {
      ...node,
      id: node.id,
      entity_id: node.id
    };
  }

  private deserializeNode(record: SurrealNodeRecord): CognaiNode {
    return {
      ...record,
      id: record.entity_id ?? this.stripRecordPrefix(record.id)
    };
  }

  private serializeEdge(edge: CognaiEdge): SurrealEdgeRecord {
    return {
      ...edge,
      id: edge.id,
      entity_id: edge.id
    };
  }

  private deserializeEdge(record: SurrealEdgeRecord): CognaiEdge {
    return {
      ...record,
      id: record.entity_id ?? this.stripRecordPrefix(record.id)
    };
  }

  private serializeEpisode(episode: EpisodeRecord): SurrealEpisodeRecord {
    return {
      ...episode,
      id: episode.id,
      entity_id: episode.id
    };
  }

  private deserializeEpisode(record: SurrealEpisodeRecord): EpisodeRecord {
    return {
      ...record,
      id: record.entity_id ?? this.stripRecordPrefix(record.id)
    };
  }

  private stripRecordPrefix(value: string): string {
    const parts = String(value).split(":");
    return parts.length > 1 ? parts.slice(1).join(":") : value;
  }

  private async safeSelectMany<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        return [];
      }

      throw error;
    }
  }
}
