import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { Runtime } from "./context.js";
import type { NodeType } from "../core/graph/types.js";
import type { CanonicalConversationEnvelope } from "../importers/canonical.js";

const memoryEvidenceSchema = z.object({
  source: z.string(),
  summary: z.string(),
  memory_system: z.string().optional(),
  drawer_ids: z.array(z.string()).optional(),
  wing: z.string().optional(),
  room: z.string().optional(),
  source_file: z.string().optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const memoryWriteSchema = z.object({
  source: z.string(),
  summary: z.string(),
  status: z.enum(["written", "queued", "skipped"]).default("written"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const queryOutputSchema = {
  cognitive_context: z.record(z.string(), z.unknown()),
  memory_lookup_plan: z.record(z.string(), z.unknown()),
  response_guidance: z.record(z.string(), z.unknown()),
  model_ready_summary: z.record(z.string(), z.unknown()),
  transparency: z.record(z.string(), z.unknown()),
  retrieval_confidence: z.number(),
  warnings: z.array(z.string())
};

const updateOutputSchema = {
  nodes_written: z.number().int().nonnegative(),
  nodes_reinforced: z.number().int().nonnegative(),
  tensions_changed: z.number().int().nonnegative(),
  warnings: z.array(z.string())
};

const explainOutputSchema = {
  node: z.record(z.string(), z.unknown()).nullable(),
  edges: z.array(z.record(z.string(), z.unknown())),
  episodes: z.array(z.record(z.string(), z.unknown())),
  rationale: z.string()
};

function materializeMemoryEvidence(
  envelope: CanonicalConversationEnvelope
): CanonicalConversationEnvelope {
  const syntheticMessages = envelope.memory_entries.map((entry, index) => ({
    id: `memory-evidence-${entry.id ?? index + 1}`,
    role: "user" as const,
    content: entry.content,
    timestamp: entry.created_at ?? new Date().toISOString(),
    metadata: {
      ...entry.metadata,
      derived_from_memory_entry: true,
      source_id:
        typeof entry.metadata.source_id === "string" ? entry.metadata.source_id : entry.id
    }
  }));

  return {
    ...envelope,
    messages: [...envelope.messages, ...syntheticMessages]
  };
}

function buildInteractionEnvelope(input: {
  user_message: string;
  assistant_response: string;
  memory_evidence: Array<z.infer<typeof memoryEvidenceSchema>>;
  memory_writes: Array<z.infer<typeof memoryWriteSchema>>;
  interaction_outcome?: string;
}): CanonicalConversationEnvelope {
  const now = new Date().toISOString();

  return materializeMemoryEvidence({
    source: "mcp-interaction",
    conversation: {
      id: randomUUID(),
      metadata: {
        interaction_outcome: input.interaction_outcome ?? null,
        memory_writes: input.memory_writes
      }
    },
    messages: [
      {
        id: randomUUID(),
        role: "user",
        content: input.user_message,
        timestamp: now,
        metadata: {
          update_source: "mcp"
        }
      },
      {
        id: randomUUID(),
        role: "ai",
        content: input.assistant_response,
        timestamp: now,
        metadata: {
          update_source: "mcp"
        }
      }
    ],
    memory_entries: input.memory_evidence.map((item) => ({
      id: randomUUID(),
      content: item.summary,
      created_at: item.timestamp,
      metadata: {
        ...(item.metadata ?? {}),
        source: item.source,
        memory_system: item.memory_system ?? "generic",
        drawer_ids: item.drawer_ids ?? [],
        wing: item.wing ?? null,
        room: item.room ?? null,
        source_file: item.source_file ?? null,
        source_id:
          typeof item.metadata?.source_id === "string"
            ? item.metadata.source_id
            : randomUUID()
      }
    })),
    participants: [],
    metadata: {
      memory_sources: input.memory_evidence.map((item) => item.source),
      memory_write_count: input.memory_writes.length
    }
  });
}

export async function startMcpServer(runtime: Runtime): Promise<void> {
  await runtime.storage.init();

  const server = new McpServer({
    name: "cognai",
    version: "0.2.0"
  });

  server.registerTool(
    "cognai_query",
    {
      description:
        "Return a reasoning packet with cognitive context, response guidance, and a memory lookup plan for the AI client.",
      inputSchema: {
        intent: z.string().describe("The user request or a concise summary of it."),
        recent_turn_summary: z
          .string()
          .optional()
          .describe("Optional summary of the most recent conversation turn.")
      },
      outputSchema: queryOutputSchema
    },
    async ({ intent, recent_turn_summary }) => {
      const result = await runtime.retrievalEngine.query({
        intent,
        recent_turn_summary
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "cognai_update",
    {
      description:
        "Update Cognai after an interaction by providing the user message, assistant response, and memory evidence used.",
      inputSchema: {
        user_message: z.string(),
        assistant_response: z.string(),
        memory_evidence: z.array(memoryEvidenceSchema).default([]),
        memory_writes: z.array(memoryWriteSchema).default([]),
        interaction_outcome: z.string().optional()
      },
      outputSchema: updateOutputSchema
    },
    async ({
      user_message,
      assistant_response,
      memory_evidence,
      memory_writes,
      interaction_outcome
    }) => {
      const envelope = buildInteractionEnvelope({
        user_message,
        assistant_response,
        memory_evidence,
        memory_writes,
        interaction_outcome
      });
      const inference = await runtime.inferenceEngine.analyzeConversation(envelope);
      const revision = await runtime.revisionEngine.apply(runtime.storage, inference);
      const result = {
        nodes_written: revision.nodesWritten,
        nodes_reinforced: revision.nodesReinforced,
        tensions_changed: revision.tensionsChanged,
        warnings: [
          ...revision.warnings,
          ...(memory_evidence.length === 0
            ? [
                "No memory evidence was provided, so the update is relying mostly on the immediate interaction."
              ]
            : [])
        ]
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "cognai_explain",
    {
      description: "Explain the provenance and connected context for a node.",
      inputSchema: {
        node_id: z.string()
      },
      outputSchema: explainOutputSchema
    },
    async ({ node_id }) => {
      const node = await runtime.storage.getNode(node_id);
      const edges = (await runtime.storage.listEdges()).filter(
        (edge) => edge.from_node_id === node_id || edge.to_node_id === node_id
      );
      const episodeIds = edges
        .filter((edge) => edge.type === "REVEALED_BY")
        .map((edge) => edge.to_node_id);
      const episodes = await Promise.all(
        episodeIds.map((episodeId) => runtime.storage.getEpisode(episodeId))
      );
      const result = {
        node: node ?? null,
        edges,
        episodes: episodes.filter(Boolean),
        rationale: node
          ? [
              "This explanation shows the node, its connected edges, and the episodes that revealed it.",
              Array.isArray(node.metadata.flags) && node.metadata.flags.length > 0
                ? `Current flags: ${(node.metadata.flags as string[]).join(", ")}.`
                : "",
              episodes.some(
                (episode) =>
                  Boolean(episode?.metadata.deleted_drawer_id) ||
                  episode?.metadata.stale_in_mempalace === true
              )
                ? "Some provenance comes from a MemPalace drawer that changed or was deleted, so treat this node as review-needed."
                : ""
            ]
              .filter(Boolean)
              .join(" ")
          : "No node was found for this id."
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "cognai_flag",
    {
      description: "Flag a node without deleting or overwriting it.",
      inputSchema: {
        node_id: z.string(),
        flag_type: z.enum(["stale", "contradicted", "uncertain", "needs_review"])
      },
      outputSchema: {
        node_id: z.string(),
        flag_type: z.string(),
        status: z.string()
      }
    },
    async ({ node_id, flag_type }) => {
      await runtime.storage.flagNode(node_id, flag_type);
      const result = {
        node_id,
        flag_type,
        status: "flagged"
      };

      return {
        content: [{ type: "text", text: `Flagged ${node_id} as ${flag_type}.` }],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cognai MCP server running on stdio.");
}
