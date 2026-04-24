import type { CognaiSubgraph } from "../graph/types.js";

export interface TransparencyBlock {
  classification: string;
  telos_anchors: string[];
  matched_nodes: string[];
  traversed_nodes: string[];
  surfaced_tensions: string[];
  selected_nodes: Array<{
    label: string;
    type: string;
    score: number;
    reasons: string[];
  }>;
  why: string;
  warnings: string[];
}

export interface CognaiQueryResult {
  subgraph: CognaiSubgraph;
  transparency: TransparencyBlock;
  retrieval_confidence: number;
  warnings: string[];
}
