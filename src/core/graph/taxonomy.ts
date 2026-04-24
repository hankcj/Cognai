import type { ConstrualLevel, EdgeType, NodeType } from "./types.js";

export interface NodeTypeMetadata {
  type: NodeType;
  construalLevel: ConstrualLevel;
  decayExempt?: boolean;
  requiredFields?: string[];
}

export const CORE_NODE_TYPES: NodeTypeMetadata[] = [
  { type: "Value", construalLevel: "high", decayExempt: true },
  {
    type: "Goal",
    construalLevel: "mid",
    requiredFields: ["regulatory_style", "time_horizon"]
  },
  { type: "Belief", construalLevel: "mid" },
  { type: "Contradiction", construalLevel: "mid" },
  { type: "Preference", construalLevel: "low" },
  {
    type: "Reasoning Pattern",
    construalLevel: "mid",
    requiredFields: ["mode"]
  },
  { type: "Commitment", construalLevel: "mid" },
  {
    type: "Identity Claim",
    construalLevel: "high",
    requiredFields: ["valence"]
  },
  { type: "Fear", construalLevel: "mid" },
  { type: "Assumption", construalLevel: "low" }
];

export const EDGE_TYPES: EdgeType[] = [
  "IN_SERVICE_OF",
  "CONTRADICTS",
  "CONFLICTS_WITH_BUT_HELD_IN_TENSION",
  "REVEALED_BY",
  "DOWNSTREAM_OF",
  "SUPPORTS",
  "ASSUMES",
  "REGULATES",
  "INHIBITS",
  "PROTECTS",
  "TRIGGERS",
  "DISCREPANT_WITH"
];
