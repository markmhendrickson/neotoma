/** Config-driven schema concept guides for /schemas and /schemas/*. */
export interface SchemaField {
  field: string;
  type: string;
  purpose: string;
}

export interface SchemaSection {
  id: string;
  heading: string;
  body: string;
}

export interface RelatedLink {
  label: string;
  href: string;
  external?: boolean;
  desc: string;
}

export interface SchemaConceptGuide {
  slug: string;
  label: string;
  iconName: string;
  /** One-paragraph intro shown at the top of the page. */
  intro: string;
  /** Short tagline used on the index card. */
  cardTagline: string;
  /** Where this concept sits in the schema lifecycle. */
  flowPosition: string;
  /** Optional code block (DDL or TS shape). */
  schemaTitle?: string;
  schemaCode?: string;
  /** Field-by-field semantics. */
  schemaFields?: SchemaField[];
  /** Free-form prose sections rendered after the schema. */
  sections: SchemaSection[];
  /** Bulleted invariants. */
  mustList: string[];
  mustNotList: string[];
  /** Cross-reference links. */
  related: RelatedLink[];
}

export const REPO_DOCS_BASE =
  "https://github.com/markmhendrickson/neotoma/blob/main/docs";
export const REPO_SRC_BASE =
  "https://github.com/markmhendrickson/neotoma/blob/main/src";

export const SCHEMA_CONCEPT_GUIDES: SchemaConceptGuide[] = [
  {
    slug: "registry",
    label: "Schema registry",
    iconName: "Database",
    cardTagline:
      "Versioned, config-driven entity schemas, the single source of truth for what fields each entity type carries",
    intro:
      "The schema registry is the table that holds every versioned entity schema in Neotoma. It is config-driven by design: domain-specific schemas (contact, invoice, task, …) live as data, not code, so schemas can evolve at runtime without redeploys. Every schema row pairs a field-by-field schema_definition with a reducer_config that controls how observations merge into the entity snapshot.",
    flowPosition:
      "Read on every observation write, every snapshot recomputation, and every schema-projection filter. Sits between the storage layer (sources/observations) and the deterministic reducer.",
    schemaTitle: "schema_registry table (Postgres / hosted)",
    schemaCode: `CREATE TABLE schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user')),
  UNIQUE(entity_type, schema_version)
);`,
    schemaFields: [
      { field: "entity_type", type: "TEXT", purpose: "Domain type label (contact, invoice, task, conversation_message, …)" },
      { field: "schema_version", type: "TEXT", purpose: "Semantic version (1.0.0, 1.1.0, 2.0.0); unique per entity_type" },
      { field: "schema_definition", type: "JSONB", purpose: "Field map: name → { type, required?, validator?, converters?, description? }" },
      { field: "reducer_config", type: "JSONB", purpose: "Per-field merge_policies the reducer uses to compose observations into snapshots" },
      { field: "active", type: "BOOLEAN", purpose: "Exactly one active row per entity_type (per scope) at a time; new writes pick this up immediately" },
      { field: "scope", type: "TEXT", purpose: "global (shared) or user (per-user override that wins when caller's user_id matches)" },
      { field: "user_id", type: "UUID", purpose: "Set when scope = 'user'; lets one tenant evolve their schema without affecting others" },
    ],
    sections: [
      {
        id: "definition-format",
        heading: "Schema definition format",
        body:
          "schema_definition is a JSONB object with a single fields key. Each field carries a type (string | number | date | boolean | array | object), an optional required flag, an optional validator function name, an optional preserveCase flag for canonicalization, an optional description, and an optional converters list for deterministic type coercion (e.g. nanosecond timestamp → ISO 8601 date). The shape is intentionally narrow, schemas describe data, they do not run code.",
      },
      {
        id: "converters",
        heading: "Field type converters",
        body:
          "Converters reconcile real-world data (numeric timestamps, stringified booleans, nested arrays) with the declared field type without losing the original value. A converter is one of a small registry of named, deterministic functions (timestamp_nanos_to_iso, string_to_number, …). Successful conversions land in observations under the schema-typed field; the original value is mirrored into raw_fragments with reason converted_value_original so reprocessing remains lossless.",
      },
      {
        id: "user-specific",
        heading: "Global vs user-specific schemas",
        body:
          "Schemas resolve user-specific first, global second. A user-specific schema row (scope = 'user', user_id = caller) lets a tenant pilot new fields or stricter validators without affecting other users. When a user-specific pattern proves out across many users with consistent types, it can be promoted to a global schema via reconciliation.",
      },
      {
        id: "auto-enhancement",
        heading: "Auto-enhancement from raw_fragments",
        body:
          "Unknown fields encountered at extraction time go to raw_fragments. With auto-enhancement enabled, the system analyses fragment frequency, type consistency, and source diversity, then promotes high-confidence fields (≥95% type consistency, ≥2 sources, ≥3 occurrences by default) into the active schema as a minor version bump. Field blacklists, name validators, and idempotency guards keep noise out.",
      },
      {
        id: "service-interface",
        heading: "Service interface",
        body:
          "register() inserts a new (entity_type, schema_version) row. activate() flips active = true on one version and false on the others within the same scope. updateSchemaIncremental() is the safe upgrade path: pass fields_to_add and/or fields_to_remove, optionally bump the version, optionally migrate historical raw_fragments. loadActiveSchema() is the read used by ingestion and the reducer.",
      },
    ],
    mustList: [
      "Carry a non-null entity_type, schema_version, schema_definition, and reducer_config",
      "Have at most one active row per (entity_type, scope, user_id) combination",
      "Be referenced by every observation via observation.schema_version (immutable on observations)",
      "Be the single source of truth for both validation and reducer merge policies",
      "Validate every converter against CONVERTER_REGISTRY before registration",
    ],
    mustNotList: [
      "Mutate schema_definition or reducer_config in place, register a new schema_version instead",
      "Allow more than one active version per entity_type within the same scope",
      "Carry merge logic (that lives in the reducer), only declarative merge_policies",
      "Be edited from outside the schema registry service",
    ],
    related: [
      { label: "Schema registry doc", href: `${REPO_DOCS_BASE}/subsystems/schema_registry.md`, external: true, desc: "Full table definition, definition format, service interface" },
      { label: "Merge policies", href: "/schemas/merge-policies", desc: "How reducer_config drives deterministic snapshot merging" },
      { label: "Storage layers", href: "/schemas/storage-layers", desc: "Three-layer storage: raw_text, properties, raw_fragments" },
      { label: "Versioning & evolution", href: "/schemas/versioning", desc: "Semver rules, breaking changes, schema snapshot exports" },
      { label: "Schema definitions (code)", href: `${REPO_SRC_BASE}/services/schema_definitions.ts`, external: true, desc: "src/services/schema_definitions.ts, current source of truth in code" },
    ],
  },
  {
    slug: "merge-policies",
    label: "Merge policies",
    iconName: "GitMerge",
    cardTagline:
      "Per-field declarative rules that turn many observations into one deterministic snapshot",
    intro:
      "Merge policies are the per-field configuration the reducer uses to collapse a stream of observations into a single entity snapshot. They are declarative, every policy is a strategy plus an optional tie-breaker, no inline code. This is what makes snapshot composition deterministic and replayable: the same observations and the same merge_policies always produce the same snapshot.",
    flowPosition:
      "Sit inside reducer_config on every schema_registry row. Read once per snapshot recomputation. The reducer never falls back to ad-hoc logic, fields without an explicit policy use the documented default last_write.",
    schemaTitle: "ReducerConfig and MergePolicy (TypeScript)",
    schemaCode: `export interface ReducerConfig {
  merge_policies: Record<string, MergePolicy>;
}

export interface MergePolicy {
  strategy:
    | "last_write"
    | "highest_priority"
    | "most_specific"
    | "merge_array";
  tie_breaker?: "observed_at" | "source_priority";
}

// Example: invoice
{
  "merge_policies": {
    "vendor_name":  { "strategy": "highest_priority" },
    "amount_due":   { "strategy": "last_write" },
    "status":       { "strategy": "last_write" },
    "aliases":      { "strategy": "merge_array" },
    "line_items":   { "strategy": "merge_array" }
  }
}`,
    sections: [
      {
        id: "strategies",
        heading: "Four strategies",
        body:
          "last_write picks the most recent observation by observed_at, the right default for fields that change over time (status, amount, address). highest_priority picks the observation with the highest source_priority, the right choice for identity-shaped fields where a user correction (1000) should always beat a structured agent write (100) or AI extraction (0). most_specific picks the observation with the highest specificity_score, useful when one source produces dense, schema-aligned facts and another produces shallow ones. merge_array unions array values across observations, used for aliases, tags, and other accumulating sets.",
      },
      {
        id: "tie-breakers",
        heading: "Tie-breakers",
        body:
          "When two observations score equally under the chosen strategy, the tie_breaker decides. observed_at favours the more recent observation; source_priority favours the higher-priority writer. The default tie-breaker for last_write and most_specific is observed_at; for highest_priority it is source_priority. Ties are resolved deterministically, the reducer never picks at random.",
      },
      {
        id: "default-behaviour",
        heading: "Default behaviour for unmapped fields",
        body:
          "If a field appears in observations but has no entry in merge_policies, for instance, a removed field that still has historical observations, the reducer falls back to last_write. This keeps schema removal from corrupting historic snapshots: removed fields drop out of new snapshots via schema-projection filtering, but until then the policy is well-defined.",
      },
      {
        id: "priority-ladder",
        heading: "Source priority ladder",
        body:
          "highest_priority leans on the source_priority ladder set on each observation: 0 for AI interpretations, 100 for structured agent writes (store), 1000 for explicit user corrections via the correct() path. This is what guarantees user corrections always win without requiring the reducer to know what 'a correction' is, corrections are just observations at priority 1000.",
      },
    ],
    mustList: [
      "Be declarative, strategy + optional tie_breaker, no inline code",
      "Be deterministic, same observations + same policies ⇒ same snapshot",
      "Cover identity-shaped fields with highest_priority so corrections override AI",
      "Use merge_array for accumulating sets (aliases, tags, line items, …)",
      "Resolve ties with the documented tie_breaker, never randomly",
    ],
    mustNotList: [
      "Run arbitrary code, merge logic lives in the reducer, not in policies",
      "Use confidence as a merge signal, confidence is advisory only",
      "Mix strategy types within a single field across versions without a major version bump",
      "Override schema-projection filtering, removed fields drop out of snapshots regardless of policy",
    ],
    related: [
      { label: "Reducer subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/reducer.md`, external: true, desc: "Reducer architecture, merge implementation, snapshot computation" },
      { label: "Schema registry", href: "/schemas/registry", desc: "Where reducer_config lives" },
      { label: "Observations", href: "/primitives/observations", desc: "Source priority ladder and observation shape" },
      { label: "Entity snapshots", href: "/primitives/entity-snapshots", desc: "Reducer output and per-field provenance map" },
      { label: "Determinism doctrine", href: `${REPO_DOCS_BASE}/architecture/determinism.md`, external: true, desc: "Why declarative merge keeps snapshots reproducible" },
    ],
  },
  {
    slug: "storage-layers",
    label: "Storage layers",
    iconName: "Layers",
    cardTagline:
      "raw_text, properties, and raw_fragments, the three places extracted data can land",
    intro:
      "Neotoma uses a three-layer storage model so users can upload anything without losing data while still keeping the queryable state layer schema-compliant and deterministic. Every extraction touches all three layers: the original bytes go to raw_text, schema-defined fields go to observation properties, and everything else goes to raw_fragments, never silently dropped.",
    flowPosition:
      "Spans the boundary between sources and observations. Ingestion partitions every extraction into these three layers before writing.",
    schemaTitle: "Three-layer extraction shape (TypeScript)",
    schemaCode: `// Returned by extractAndValidate()
{
  // Layer 1: raw_text, immutable original bytes, lives on the source
  // (already stored on the sources row by the time extraction runs)

  // Layer 2: properties, schema-compliant only, deterministic, queryable
  properties: {
    schema_version: "1.0",
    invoice_number: "INV-001",
    amount: 1500.0,
    currency: "USD",
    date_issued: "2024-01-15T00:00:00Z",
    vendor_name: "Acme Corp"
  },

  // Layer 3: extraction_metadata, preservation layer
  extraction_metadata: {
    unknown_fields: {
      purchase_order: "PO-789",
      internal_cost_center: "CC-456"
    },
    warnings: [
      {
        type: "unknown_field",
        field: "purchase_order",
        message: "Field not defined for type 'invoice', preserved in extraction_metadata"
      }
    ],
    extraction_quality: {
      fields_extracted_count: 7,
      fields_filtered_count: 2,
      matched_patterns: ["invoice_number_pattern", "amount_due_pattern"]
    }
  }
}`,
    sections: [
      {
        id: "layer-1",
        heading: "Layer 1, raw_text on the source",
        body:
          "The source's raw bytes are immutable and content-addressed (SHA-256 + user_id). They never change after upload, never carry interpreted data, and are the artifact every reinterpretation reads from. Schema evolution does not require re-uploading, the same source can be reinterpreted under a newer schema version at any time.",
      },
      {
        id: "layer-2",
        heading: "Layer 2, observation.properties (schema-compliant)",
        body:
          "Only fields defined in the active schema_definition land in properties. Each properties payload includes schema_version. This is the layer queries hit (JSONB indexed), the layer entity extraction reads from, and the layer the reducer composes into snapshots. By construction it is deterministic: same input bytes + same schema_version + same converters ⇒ same properties.",
      },
      {
        id: "layer-3",
        heading: "Layer 3, raw_fragments (preservation)",
        body:
          "Anything extracted that doesn't match the active schema goes to raw_fragments, unknown fields, original values that were converted, validation warnings, and extraction quality metrics. raw_fragments is the substrate auto-enhancement and the schema expansion architecture analyse to suggest schema upgrades. Because nothing is dropped, schema evolution is non-destructive: re-adding a field surfaces its historical values via schema-projection filtering.",
      },
      {
        id: "partition-rules",
        heading: "Partition rules",
        body:
          "Fields named in the active schema → properties. Fields not named in the schema → raw_fragments as unknown fields. Missing required fields produce warnings on the observation; observations are never rejected for missing optional fields, and never rejected for unknown fields. Required-field failure produces a warning, not a write rejection, the system always preserves what was extracted.",
      },
      {
        id: "entity-extraction",
        heading: "What entity / snapshot composition reads",
        body:
          "Entity extraction and snapshot computation read from properties only. raw_fragments is explicitly excluded from snapshot composition, it is a holding area, not a query target. This is what keeps snapshots deterministic and schema-aligned even when extraction surfaces extra data.",
      },
    ],
    mustList: [
      "Preserve all extracted data, unknown fields go to raw_fragments, never discarded",
      "Always create an observation, even on missing-required-field warnings",
      "Stamp schema_version on every properties payload",
      "Pull entity extraction and snapshot composition fields from properties only",
      "Mirror converter inputs into raw_fragments with reason converted_value_original",
    ],
    mustNotList: [
      "Reject observations for unknown fields",
      "Reject observations for missing optional fields",
      "Store unknown or non-schema fields in observation.properties",
      "Use raw_fragments for entity extraction or snapshot composition",
      "Modify or guess field values during partitioning",
    ],
    related: [
      { label: "Schema handling architecture", href: `${REPO_DOCS_BASE}/architecture/schema_handling.md`, external: true, desc: "Three-layer model, partition logic, validation rules" },
      { label: "Schema registry", href: "/schemas/registry", desc: "Where the active schema_definition lives" },
      { label: "Observations", href: "/primitives/observations", desc: "How properties on observations feed the reducer" },
      { label: "Sources", href: "/primitives/sources", desc: "Layer 1, content-addressed raw bytes" },
      { label: "Schema expansion", href: `${REPO_DOCS_BASE}/architecture/schema_expansion.md`, external: true, desc: "How raw_fragments seed automatic schema growth" },
    ],
  },
  {
    slug: "versioning",
    label: "Versioning & evolution",
    iconName: "GitBranch",
    cardTagline:
      "Semver, additive evolution, breaking changes, and the public schema snapshots dump",
    intro:
      "Schemas evolve all the time. Versioning is what keeps that evolution safe: every observation carries the schema_version it was written under, every snapshot stamps the active schema_version it was computed against, and every breaking change requires a major version bump. New schemas are exported to docs/subsystems/schema_snapshots/ on every register/activate so the public reference always matches the database.",
    flowPosition:
      "Wraps the schema registry. Every schema_registry mutation goes through versioned register / activate / updateSchemaIncremental calls; every mutation triggers an asynchronous snapshot export.",
    schemaTitle: "Semantic versioning rules",
    schemaCode: `1.0.0  // Initial version
1.1.0  // Minor: additive, backward-compatible
       //   - new optional fields
       //   - new converters on existing fields
       //   - non-breaking reducer strategy changes
1.1.1  // Patch: docs, formatting, no schema structure change
2.0.0  // Major: breaking
       //   - removing fields
       //   - changing field types
       //   - making optional fields required
       //   - removing converters

// Migration shape
schemaRegistry.updateSchemaIncremental({
  entity_type: "contact",
  fields_to_add: [
    { field_name: "linkedin_url", field_type: "string", required: false }
  ],
  fields_to_remove: ["legacy_handle"],
  // schema_version auto-increments based on change type
  activate: true,
  migrate_existing: false  // historical raw_fragments stay put unless you backfill
});`,
    sections: [
      {
        id: "additive-by-default",
        heading: "Additive by default",
        body:
          "The common case is additive evolution: new optional fields are added with a minor version bump (1.0.0 → 1.1.0). Existing observations keep their original schema_version and remain valid; new observations pick up the new fields. Snapshots are recomputed against the active schema, which must always handle missing fields from older observations gracefully.",
      },
      {
        id: "breaking-changes",
        heading: "Breaking changes are versioned, not destructive",
        body:
          "Removing a field, changing a type, or making an optional field required is a major version bump (1.x → 2.0). Old observations are immutable, they keep schema_version 1.x, but new snapshots are computed under 2.0. Removed fields stop appearing in snapshots via reducer schema-projection filtering, but the underlying observation data is preserved. Re-adding a removed field restores it in snapshots without re-ingesting anything.",
      },
      {
        id: "incremental-updates",
        heading: "updateSchemaIncremental is the safe path",
        body:
          "updateSchemaIncremental({ fields_to_add, fields_to_remove, schema_version?, scope?, activate?, migrate_existing? }) is the workhorse for runtime evolution. It auto-increments the version (minor for adds, major for removes), can target a user-specific scope, activates the new version atomically, and optionally backfills raw_fragments into observations for historical data. At least one field must remain after removal, a schema cannot become empty.",
      },
      {
        id: "schema-snapshots",
        heading: "Public schema snapshots",
        body:
          "Every register / activate / deactivate triggers an asynchronous export to docs/subsystems/schema_snapshots/{entity_type}/v{version}.json. The export merges the latest definitions from src/services/schema_definitions.ts (authoritative for current code) with historic versions from the schema_registry table. Failures don't block schema operations. You can also run npm run schema:export manually.",
      },
      {
        id: "deterministic-replay",
        heading: "Deterministic replay across versions",
        body:
          "Because observation.schema_version is immutable, Neotoma can recompute any historical snapshot under any active schema version. This is what enables breaking-change reconciliation, audit, and rollback. Same observations + same active schema + same reducer config ⇒ same snapshot, regardless of when the version was activated.",
      },
    ],
    mustList: [
      "Use semantic versioning: minor for additive, major for breaking",
      "Preserve schema_version immutably on every observation",
      "Trigger schema snapshot export on every register / activate / deactivate",
      "Keep at least one field after removal, schemas cannot become empty",
      "Ensure the active schema can read observations from all prior versions gracefully",
    ],
    mustNotList: [
      "Mutate schema_definition in place, always register a new version",
      "Skip a major version bump for breaking changes",
      "Hard-delete observation data when a field is removed, schema-projection filtering handles snapshots",
      "Allow more than one active version per entity_type within the same scope",
      "Block schema operations on snapshot-export failures",
    ],
    related: [
      { label: "Schema registry doc", href: `${REPO_DOCS_BASE}/subsystems/schema_registry.md`, external: true, desc: "Versioning, migration, updateSchemaIncremental" },
      { label: "Schema snapshots README", href: `${REPO_DOCS_BASE}/subsystems/schema_snapshots/README.md`, external: true, desc: "Exported JSON files for every (entity_type, version) and the changelog" },
      { label: "Breaking-change reconciliation example", href: `${REPO_DOCS_BASE}/examples/schema_breaking_change_reconciliation.md`, external: true, desc: "Worked example: how a removed field reconciles in snapshots" },
      { label: "Schema management workflows", href: "/schema-management", desc: "CLI walkthrough: list, validate, evolve, register" },
      { label: "Storage layers", href: "/schemas/storage-layers", desc: "Why removed fields stay queryable as raw_fragments" },
      { label: "Schema registry", href: "/schemas/registry", desc: "The table that holds every version" },
      { label: "Test safely", href: "/non-destructive-testing", desc: "Let an agent populate schemas from your real data without touching your current setup" },
    ],
  },
];

export const SCHEMA_CONCEPT_GUIDES_LIST = SCHEMA_CONCEPT_GUIDES;

export const SCHEMA_CONCEPT_SLUGS = SCHEMA_CONCEPT_GUIDES.map((g) => g.slug);
