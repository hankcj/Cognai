import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { Runtime } from "./context.js";
import type { NodeType } from "../core/graph/types.js";

export async function startMcpServer(runtime: Runtime): Promise<void> {
  await runtime.storage.init();

  const server = new McpServer({
    name: "cognai",
    version: "0.1.0"
  });

  server.registerTool(
    "cognai_query",
    {
      description:
        "Retrieve a lean cognitive context subgraph and transparency block for an intent.",
      inputSchema: {
        intent: z.string().describe("The user request or a summary of it.")
      }
    },
    async ({ intent }) => {
      const result = await runtime.retrievalEngine.query(intent);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  server.registerTool(
    "cognai_update",
    {
      description: "Write a cognitive node into the local graph scaffold.",
      inputSchema: {
        node_type: z.string(),
        label: z.string(),
        description: z.string(),
        source: z.enum(["stated", "inferred"]),
        confidence: z.number()
      }
    },
    async ({ node_type, label, description, source, confidence }) => {
      const node = {
        id: randomUUID(),
        type: node_type as NodeType,
        label,
        description,
        embedding: await runtime.embeddingProvider.embedText(description),
        source,
        confidence,
        activation: 0.5,
        centrality: 0.3,
        construal_level: "mid" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_reinforced_at: new Date().toISOString(),
        metadata: { created_via: "mcp" }
      };
      await runtime.storage.writeNode(node);
      return {
        content: [{ type: "text", text: `Stored node ${label}.` }]
      };
    }
  );

  server.registerTool(
    "cognai_explain",
    {
      description: "Explain the provenance and connected context for a node.",
      inputSchema: {
        node_id: z.string()
      }
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
        node,
        edges,
        episodes: episodes.filter(Boolean)
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
      }
    },
    async ({ node_id, flag_type }) => {
      await runtime.storage.flagNode(node_id, flag_type);
      return {
        content: [{ type: "text", text: `Flagged ${node_id} as ${flag_type}.` }]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cognai MCP server running on stdio.");
}
