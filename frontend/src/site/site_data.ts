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
  cli: string;
  mcp: string;
  testCoverage: string;
}

export interface GlossaryRow {
  term: string;
  definition: string;
}

export const SITE_SECTIONS: SiteSection[] = [
  { id: "install", label: "Install with npm", shortLabel: "Install", icon: "Package" },
  { id: "terminology", label: "Core terminology", shortLabel: "Terminology", icon: "BookText" },
  { id: "agent-instructions", label: "Instructions", shortLabel: "Instructions", icon: "Bot" },
  { id: "functionality", label: "API and OpenAPI specification", shortLabel: "API", icon: "SatelliteDish" },
  { id: "configure-mcp", label: "Model Context Protocol (MCP) server", shortLabel: "MCP", icon: "Server" },
  { id: "cli", label: "Command-line interface (CLI)", shortLabel: "CLI", icon: "Terminal" },
  { id: "learn-more", label: "Learn more", shortLabel: "Learn more", icon: "GraduationCap" },
];

export const SITE_CODE_SNIPPETS = {
  installCommands: `# Global install
npm install -g neotoma

# Initialize (creates data dirs/db/config; in repo it can also create or update .env)
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
    definition:
      "Typed connection between two entities (e.g. SETTLES, REFERS_TO, PART_OF).",
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
    functionality: "Auth / current user",
    openapi:
      "GET /me, POST /mcp/oauth/initiate, GET /mcp/oauth/authorize, POST /mcp/oauth/token, GET /mcp/oauth/status, GET /mcp/oauth/connections, DELETE /mcp/oauth/connections/{id}",
    endpointDescriptions: [
      "Get current user",
      "Initiate OAuth flow",
      "OAuth authorize redirect",
      "Exchange OAuth token",
      "OAuth connection status",
      "List OAuth connections",
      "Remove OAuth connection",
    ],
    cli: "auth login, auth status, auth whoami, request (OAuth ops)",
    mcp: "get_authenticated_user",
    testCoverage: "cli_auth_commands, mcp_oauth_flow, mcp_oauth (service)",
  },
  {
    functionality: "Query entities (list with filters)",
    openapi: "POST /entities/query",
    endpointDescriptions: ["Query entities with filters"],
    cli: "entities list",
    mcp: "retrieve_entities",
    testCoverage:
      "cli_entity_subcommands, cli_to_mcp_entities, mcp_entity_variations, mcp_query_variations, entity_queries",
  },
  {
    functionality: "Get entity by ID",
    openapi: "GET /entities/{id}",
    endpointDescriptions: ["Get entity by ID"],
    cli: "entities get",
    mcp: "—",
    testCoverage: "cli_entity_subcommands, cli_to_mcp_entities",
  },
  {
    functionality: "Entity snapshot with provenance",
    openapi: "POST /get_entity_snapshot",
    endpointDescriptions: ["Get entity snapshot with provenance"],
    cli: "request --operation getEntitySnapshot",
    mcp: "retrieve_entity_snapshot",
    testCoverage:
      "cli_to_mcp_entities, mcp_resource_variations, cli_to_mcp_stats_snapshots",
  },
  {
    functionality: "Entity observations and field provenance",
    openapi:
      "GET /entities/{id}/observations, POST /list_observations, POST /get_field_provenance",
    endpointDescriptions: [
      "List observations for entity",
      "List observations (query)",
      "Get field provenance",
    ],
    cli:
      "request (getEntityObservations, listObservationsForEntity, getFieldProvenance)",
    mcp: "list_observations, retrieve_field_provenance",
    testCoverage: "cli_observation_commands, mcp_resource_variations",
  },
  {
    functionality: "Entity relationships (list for entity)",
    openapi: "GET /entities/{id}/relationships, POST /list_relationships",
    endpointDescriptions: ["List relationships for entity", "List relationships (query)"],
    cli: "relationships list",
    mcp: "list_relationships",
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations",
  },
  {
    functionality: "Search entity by identifier / semantic",
    openapi: "POST /retrieve_entity_by_identifier",
    endpointDescriptions: ["Search entity by identifier or semantic"],
    cli: "entities search",
    mcp: "retrieve_entity_by_identifier",
    testCoverage: "cli_query_commands, mcp_entity_variations",
  },
  {
    functionality: "Related entities and graph neighborhood",
    openapi:
      "POST /retrieve_related_entities, POST /retrieve_graph_neighborhood",
    endpointDescriptions: ["Retrieve related entities", "Retrieve graph neighborhood"],
    cli: "entities related, entities neighborhood",
    mcp: "retrieve_related_entities, retrieve_graph_neighborhood",
    testCoverage: "cli_query_commands, mcp_graph_variations",
  },
  {
    functionality: "Merge entities",
    openapi: "POST /entities/merge",
    endpointDescriptions: ["Merge entities"],
    cli: "request --operation mergeEntities",
    mcp: "merge_entities",
    testCoverage: "cli_entity_subcommands, mcp_entity_variations",
  },
  {
    functionality: "Delete / restore entity",
    openapi: "POST /delete_entity, POST /restore_entity",
    endpointDescriptions: ["Delete entity", "Restore entity"],
    cli: "entities delete, entities restore",
    mcp: "delete_entity, restore_entity",
    testCoverage:
      "cli_entity_subcommands, deletion (service), mcp_correction_variations",
  },
  {
    functionality: "Sources (list, get)",
    openapi: "GET /sources, GET /sources/{id}",
    endpointDescriptions: ["List sources", "Get source by ID"],
    cli: "sources list, request --operation getSourceById",
    mcp: "—",
    testCoverage: "cli_source_commands, mcp_resources",
  },
  {
    functionality: "Observations (list, query, create)",
    openapi:
      "GET /observations, POST /observations/query, POST /observations/create",
    endpointDescriptions: ["List observations", "Query observations", "Create observation"],
    cli: "request (listObservations), observations list",
    mcp: "—",
    testCoverage: "cli_observation_commands, observation_ingestion",
  },
  {
    functionality: "Relationships (list, get, snapshot)",
    openapi:
      "GET /relationships, GET /relationships/{id}, POST /relationships/snapshot",
    endpointDescriptions: ["List relationships", "Get relationship by ID", "Get relationship snapshot"],
    cli:
      "relationships list, request (getRelationshipById), relationships get-snapshot",
    mcp: "get_relationship_snapshot",
    testCoverage:
      "cli_relationship_commands, cli_to_mcp_relationships, mcp_relationship_variations, relationship_snapshots",
  },
  {
    functionality: "Create / delete / restore relationship",
    openapi:
      "POST /create_relationship, POST /delete_relationship, POST /restore_relationship",
    endpointDescriptions: ["Create relationship", "Delete relationship", "Restore relationship"],
    cli:
      "request (createRelationship), relationships delete, relationships restore",
    mcp: "create_relationship, delete_relationship, restore_relationship",
    testCoverage:
      "cli_relationship_commands, cli_correction_commands, mcp_relationship_variations, deletion (service)",
  },
  {
    functionality: "Timeline events",
    openapi: "GET /timeline, GET /timeline/{id}",
    endpointDescriptions: ["List timeline events", "Get timeline event by ID"],
    cli: "timeline list, timeline get",
    mcp: "list_timeline_events",
    testCoverage:
      "cli_timeline_commands, cli_to_mcp_stats_snapshots, event_generation",
  },
  {
    functionality: "Schemas (list types, get schema)",
    openapi: "GET /schemas, GET /schemas/{entity_type}",
    endpointDescriptions: ["List schema types", "Get schema for entity type"],
    cli: "schemas list, schemas get",
    mcp: "list_entity_types",
    testCoverage: "cli_to_mcp_schemas, cli_schema_commands, mcp_schema_variations",
  },
  {
    functionality: "Schema analysis and incremental update",
    openapi:
      "POST /analyze_schema_candidates, POST /get_schema_recommendations, POST /update_schema_incremental, POST /register_schema",
    endpointDescriptions: [
      "Analyze schema candidates",
      "Get schema recommendations",
      "Update schema incrementally",
      "Register schema",
    ],
    cli:
      "schemas analyze-candidates, schemas recommendations, schemas update-incremental, schemas register",
    mcp:
      "analyze_schema_candidates, get_schema_recommendations, update_schema_incremental, register_schema",
    testCoverage:
      "cli_schema_commands, mcp_schema_actions, mcp_schema_variations, schema_recommendation (service), schema_recommendation_integration",
  },
  {
    functionality: "Store (structured entities)",
    openapi: "POST /store",
    endpointDescriptions: ["Store structured entities"],
    cli: "store",
    mcp: "store, store_structured",
    testCoverage:
      "cli_store_commands, cli_to_mcp_store, mcp_store_variations, fixture_mcp_store_replay",
  },
  {
    functionality: "Store (unstructured files)",
    openapi: "POST /store/unstructured",
    endpointDescriptions: ["Store unstructured file"],
    cli: "upload <path>",
    mcp: "store_unstructured",
    testCoverage:
      "cli_store_commands, mcp_store_unstructured, mcp_store_parquet, nonjson_csv_store_behavior",
  },
  {
    functionality: "Correct and reinterpret",
    openapi: "POST /correct, POST /reinterpret",
    endpointDescriptions: ["Submit correction", "Reinterpret source"],
    cli: "corrections create, interpretations reinterpret",
    mcp: "correct, reinterpret",
    testCoverage:
      "cli_correction_commands, mcp_correction_variations, interpretation (service)",
  },
  {
    functionality: "Interpretations (list)",
    openapi: "GET /interpretations",
    endpointDescriptions: ["List interpretations"],
    cli: "request --operation listInterpretations",
    mcp: "—",
    testCoverage: "cli_observation_commands, interpretation (service)",
  },
  {
    functionality: "Stats and health",
    openapi: "GET /stats, GET /server-info, POST /health_check_snapshots",
    endpointDescriptions: ["Server stats", "Server info", "Health check snapshots"],
    cli: "stats, snapshots check",
    mcp: "health_check_snapshots",
    testCoverage:
      "cli_stats_commands, cli_to_mcp_stats_snapshots, dashboard_stats",
  },
  {
    functionality: "File URL (signed access)",
    openapi: "GET /get_file_url (internal path)",
    endpointDescriptions: ["Get signed file URL (internal)"],
    cli: "request --operation getFileUrl",
    mcp: "retrieve_file_url",
    testCoverage: "mcp_resources, contract_mapping",
  },
];

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
    imageUrl: "https://markmhendrickson.com/images/posts/agent-command-centers-source-of-truth-hero.png",
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
  canonicalUrl: "https://markmhendrickson.github.io/neotoma/",
  ogImageUrl:
    "https://markmhendrickson.com/images/posts/truth-layer-agent-memory-hero.png",
  pageTitle: "Neotoma | Truth layer for persistent agent memory",
  pageDescription:
    "Neotoma is a truth layer for persistent agent memory. Install with npm and configure MCP for Claude, Cursor, or Codex. Deterministic, queryable entities and provenance.",
  heroImageUrl:
    "https://markmhendrickson.com/images/posts/truth-layer-agent-memory-hero.png",
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
