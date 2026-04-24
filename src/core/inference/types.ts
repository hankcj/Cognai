import type { EpisodeRecord } from "../episodes/types.js";
import type { CanonicalConversationEnvelope } from "../../importers/canonical.js";
import type { CognaiEdge, CognaiNode } from "../graph/types.js";

export interface InferenceProposal {
  origin: "deterministic" | "enriched";
  reason: string;
  node: CognaiNode;
  edges: CognaiEdge[];
  contradictionTargets?: string[];
}

export interface InferenceResult {
  envelope: CanonicalConversationEnvelope;
  episodes: EpisodeRecord[];
  proposals: InferenceProposal[];
  enrichmentApplied: boolean;
  annotations: string[];
}
