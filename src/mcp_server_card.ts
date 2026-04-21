import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { config } from "./config.js";
import { buildToolDefinitions } from "./tool_definitions.js";

const MCP_DOCS_SUBDIR = ["docs", "developer", "mcp"] as const;
const TIMELINE_WIDGET_RESOURCE_URI = "neotoma://ui/timeline_widget";

function loadToolDescriptionsMap(): Map<string, string> {
  const yamlPath = join(config.projectRoot, ...MCP_DOCS_SUBDIR, "tool_descriptions.yaml");
  try {
    const raw = readFileSync(yamlPath, "utf-8");
    const data = yaml.load(raw) as { tools?: Record<string, string> } | undefined;
    if (data?.tools && typeof data.tools === "object") {
      return new Map(Object.entries(data.tools));
    }
  } catch {
    // Missing or invalid YAML; inline descriptions from tool_definitions apply.
  }
  return new Map();
}

function readPackageVersion(): string {
  try {
    const pkgPath = join(config.projectRoot, "package.json");
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * MCP static server card (SEP-1649 / Smithery `/.well-known/mcp/server-card.json`).
 * Tool list matches `NeotomaServer` listTools; no DB access; safe for unauthenticated GET.
 */
export function buildSmitheryServerCard(): Record<string, unknown> {
  const toolDescriptions = loadToolDescriptionsMap();
  const tools = buildToolDefinitions(toolDescriptions, TIMELINE_WIDGET_RESOURCE_URI).map(
    (def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      ...(def.annotations ? { annotations: def.annotations } : {}),
      ...(def._meta ? { _meta: def._meta } : {}),
    }),
  );

  const authentication: Record<string, unknown> = {
    required: true,
    schemes: config.encryption.enabled ? ["bearer"] : ["oauth2"],
  };

  return {
    serverInfo: {
      name: "neotoma",
      version: readPackageVersion(),
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
        uri: "neotoma://entity_types",
        name: "Entity Types",
        description: "All available entity types",
        mimeType: "application/json",
      },
    ],
    prompts: [],
  };
}
