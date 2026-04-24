import type { CognaiEdge, CognaiNode, CognaiSubgraph } from "../graph/types.js";

export interface CognitiveNodeSummary {
  id: string;
  type: CognaiNode["type"];
  label: string;
  description: string;
  confidence: number;
  reasons?: string[];
}

export interface CognitiveTensionSummary {
  id: string;
  type: CognaiEdge["type"];
  from_node_id: string;
  to_node_id: string;
  from_label: string;
  to_label: string;
  confidence: number;
  rationale?: string;
}

export interface CognitiveContextPacket {
  anchors: CognitiveNodeSummary[];
  goals: CognitiveNodeSummary[];
  beliefs: CognitiveNodeSummary[];
  fears: CognitiveNodeSummary[];
  assumptions: CognitiveNodeSummary[];
  preferences: CognitiveNodeSummary[];
  tensions: CognitiveTensionSummary[];
  subgraph: CognaiSubgraph & {
    estimated_tokens: number;
    truncated: boolean;
  };
}

export interface MemoryLookupPlan {
  memory_system: "mempalace" | "generic";
  suggested_queries: string[];
  entities: string[];
  time_windows: string[];
  desired_memory_types: string[];
  questions: string[];
  lookup_order: string[];
  wing_hints: string[];
  room_hints: string[];
  drawer_hints: string[];
  tool_sequence: string[];
  coverage_status: "full" | "partial" | "unknown";
  rationale: string;
}

export interface ResponseGuidance {
  priorities: string[];
  cautions: string[];
  suggested_answer_shape: string;
}

export interface ModelReadySummary {
  prompt_context: string;
  token_estimate: number;
  anchors: string[];
  active_goals: string[];
  key_points: string[];
  active_tensions: string[];
  cautions: string[];
  memory_questions: string[];
  answer_shape: string;
  coverage_note?: string;
}

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
  pruned_nodes: string[];
  estimated_context_tokens: number;
  why: string;
  warnings: string[];
}

export interface CognaiQueryResult {
  cognitive_context: CognitiveContextPacket;
  memory_lookup_plan: MemoryLookupPlan;
  response_guidance: ResponseGuidance;
  model_ready_summary: ModelReadySummary;
  transparency: TransparencyBlock;
  retrieval_confidence: number;
  warnings: string[];
}
