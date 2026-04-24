import { loadState, requireConfig } from "../../config/loader.js";
import { createRuntime } from "../../mcp/context.js";
import { printJson, printSection } from "../output.js";

export interface InspectCommandOptions {
  config?: string;
  node?: string;
  tensions?: boolean;
  episodes?: boolean;
  syncState?: boolean;
}

export async function runInspectCommand(
  options: InspectCommandOptions = {}
): Promise<void> {
  const config = await requireConfig(options.config);
  const state = await loadState(config);
  const runtime = createRuntime(config);
  await runtime.storage.init();

  try {
    if (options.node) {
      const node = await runtime.storage.getNode(options.node);
      const edges = (await runtime.storage.listEdges()).filter(
        (edge) =>
          edge.from_node_id === options.node || edge.to_node_id === options.node
      );
      const relatedEpisodeIds = edges
        .filter((edge) => edge.type === "REVEALED_BY" && edge.from_node_id === options.node)
        .map((edge) => edge.to_node_id);
      const episodes = await Promise.all(
        relatedEpisodeIds.map((episodeId) => runtime.storage.getEpisode(episodeId))
      );
      printJson({ node, edges, episodes: episodes.filter(Boolean) });
      return;
    }

    if (options.tensions) {
      const tensions = (await runtime.storage.listEdges()).filter(
        (edge) =>
          edge.type === "CONTRADICTS" ||
          edge.type === "CONFLICTS_WITH_BUT_HELD_IN_TENSION"
      );
      printJson(tensions);
      return;
    }

    if (options.episodes) {
      printJson(await runtime.storage.listEpisodes());
      return;
    }

    if (options.syncState) {
      printJson({
        connectors: state.connectors,
        configured: config.connectors
      });
      return;
    }

    const summary = await runtime.storage.getSummary();
    const anchors = await runtime.storage.getTopValueNodes(3);
    printSection(
      "Graph Summary",
      `Nodes: ${summary.nodeCount}
Edges: ${summary.edgeCount}
Episodes: ${summary.episodeCount}
Active tensions: ${summary.activeTensionCount}
Top telos anchors: ${anchors.map((node) => node.label).join(", ") || "none"}`
    );
    printJson(summary.topNodeTypes);
    printSection(
      "Connector State",
      `Mem0: ${state.connectors.mem0.lastRunStatus} | last sync ${
        state.connectors.mem0.lastSyncAt ?? "never"
      } | seen source ids ${state.connectors.mem0.seenSourceIds.length}
MemPalace: ${state.connectors.mempalace.lastRunStatus} | last sync ${
        state.connectors.mempalace.lastSyncAt ?? "never"
      } | seen source ids ${state.connectors.mempalace.seenSourceIds.length}`
    );
  } finally {
    await runtime.storage.close();
  }
}
