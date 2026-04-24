import { join } from "node:path";

import type { EpisodeRecord } from "../../core/episodes/types.js";
import type {
  CognaiEdge,
  CognaiNode,
  CognaiSubgraph,
  EdgeType,
  FlagType,
  GraphSummary
} from "../../core/graph/types.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../../shared/fs.js";
import { MemoryStorageAdapter } from "./memory.js";
import type { StorageAdapter } from "../types.js";

interface FileStore {
  nodes: CognaiNode[];
  edges: CognaiEdge[];
  episodes: EpisodeRecord[];
}

export class FileStorageAdapter implements StorageAdapter {
  readonly kind = "file";

  private readonly storeFile: string;

  constructor(private readonly rootPath: string) {
    this.storeFile = join(rootPath, "store.json");
  }

  async init(): Promise<void> {
    await ensureDir(this.rootPath);
    const store = await this.load();
    await this.save(store);
  }

  async close(): Promise<void> {}

  async writeNode(node: CognaiNode): Promise<void> {
    const store = await this.load();
    store.nodes = store.nodes.filter((candidate) => candidate.id !== node.id);
    store.nodes.push(node);
    await this.save(store);
  }

  async updateNode(id: string, updates: Partial<CognaiNode>): Promise<void> {
    const store = await this.load();
    store.nodes = store.nodes.map((node) =>
      node.id === id ? { ...node, ...updates } : node
    );
    await this.save(store);
  }

  async writeEdge(edge: CognaiEdge): Promise<void> {
    const store = await this.load();
    store.edges = store.edges.filter((candidate) => candidate.id !== edge.id);
    store.edges.push(edge);
    await this.save(store);
  }

  async getNode(id: string): Promise<CognaiNode | undefined> {
    return (await this.load()).nodes.find((node) => node.id === id);
  }

  async listNodes(): Promise<CognaiNode[]> {
    return (await this.load()).nodes;
  }

  async listEdges(): Promise<CognaiEdge[]> {
    return (await this.load()).edges;
  }

  async queryByEmbedding(vector: number[], topK: number): Promise<CognaiNode[]> {
    const memory = await this.asMemory();
    return memory.queryByEmbedding(vector, topK);
  }

  async traverseEdges(
    nodeId: string,
    edgeTypes: EdgeType[],
    hops: number
  ): Promise<CognaiSubgraph> {
    const memory = await this.asMemory();
    return memory.traverseEdges(nodeId, edgeTypes, hops);
  }

  async getTopValueNodes(limit: number): Promise<CognaiNode[]> {
    const memory = await this.asMemory();
    return memory.getTopValueNodes(limit);
  }

  async flagNode(id: string, flag: FlagType): Promise<void> {
    const memory = await this.asMemory();
    await memory.flagNode(id, flag);
    await this.persistMemory(memory);
  }

  async decayConfidence(olderThan: Date, decayRate: number): Promise<void> {
    const memory = await this.asMemory();
    await memory.decayConfidence(olderThan, decayRate);
    await this.persistMemory(memory);
  }

  async writeEpisode(episode: EpisodeRecord): Promise<void> {
    const store = await this.load();
    store.episodes = store.episodes.filter(
      (candidate) => candidate.id !== episode.id
    );
    store.episodes.push(episode);
    await this.save(store);
  }

  async getEpisode(id: string): Promise<EpisodeRecord | undefined> {
    return (await this.load()).episodes.find((episode) => episode.id === id);
  }

  async listEpisodes(): Promise<EpisodeRecord[]> {
    return (await this.load()).episodes;
  }

  async getSummary(): Promise<GraphSummary> {
    const memory = await this.asMemory();
    return memory.getSummary();
  }

  private async load(): Promise<FileStore> {
    return readJsonFile<FileStore>(this.storeFile, {
      nodes: [],
      edges: [],
      episodes: []
    });
  }

  private async save(store: FileStore): Promise<void> {
    await writeJsonFile(this.storeFile, store);
  }

  private async asMemory(): Promise<MemoryStorageAdapter> {
    const store = await this.load();
    const memory = new MemoryStorageAdapter();
    await memory.init();
    for (const node of store.nodes) {
      await memory.writeNode(node);
    }
    for (const edge of store.edges) {
      await memory.writeEdge(edge);
    }
    for (const episode of store.episodes) {
      await memory.writeEpisode(episode);
    }
    return memory;
  }

  private async persistMemory(memory: MemoryStorageAdapter): Promise<void> {
    await this.save({
      nodes: await memory.listNodes(),
      edges: await memory.listEdges(),
      episodes: await memory.listEpisodes()
    });
  }
}
