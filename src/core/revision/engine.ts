import { randomUUID } from "node:crypto";

import type { StorageAdapter } from "../../storage/types.js";
import { overlapScore } from "../../shared/text.js";
import type { InferenceResult } from "../inference/types.js";

export interface RevisionSummary {
  nodesWritten: number;
  nodesReinforced: number;
  edgesWritten: number;
  episodesWritten: number;
  contradictionCandidates: number;
  fearsDetected: number;
  assumptionsDetected: number;
  enrichmentApplied: boolean;
}

export class RevisionEngine {
  async apply(
    storage: StorageAdapter,
    inference: InferenceResult
  ): Promise<RevisionSummary> {
    let nodesWritten = 0;
    let nodesReinforced = 0;
    let edgesWritten = 0;
    let contradictionCandidates = 0;
    let fearsDetected = 0;
    let assumptionsDetected = 0;

    for (const episode of inference.episodes) {
      await storage.writeEpisode(episode);
    }

    let existingNodes = await storage.listNodes();

    for (const proposal of inference.proposals) {
      const existing = existingNodes.find(
        (node) =>
          node.type === proposal.node.type &&
          overlapScore(node.label, proposal.node.label) >= 0.82
      );

      let effectiveNodeId = proposal.node.id;

      if (existing) {
        const proposalPolarity = proposal.node.metadata.polarity;
        const existingPolarity = existing.metadata.polarity;
        const descriptionSimilarity = overlapScore(
          existing.description,
          proposal.node.description
        );
        const hasPolarityConflict =
          Boolean(proposalPolarity) &&
          Boolean(existingPolarity) &&
          proposalPolarity !== existingPolarity &&
          descriptionSimilarity >= 0.48;

        await storage.updateNode(existing.id, {
          confidence: Math.min(1, Number((existing.confidence + 0.05).toFixed(3))),
          last_reinforced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...existing.metadata,
            reinforced_by: inference.envelope.conversation.id,
            contradiction_candidate: hasPolarityConflict || existing.metadata.contradiction_candidate === true
          }
        });
        nodesReinforced += 1;
        effectiveNodeId = existing.id;
        if (hasPolarityConflict) {
          contradictionCandidates += 1;
        }
      } else {
        await storage.writeNode(proposal.node);
        nodesWritten += 1;
        existingNodes = [...existingNodes, proposal.node];
        if (proposal.node.type === "Fear") {
          fearsDetected += 1;
        }
        if (proposal.node.type === "Assumption") {
          assumptionsDetected += 1;
        }
      }

      for (const edge of proposal.edges) {
        await storage.writeEdge({
          ...edge,
          from_node_id:
            edge.from_node_id === proposal.node.id ? effectiveNodeId : edge.from_node_id,
          to_node_id:
            edge.to_node_id === proposal.node.id ? effectiveNodeId : edge.to_node_id
        });
        edgesWritten += 1;
      }

      const contradictionTargets = new Set(proposal.contradictionTargets ?? []);
      for (const existingNode of existingNodes) {
        if (
          existingNode.id === effectiveNodeId ||
          existingNode.type !== proposal.node.type
        ) {
          continue;
        }

        const proposalPolarity = proposal.node.metadata.polarity;
        const existingPolarity = existingNode.metadata.polarity;

        if (
          proposalPolarity &&
          existingPolarity &&
          proposalPolarity !== existingPolarity &&
          overlapScore(existingNode.description, proposal.node.description) >= 0.46
        ) {
          contradictionTargets.add(existingNode.id);
        }
      }

      for (const targetId of contradictionTargets) {
        if (targetId === effectiveNodeId) {
          continue;
        }

        await storage.writeEdge({
          id: randomUUID(),
          from_node_id: effectiveNodeId,
          to_node_id: targetId,
          type: "CONTRADICTS",
          confidence: 0.45,
          source: "inferred",
          created_at: new Date().toISOString(),
          metadata: {
            inferred_from: "revision-engine"
          }
        });
        contradictionCandidates += 1;
        edgesWritten += 1;
      }
    }

    return {
      nodesWritten,
      nodesReinforced,
      edgesWritten,
      episodesWritten: inference.episodes.length,
      contradictionCandidates,
      fearsDetected,
      assumptionsDetected,
      enrichmentApplied: inference.enrichmentApplied
    };
  }
}
