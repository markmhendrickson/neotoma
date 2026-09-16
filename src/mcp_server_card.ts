import { join } from "node:path";
import { config } from "./config.js";
import { buildToolDefinitions, NEOTOMA_TOOL_NAMES } from "./tool_definitions.js";
import { readPackageVersion } from "./shared/package_version.js";
import { loadToolEffectCatalog } from "./shared/tool_effect_catalog.js";

const MCP_DOCS_SUBDIR = ["docs", "developer", "mcp"] as const;
const TIMELINE_WIDGET_RESOURCE_URI = "ui://neotoma/timeline_widget";
const TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary";

function loadToolCatalog() {
  const yamlPath = join(config.projectRoot, ...MCP_DOCS_SUBDIR, "tool_descriptions.yaml");
  return loadToolEffectCatalog(yamlPath, NEOTOMA_TOOL_NAMES);
}

/**
 * MCP static server card (SEP-1649 / Smithery `/.well-known/mcp/server-card.json`).
 * Tool list matches `NeotomaServer` listTools; no DB access; safe for unauthenticated GET.
 */
export function buildSmitheryServerCard(): Record<string, unknown> {
  const toolCatalog = loadToolCatalog();
  const tools = buildToolDefinitions(
    toolCatalog.descriptions,
    TIMELINE_WIDGET_RESOURCE_URI,
    TURN_SUMMARY_WIDGET_RESOURCE_URI,
    toolCatalog
  ).map((def) => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    ...(def.annotations ? { annotations: def.annotations } : {}),
    ...(def._meta ? { _meta: def._meta } : {}),
  }));

  const authentication: Record<string, unknown> = {
    required: true,
    schemes: config.encryption.enabled ? ["bearer"] : ["oauth2"],
  };

  return {
    serverInfo: {
      name: "neotoma",
      version: readPackageVersion(config.projectRoot),
    },
    authentication,
    tools,
    resources: [
      {
        uri: "neotoma://entities",
        name: "All Entities",
        description: "All entities regardless of type",
        mimeType: "application/json",
      },
      {
        uri: "neotoma://relationships",
        name: "All Relationships",
        description: "All relationships regardless of type",
        mimeType: "application/json",
      },
      {
        uri: "neotoma://sources",
        name: "Sources",
        description: "All sources",
        mimeType: "application/json",
      },
      {
        uri: TIMELINE_WIDGET_RESOURCE_URI,
        name: "Timeline Widget",
        description: "Embedded timeline widget for timeline event tool results.",
        mimeType: "text/html;profile=mcp-app",
      },
      {
        uri: TURN_SUMMARY_WIDGET_RESOURCE_URI,
        name: "Turn Summary Widget",
        description: "Inline per-turn status card for neotoma_turn_summary results.",
        mimeType: "text/html;profile=mcp-app",
      },
      {
        uri: "neotoma://entity_types",
        name: "Entity Types",
        description: "All available entity types",
        mimeType: "application/json",
      },
    ],
    prompts: [],
  };
}
