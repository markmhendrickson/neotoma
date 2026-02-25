export interface SiteSection {
  id: string;
  label: string;
  /** Short label for sidebar nav (e.g. "Bugs" instead of "Report or fix bugs") */
  shortLabel: string;
  /** Lucide icon name for sidebar (e.g. "Bug", "Terminal") */
  icon: string;
}

export interface FunctionalityRow {
  functionality: string;
  openapi: string;
  /** One description per endpoint (same order as openapi split by comma). Falls back to functionality when absent. */
  endpointDescriptions?: string[];
  /** One parameters summary per endpoint (path/query/body). Same order as openapi. Use "—" when none. */
  endpointParameters?: string[];
  cli: string;
  mcp: string;
  /** One parameters summary per MCP action (same order as mcp split by comma). Use "—" when none. */
  mcpParameters?: string[];
  /** One parameters or flags summary per CLI command (same order as cli split by comma). Use "—" when none. */
  cliParameters?: string[];
  testCoverage: string;
}

/** One row per MCP action for the intro MCP table (Action | Description | Parameters). */
export interface McpActionRow {
  action: string;
  description: string;
  /** Short summary of action parameters (e.g. "entity_id, at?"). "—" when none. */
  parameters: string;
}

/** One row per CLI command for the intro CLI table (Command | Description | Flags or parameters). */
export interface CliCommandRow {
  command: string;
  description: string;
  /** Short summary of flags or parameters (e.g. "--type, --limit"). "—" when none. */
  parameters: string;
}

export interface GlossaryRow {
  term: string;
  definition: string;
}

export const SITE_SECTIONS: SiteSection[] = [
  { id: "install", label: "Install with npm", shortLabel: "Install", icon: "Package" },
  { id: "terminology", label: "Core terminology", shortLabel: "Terminology", icon: "BookText" },
  { id: "agent-instructions", label: "Instructions", shortLabel: "Instructions", icon: "Bot" },
  {
    id: "functionality",
    label: "API and OpenAPI specification",
    shortLabel: "API",
    icon: "SatelliteDish",
  },
  {
    id: "configure-mcp",
    label: "Model Context Protocol (MCP) server",
    shortLabel: "MCP",
    icon: "Server",
  },
  { id: "cli", label: "Command-line interface (CLI)", shortLabel: "CLI", icon: "Terminal" },
  { id: "learn-more", label: "Resources", shortLabel: "Resources", icon: "GraduationCap" },
];

export const SITE_CODE_SNIPPETS = {
  installCommands: `# Global install
npm install -g neotoma

# Initialize
neotoma init`,
  postInstallCommands: `# Run API server (development)
neotoma api start --env dev

# Run API server (production)
neotoma api start --env production`,
  stdioConfigJson: `{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}`,
  syncConfigCommands: `cd /path/to/neotoma
# Add neotoma-dev and neotoma to .cursor/mcp.json (see mcp_cursor_setup.md Option A)
npm run sync:mcp`,
  cliStoreExample: `neotoma store --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'`,
  cliListExample: `neotoma entities list --type company --limit 10`,
  cliUploadExample: `neotoma upload ./fixtures/invoice.pdf
neotoma upload ./doc.pdf --no-interpret --mime-type application/pdf
neotoma upload --local ./invoice.pdf   # run in-process, no API server required`,
};

export const GLOSSARY_ROWS: GlossaryRow[] = [
  {
    term: "Truth Layer",
    definition:
      "Neotoma's role: a deterministic, immutable structured memory substrate that other layers read and write.",
  },
  {
    term: "Entity",
    definition:
      "Canonical representation of a person, company, or other object with a deterministic ID.",
  },
  {
    term: "Entity snapshot",
    definition:
      "Current truth for an entity; computed by merging all observations about that entity.",
  },
  {
    term: "Observation",
    definition:
      "Granular fact extracted from source; reducers merge observations into entity snapshots.",
  },
  {
    term: "Source",
    definition:
      "Raw data (file, text, URL, or structured JSON) stored with content-addressed deduplication.",
  },
  {
    term: "Provenance",
    definition:
      "Origin tracking (source, timestamp, user, interpretation) so every value traces back to its source.",
  },
  {
    term: "Memory graph",
    definition:
      "The graph of source, observations, entities, relationships, and events with typed edges.",
  },
  {
    term: "Reducer",
    definition:
      "Deterministic function that merges observations into an entity snapshot; same observations always yield the same snapshot.",
  },
  {
    term: "Relationship",
    definition: "Typed connection between two entities (e.g. SETTLES, REFERS_TO, PART_OF).",
  },
  {
    term: "Entity type",
    definition:
      "Classification (e.g. person, company, invoice) that determines the entity schema and resolution rules.",
  },
  {
    term: "Storing",
    definition:
      "Uploading and processing source into the memory graph (unstructured or structured).",
  },
  {
    term: "Retrieving",
    definition:
      "Querying entities, entity snapshots, observations, and related data from the memory graph.",
  },
];

export const FUNCTIONALITY_MATRIX: FunctionalityRow[] = [
  {
    functionality: "Get or authenticate the current user.",
    openapi:
      "GET /me, POST /mcp/oauth/initiate, GET /mcp/oauth/authorize, POST /mcp/oauth/token, GET /mcp/oauth/status, GET /mcp/oauth/connections, DELETE /mcp/oauth/connections/{id}",
    endpointDescriptions: [
      "Get the current user.",
      "Initiate the OAuth flow.",
      "Handle the OAuth authorize redirect.",
      "Exchange the OAuth code for a token.",
      "Get OAuth connection status.",
      "List OAuth connections.",
      "Remove an OAuth connection.",
    ],
    endpointParameters: [
      "—",
      "body: auth_provider, redirect_uri",
      "query: code, state",
      "body: code, code_verifier",
      "—",
      "—",
      "path: id",
    ],
    cli: "auth login, auth status, auth whoami, request (OAuth ops)",
    cliParameters: ["—", "—", "—", "—"],
    mcp: "get_authenticated_user",
    mcpParameters: ["—"],
    testCoverage: "cli_auth_commands, mcp_oauth_flow, mcp_oauth (service)",
  },
  {
    functionality: "Query entities with filters.",
    openapi: "POST /entities/query",
    endpointDescriptions: ["Query entities with filters."],
    endpointParameters: ["body: filters, limit, offset"],
    cli: "entities list",
    cliParameters: ["--type, --limit, --offset, --search"],
    mcp: "retrieve_entities",
    mcpParameters: ["filters, limit?, search?"],
    testCoverage:
      "cli_entity_subcommands, cli_to_mcp_entities, mcp_entity_variations, mcp_query_variations, entity_queries",
  },
  {
    functionality: "Get an entity by ID.",
    openapi: "GET /entities/{id}",
    endpointDescriptions: ["Get an entity by ID."],
    endpointParameters: ["path: id"],
    cli: "entities get",
    cliParameters: ["<entity_id>"],
    mcp: "—",
    testCoverage: "cli_entity_subcommands, cli_to_mcp_entities",
  },
  {
    functionality: "Get an entity snapshot with provenance.",
    openapi: "POST /get_entity_snapshot",
    endpointDescriptions: ["Get an entity snapshot with provenance."],
    endpointParameters: ["body: entity_id, at?"],
    cli: "request --operation getEntitySnapshot",
    cliParameters: ["--entity-id, --at?"],
    mcp: "retrieve_entity_snapshot",
    mcpParameters: ["entity_id, at?"],
    testCoverage: "cli_to_mcp_entities, mcp_resource_variations, cli_to_mcp_stats_snapshots",
  },
  {
    functionality: "List observations for an entity or get field provenance.",
    openapi: "GET /entities/{id}/observations, POST /list_observations, POST /get_field_provenance",
    endpointDescriptions: [
      "List observations for an entity.",
      "List observations by query.",
      "Get provenance for a field.",
    ],
    endpointParameters: ["path: id", "body: filters", "body: entity_id, field"],
    cli: "request (getEntityObservations, listObservationsForEntity, getFieldProvenance)",
    cliParameters: ["--entity-id (or body)", "—", "—"],
    mcp: "list_observations, retrieve_field_provenance",
    mcpParameters: ["entity_id", "entity_id, field"],
    testCoverage: "cli_observation_commands, mcp_resource_variations",
  },
  {
    functionality: "List relationships for an entity.",
    openapi: "GET /entities/{id}/relationships, POST /list_relationships",
    endpointDescriptions: ["List relationships for an entity.", "List relationships by query."],
    endpointParameters: ["path: id", "body: filters"],
    cli: "relationships list",
    cliParameters: ["--entity-id"],
    mcp: "list_relationships",
    mcpParameters: ["entity_id"],
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations",
  },
  {
    functionality: "Search for an entity by identifier or semantic.",
    openapi: "POST /retrieve_entity_by_identifier",
    endpointDescriptions: ["Search for an entity by identifier or semantic."],
    endpointParameters: ["body: identifier, entity_type?"],
    cli: "entities search",
    cliParameters: ["--query, --type"],
    mcp: "retrieve_entity_by_identifier",
    mcpParameters: ["identifier, entity_type?"],
    testCoverage: "cli_query_commands, mcp_entity_variations",
  },
  {
    functionality: "Retrieve related entities or the graph neighborhood.",
    openapi: "POST /retrieve_related_entities, POST /retrieve_graph_neighborhood",
    endpointDescriptions: ["Retrieve related entities.", "Retrieve the graph neighborhood."],
    endpointParameters: [
      "body: entity_id, relationship_types?, depth?",
      "body: node_id, node_type",
    ],
    cli: "entities related, entities neighborhood",
    cliParameters: ["--entity-id", "--entity-id"],
    mcp: "retrieve_related_entities, retrieve_graph_neighborhood",
    mcpParameters: ["entity_id, relationship_types?, depth?", "node_id, node_type"],
    testCoverage: "cli_query_commands, mcp_graph_variations",
  },
  {
    functionality: "Merge two entities.",
    openapi: "POST /entities/merge",
    endpointDescriptions: ["Merge two entities."],
    endpointParameters: ["body: source_entity_id, target_entity_id"],
    cli: "request --operation mergeEntities",
    cliParameters: ["--source-id, --target-id"],
    mcp: "merge_entities",
    mcpParameters: ["source_entity_id, target_entity_id"],
    testCoverage: "cli_entity_subcommands, mcp_entity_variations",
  },
  {
    functionality: "Delete or restore an entity.",
    openapi: "POST /delete_entity, POST /restore_entity",
    endpointDescriptions: ["Delete an entity.", "Restore an entity."],
    endpointParameters: ["body: entity_id", "body: entity_id"],
    cli: "entities delete, entities restore",
    cliParameters: ["<entity_id>", "<entity_id>"],
    mcp: "delete_entity, restore_entity",
    mcpParameters: ["entity_id", "entity_id"],
    testCoverage: "cli_entity_subcommands, deletion (service), mcp_correction_variations",
  },
  {
    functionality: "List sources or get a source by ID.",
    openapi: "GET /sources, GET /sources/{id}",
    endpointDescriptions: ["List sources.", "Get a source by ID."],
    endpointParameters: ["query: limit?, offset?", "path: id"],
    cli: "sources list, request --operation getSourceById",
    cliParameters: ["—", "—"],
    mcp: "—",
    testCoverage: "cli_source_commands, mcp_resources",
  },
  {
    functionality: "List, query, or create observations.",
    openapi: "GET /observations, POST /observations/query, POST /observations/create",
    endpointDescriptions: ["List observations.", "Query observations.", "Create an observation."],
    endpointParameters: ["query: limit?, offset?", "body: filters", "body: entity_id, fields"],
    cli: "request (listObservations), observations list",
    cliParameters: ["—", "—"],
    mcp: "—",
    testCoverage: "cli_observation_commands, observation_ingestion",
  },
  {
    functionality: "List relationships, get one by ID, or get a snapshot.",
    openapi: "GET /relationships, GET /relationships/{id}, POST /relationships/snapshot",
    endpointDescriptions: [
      "List relationships.",
      "Get a relationship by ID.",
      "Get a relationship snapshot.",
    ],
    endpointParameters: ["query: limit?, offset?", "path: id", "body: relationship_key or ids"],
    cli: "relationships list, request (getRelationshipById), relationships get-snapshot",
    cliParameters: ["—", "—", "—"],
    mcp: "get_relationship_snapshot",
    mcpParameters: ["relationship_key"],
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations, relationship_snapshots",
  },
  {
    functionality: "Create, delete, or restore a relationship.",
    openapi: "POST /create_relationship, POST /delete_relationship, POST /restore_relationship",
    endpointDescriptions: [
      "Create a relationship.",
      "Delete a relationship.",
      "Restore a relationship.",
    ],
    endpointParameters: [
      "body: relationship_type, source_entity_id, target_entity_id",
      "body: relationship_key",
      "body: relationship_key",
    ],
    cli: "request (createRelationship), relationships delete, relationships restore",
    cliParameters: ["--source-id, --target-id, --type", "--relationship-key", "--relationship-key"],
    mcp: "create_relationship, delete_relationship, restore_relationship",
    mcpParameters: [
      "relationship_type, source_entity_id, target_entity_id",
      "relationship_key",
      "relationship_key",
    ],
    testCoverage:
      "cli_relationship_commands, cli_correction_commands, mcp_relationship_variations, deletion (service)",
  },
  {
    functionality: "List timeline events or get one by ID.",
    openapi: "GET /timeline, GET /timeline/{id}",
    endpointDescriptions: ["List timeline events.", "Get a timeline event by ID."],
    endpointParameters: ["query: type?, from?, to?", "path: id"],
    cli: "timeline list, timeline get",
    cliParameters: ["—", "<id>"],
    mcp: "list_timeline_events",
    mcpParameters: ["type?, from?, to?"],
    testCoverage: "cli_timeline_commands, cli_to_mcp_stats_snapshots, event_generation",
  },
  {
    functionality: "List schema types or get a schema by entity type.",
    openapi: "GET /schemas, GET /schemas/{entity_type}",
    endpointDescriptions: ["List schema types.", "Get a schema for an entity type."],
    endpointParameters: ["—", "path: entity_type"],
    cli: "schemas list, schemas get",
    cliParameters: ["—", "<entity_type>"],
    mcp: "list_entity_types",
    mcpParameters: ["keyword?"],
    testCoverage: "cli_to_mcp_schemas, cli_schema_commands, mcp_schema_variations",
  },
  {
    functionality:
      "Analyze schema candidates, get recommendations, update incrementally, or register a schema.",
    openapi:
      "POST /analyze_schema_candidates, POST /get_schema_recommendations, POST /update_schema_incremental, POST /register_schema",
    endpointDescriptions: [
      "Analyze schema candidates.",
      "Get schema recommendations.",
      "Update a schema incrementally.",
      "Register a schema.",
    ],
    endpointParameters: [
      "body: entity_type, entity_id?",
      "body: entity_type",
      "body: entity_type, new_fields",
      "body: schema",
    ],
    cli: "schemas analyze-candidates, schemas recommendations, schemas update-incremental, schemas register",
    cliParameters: ["--entity-type", "--entity-type", "--entity-type", "—"],
    mcp: "analyze_schema_candidates, get_schema_recommendations, update_schema_incremental, register_schema",
    mcpParameters: ["entity_type, entity_id?", "entity_type", "entity_type, new_fields", "schema"],
    testCoverage:
      "cli_schema_commands, mcp_schema_actions, mcp_schema_variations, schema_recommendation (service), schema_recommendation_integration",
  },
  {
    functionality: "Store structured entities.",
    openapi: "POST /store",
    endpointDescriptions: ["Store structured entities."],
    endpointParameters: ["body: entities, idempotency_key?, relationships?"],
    cli: "store",
    cliParameters: ["--json"],
    mcp: "store, store_structured",
    mcpParameters: [
      "entities, file_path?, idempotency_key?",
      "entities, idempotency_key?, relationships?",
    ],
    testCoverage:
      "cli_store_commands, cli_to_mcp_store, mcp_store_variations, fixture_mcp_store_replay",
  },
  {
    functionality: "Store an unstructured file.",
    openapi: "POST /store/unstructured",
    endpointDescriptions: ["Store an unstructured file."],
    endpointParameters: ["body: file_path or file_content, mime_type"],
    cli: "upload <path>",
    cliParameters: ["<path>, --no-interpret?, --mime-type?"],
    mcp: "store_unstructured",
    mcpParameters: ["file_path or file_content, mime_type"],
    testCoverage:
      "cli_store_commands, mcp_store_unstructured, mcp_store_parquet, nonjson_csv_store_behavior",
  },
  {
    functionality: "Submit a correction or reinterpret a source.",
    openapi: "POST /correct, POST /reinterpret",
    endpointDescriptions: ["Submit a correction.", "Reinterpret a source."],
    endpointParameters: ["body: entity_id, field, value", "body: source_id"],
    cli: "corrections create, interpretations reinterpret",
    cliParameters: ["—", "<source_id>"],
    mcp: "correct, reinterpret",
    mcpParameters: ["entity_id, field, value", "source_id"],
    testCoverage: "cli_correction_commands, mcp_correction_variations, interpretation (service)",
  },
  {
    functionality: "List interpretations.",
    openapi: "GET /interpretations",
    endpointDescriptions: ["List interpretations."],
    endpointParameters: ["query: limit?, offset?"],
    cli: "request --operation listInterpretations",
    cliParameters: ["—"],
    mcp: "—",
    testCoverage: "cli_observation_commands, interpretation (service)",
  },
  {
    functionality: "Get server stats, server info, or run health check snapshots.",
    openapi: "GET /stats, GET /server-info, POST /health_check_snapshots",
    endpointDescriptions: ["Get server stats.", "Get server info.", "Run health check snapshots."],
    endpointParameters: ["—", "—", "—"],
    cli: "stats, snapshots check",
    cliParameters: ["—", "—"],
    mcp: "health_check_snapshots",
    mcpParameters: ["—"],
    testCoverage: "cli_stats_commands, cli_to_mcp_stats_snapshots, dashboard_stats",
  },
  {
    functionality: "Get a signed file URL (internal).",
    openapi: "GET /get_file_url (internal path)",
    endpointDescriptions: ["Get a signed file URL (internal)."],
    endpointParameters: ["query: path"],
    cli: "request --operation getFileUrl",
    cliParameters: ["—"],
    mcp: "retrieve_file_url",
    mcpParameters: ["path"],
    testCoverage: "mcp_resources, contract_mapping",
  },
];

/** Derived from FUNCTIONALITY_MATRIX: one row per MCP action, with description and parameters. */
export const MCP_ACTIONS_TABLE: McpActionRow[] = (() => {
  const rows: McpActionRow[] = [];
  for (const row of FUNCTIONALITY_MATRIX) {
    const actions = row.mcp
      .split(",")
      .map((s) => s.trim())
      .filter((a) => a && a !== "—");
    const desc = row.functionality;
    const params = row.mcpParameters ?? [];
    for (let i = 0; i < actions.length; i++) {
      rows.push({ action: actions[i], description: desc, parameters: params[i] ?? "—" });
    }
  }
  return rows;
})();

/** Derived from FUNCTIONALITY_MATRIX: one row per CLI command, with description and flags/parameters. */
export const CLI_COMMANDS_TABLE: CliCommandRow[] = (() => {
  const rows: CliCommandRow[] = [];
  for (const row of FUNCTIONALITY_MATRIX) {
    const commands = row.cli
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const desc = row.functionality;
    const params = row.cliParameters ?? [];
    for (let i = 0; i < commands.length; i++) {
      rows.push({ command: commands[i], description: desc, parameters: params[i] ?? "—" });
    }
  }
  return rows;
})();

export interface LearnMoreCardItem {
  label: string;
  title: string;
  description: string;
  href: string;
  imageUrl?: string;
  /** Call-to-action text (e.g. "Visit repo"). Defaults to "Read more →". */
  ctaLabel?: string;
}

/** Repository card (first in Learn more). Uses official GitHub Mark. */
export const LEARN_MORE_REPO_CARD: LearnMoreCardItem = {
  label: "Repository",
  title: "Neotoma on GitHub",
  description:
    "Source code, README with installation and MCP setup, and the rationale for the truth layer. Clone, contribute, or open issues.",
  href: "https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#neotoma-truth-layer-for-persistent-agent-memory",
  imageUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  ctaLabel: "Visit repo →",
};

export const LEARN_MORE_POSTS: LearnMoreCardItem[] = [
  {
    label: "Related post",
    title: "Building a truth layer for persistent agent memory",
    description:
      "Why a deterministic, inspectable memory substrate for AI tools matters and how Neotoma fits.",
    href: "https://markmhendrickson.com/posts/truth-layer-agent-memory",
    imageUrl: "https://markmhendrickson.com/images/posts/truth-layer-agent-memory-hero.png",
  },
  {
    label: "Related post",
    title: "Agent command centers need one source of truth",
    description:
      "Positioning Neotoma as the backend for agent dashboards and command centers; multi-layer memory above the truth layer.",
    href: "https://markmhendrickson.com/posts/agent-command-centers-source-of-truth",
    imageUrl:
      "https://markmhendrickson.com/images/posts/agent-command-centers-source-of-truth-hero.png",
  },
  {
    label: "Related post",
    title: "Six agentic trends I'm betting on (and how I might be wrong)",
    description:
      "The structural pressures that underpin my work, and what would invalidate them as the AI industry evolves. Neotoma is built in response to these assumptions.",
    href: "https://markmhendrickson.com/posts/six-agentic-trends-betting-on",
    imageUrl: "https://markmhendrickson.com/images/posts/six-agentic-trends-betting-on-hero.png",
  },
];

export const SITE_METADATA = {
  canonicalUrl: "https://neotoma.io/",
  ogImageUrl: "https://neotoma.io/neotoma-hero.png",
  pageTitle: "Neotoma | Truth layer for persistent agent memory",
  pageDescription:
    "Neotoma is a truth layer for persistent agent memory. Install with npm and configure MCP for Claude, Cursor, or Codex. Deterministic, queryable entities and provenance.",
  heroImageUrl: "neotoma-hero.png",
};

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#2d1b69"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#bg)"/>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="white">N</text>
</svg>`;
