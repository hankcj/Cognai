import type { CognaiConfig } from "../config/schema.js";
import { Mem0Connector } from "./mem0.js";
import { MemPalaceConnector } from "./mempalace.js";
import { ObsidianConnector } from "./obsidian.js";
import type { ConnectorName, LiveConnector } from "./types.js";

export function createConnectors(_config: CognaiConfig): LiveConnector[] {
  return [new Mem0Connector(), new MemPalaceConnector(), new ObsidianConnector()];
}

export function getConnectorByName(
  connectors: LiveConnector[],
  name: ConnectorName
): LiveConnector | undefined {
  return connectors.find((connector) => connector.name === name);
}
