export interface EpisodeRecord {
  id: string;
  conversation_id: string;
  timestamp: string;
  utterance: string;
  speaker: "user" | "ai" | "system";
  inferred_node_ids: string[];
  metadata: Record<string, unknown>;
}
