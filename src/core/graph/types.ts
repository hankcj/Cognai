export type NodeSource = "stated" | "inferred";

export type ConstrualLevel = "high" | "mid" | "low";

export type FlagType = "stale" | "contradicted" | "uncertain" | "needs_review";

export type NodeType =
  | "Value"
  | "Goal"
  | "Belief"
  | "Contradiction"
  | "Preference"
  | "Reasoning Pattern"
  | "Commitment"
  | "Identity Claim"
  | "Fear"
  | "Assumption";

export type EdgeType =
  | "IN_SERVICE_OF"
  | "CONTRADICTS"
  | "CONFLICTS_WITH_BUT_HELD_IN_TENSION"
  | "REVEALED_BY"
  | "DOWNSTREAM_OF"
  | "SUPPORTS"
  | "ASSUMES"
  | "REGULATES"
  | "INHIBITS"
  | "PROTECTS"
  | "TRIGGERS"
  | "DISCREPANT_WITH";

export interface CognaiNode {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  embedding?: number[];
  source: NodeSource;
  confidence: number;
  activation: number;
  centrality: number;
  construal_level: ConstrualLevel;
  created_at: string;
  updated_at: string;
  last_reinforced_at: string;
  metadata: Record<string, unknown>;
}

export interface CognaiEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  type: EdgeType;
  confidence: number;
  source: NodeSource;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface CognaiSubgraph {
  telos_anchors: CognaiNode[];
  relevant_nodes: CognaiNode[];
  active_tensions: CognaiEdge[];
  confidence_floor_met: boolean;
}

export interface GraphSummary {
  nodeCount: number;
  edgeCount: number;
  episodeCount: number;
  activeTensionCount: number;
  topNodeTypes: Array<{ type: NodeType; count: number }>;
}
