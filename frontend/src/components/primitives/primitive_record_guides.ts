export interface SchemaField {
  field: string;
  type: string;
  purpose: string;
}

export interface PrimitiveSection {
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

export interface PrimitiveRecordTypeGuide {
  slug: string;
  label: string;
  singularLabel: string;
  iconName: string;
  intro: string;
  /** Short tagline used on the index card. */
  cardTagline: string;
  /** Position in the three-layer truth model: Source → Interpretation → Observation → Snapshot, plus Relationship and Timeline Event around it. */
  flowPosition: string;
  /** Optional code block (typically Postgres DDL) showing schema. */
  schemaTitle?: string;
  schemaCode?: string;
  /** Field-by-field semantics. */
  schemaFields?: SchemaField[];
  /** Free-form prose sections rendered after the schema. */
  sections: PrimitiveSection[];
  /** Bulleted invariants. */
  mustList: string[];
  mustNotList: string[];
  /** Cross-reference links (subsystem docs, repo source, related primitives). */
  related: RelatedLink[];
}

export const REPO_DOCS_BASE =
  "https://github.com/markmhendrickson/neotoma/blob/main/docs";
export const REPO_SRC_BASE =
  "https://github.com/markmhendrickson/neotoma/blob/main/src";

export const PRIMITIVE_RECORD_TYPE_GUIDES: PrimitiveRecordTypeGuide[] = [
  {
    slug: "entities",
    label: "Entities",
    singularLabel: "entity",
    iconName: "Users",
    cardTagline:
      "Canonical record for every person, company, location, or thing Neotoma knows about",
    intro:
      "An entity is the canonical, durable row that every observation, relationship, and timeline event ultimately points at. The entities table itself is small and stable, aliases, identity decisions, and merge history live here. The rich, current view of an entity lives in entity snapshots, recomputed deterministically from observations.",
    flowPosition:
      "Sits next to the truth pipeline. Observations describe entities; the reducer composes those observations into entity snapshots. Without a stable entities row, observations would have no durable target to attach to.",
    schemaTitle: "entities table (Postgres / hosted)",
    schemaCode: `CREATE TABLE entities (
  id TEXT PRIMARY KEY,                             -- Deterministic hash-based ID
  entity_type TEXT NOT NULL,                       -- 'person', 'company', 'location', 'invoice', …
  canonical_name TEXT NOT NULL,                    -- Normalized name
  aliases JSONB DEFAULT '[]',                      -- Array of alternate names
  metadata JSONB DEFAULT '{}',
  first_seen_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL,
  merged_to_entity_id TEXT REFERENCES entities(id),
  merged_at TIMESTAMPTZ
);`,
    schemaFields: [
      { field: "id", type: "TEXT", purpose: "Deterministic hash-based ID derived from entity_type + canonical_name + user_id; same identity collapses to the same row" },
      { field: "entity_type", type: "TEXT", purpose: "Canonical type label (person, company, location, invoice, …)" },
      { field: "canonical_name", type: "TEXT", purpose: "Normalized name used as part of the identity hash" },
      { field: "aliases", type: "JSONB", purpose: "Alternate spellings, legal names, handles, additive, never destructive" },
      { field: "metadata", type: "JSONB", purpose: "Identity-level metadata (e.g. external IDs); not the rich snapshot view" },
      { field: "first_seen_at", type: "TIMESTAMPTZ", purpose: "Earliest observed_at across observations for this entity" },
      { field: "last_seen_at", type: "TIMESTAMPTZ", purpose: "Most recent observed_at across observations" },
      { field: "user_id", type: "UUID", purpose: "Owner; combined with the identity hash this enforces per-user identity isolation and RLS" },
      { field: "merged_to_entity_id", type: "TEXT", purpose: "Set on merge, points at the surviving entity; the merged-from row stays so historical observations resolve" },
      { field: "merged_at", type: "TIMESTAMPTZ", purpose: "When the merge happened; reads filter merged entities from default queries" },
    ],
    sections: [
      {
        id: "deterministic-id",
        heading: "Deterministic, hash-based identity",
        body:
          "Entity ids are derived from (entity_type, canonical_name, user_id), not generated at random. Re-resolving the same identity converges on the same row, which is what makes ingestion idempotent and lets out-of-order writes attach to the right entity without coordination.",
      },
      {
        id: "small-and-stable",
        heading: "Why the row stays small",
        body:
          "Rich, multi-field truth lives in entity_snapshots, which is recomputed by the reducer. The entities row carries only what has to be durable: identity, aliases, merge state, and ownership. If snapshots are lost they can be rebuilt; the entities row cannot.",
      },
      {
        id: "merge-mechanics",
        heading: "Merge: a repair mechanism, not write-time resolution",
        body:
          "Neotoma does not attempt perfect entity resolution at write time. Duplicates are repaired with merge_entities(from_id, to_id): observations pointing at the loser are rewritten to the winner, the loser's snapshot is deleted, the winner's is recomputed, and the loser row is marked merged with merged_to_entity_id and merged_at set. The loser row stays so historical observations and relationships still resolve.",
      },
      {
        id: "rls",
        heading: "User isolation",
        body:
          "RLS on entities filters by user_id. Identity is per-user, two users can independently have an entity for the same canonical name without colliding. All reads from MCP, HTTP, and CLI go through this filter, and merged entities are excluded from default queries.",
      },
    ],
    mustList: [
      "Carry a non-null entity_type, canonical_name, and user_id",
      "Have a deterministic, hash-derived id so re-resolving the same identity returns the same row",
      "Be the foreign-key target for every observation, relationship, and timeline event for that identity",
      "Be repaired via merge (never destructive deletion), merged rows stay so history resolves",
      "Pass attribution policy enforcement before write",
    ],
    mustNotList: [
      "Be edited destructively after creation, aliases and metadata are additive",
      "Carry the rich, merged truth view (that lives in entity_snapshots)",
      "Be deduplicated across user boundaries, identity is per-user",
      "Be hard-deleted as a routine merge step, the merged-from row stays for provenance",
    ],
    related: [
      { label: "Entities subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/entities.md`, external: true, desc: "Identity, aliases, merge tracking, RLS" },
      { label: "Entity snapshots", href: "/primitives/entity-snapshots", desc: "Reducer output that composes observations into the entity's current truth" },
      { label: "Observations", href: "/primitives/observations", desc: "Granular facts that describe entities" },
      { label: "Relationships", href: "/primitives/relationships", desc: "Typed graph edges between entities" },
      { label: "Entity merge", href: `${REPO_DOCS_BASE}/subsystems/entity_merge.md`, external: true, desc: "Detailed merge mechanics and the entity_merges audit table" },
      { label: "Schema", href: `${REPO_DOCS_BASE}/subsystems/schema.md`, external: true, desc: "Authoritative DDL for entities" },
    ],
  },
  {
    slug: "entity-snapshots",
    label: "Entity snapshots",
    singularLabel: "entity snapshot",
    iconName: "Layers",
    cardTagline:
      "Deterministic reducer output that gives every entity its current, provenance-rich truth",
    intro:
      "An entity snapshot is the deterministic reducer output for one entity, the system's current best answer to 'given every observation we have, what is the truth right now?' Snapshots are derived, cached, and recomputed; observations are the durable ground truth. Every snapshot field carries provenance back to the observation that produced it, and snapshots optionally carry an embedding for semantic search.",
    flowPosition:
      "Source → Interpretation → Observation → Snapshot. Entity snapshots are the rightmost layer of the truth model, the merged view derived from observations, with provenance and embeddings attached.",
    schemaTitle: "entity_snapshots table (Postgres / hosted)",
    schemaCode: `CREATE TABLE entity_snapshots (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  observation_count INTEGER NOT NULL,
  last_observation_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL,
  user_id UUID NOT NULL,
  embedding vector(1536)
);`,
    schemaFields: [
      { field: "entity_id", type: "TEXT", purpose: "Foreign key to entities.id and PK, at most one snapshot per entity" },
      { field: "entity_type", type: "TEXT", purpose: "Mirrors entities.entity_type so reads avoid the join" },
      { field: "schema_version", type: "TEXT", purpose: "Schema version this snapshot was computed against" },
      { field: "snapshot", type: "JSONB", purpose: "The merged, current truth for the entity, computed by the reducer" },
      { field: "provenance", type: "JSONB", purpose: "Map field → observation_id; one entry per snapshot field, drives 'where did this come from?' views" },
      { field: "observation_count", type: "INTEGER", purpose: "Number of observations the snapshot was computed from" },
      { field: "last_observation_at", type: "TIMESTAMPTZ", purpose: "Timestamp of the newest observation included in the snapshot" },
      { field: "computed_at", type: "TIMESTAMPTZ", purpose: "Wall-clock time of the most recent reducer run" },
      { field: "embedding", type: "vector(1536)", purpose: "Optional embedding of the snapshot for semantic similarity search; partial ivfflat index covers non-null rows" },
      { field: "user_id", type: "UUID", purpose: "Owner; mirrors entities.user_id for RLS" },
    ],
    sections: [
      {
        id: "deterministic",
        heading: "Deterministic by construction",
        body:
          "Same observations + same schema + same reducer config ⇒ same snapshot, byte-for-byte (modulo computed_at). Re-running the reducer never randomly changes a field. This is what lets Neotoma replay historical state, audit truth, and detect non-determinism in custom reducers.",
      },
      {
        id: "provenance-map",
        heading: "Provenance map",
        body:
          "provenance is a JSONB object whose keys are snapshot field names and whose values are the observation_id that produced each value. From there the chain is fully resolvable: observation → source (raw bytes) and observation → interpretation (model, prompt, schema version). Every snapshot field has exactly one provenance entry, no field is unsourced.",
      },
      {
        id: "lifecycle",
        heading: "When the reducer runs",
        body:
          "The reducer recomputes a snapshot when its observation set changes: a new observation arrives, a reinterpretation completes, an entity merge rewrites observations from a loser entity to a winner, or a schema upgrade requires recomputation against a new schema_version. Reads never trigger recomputation, snapshots are cached state.",
      },
      {
        id: "embeddings",
        heading: "Embeddings and vector parity",
        body:
          "Snapshots optionally carry a 1536-dimensional embedding for semantic similarity search. The cosine ivfflat index is partial (lists=100) and only covers rows where embedding is not null. In local SQLite mode the column is mirrored into a sqlite-vec virtual table (entity_embeddings_vec) plus a join table (entity_embedding_rows) so KNN queries get the same shape as hosted.",
      },
      {
        id: "merge-and-recompute",
        heading: "Merge deletes the loser, recomputes the winner",
        body:
          "When two entities are merged, the loser's snapshot is deleted (the loser entity has no more observations pointing at it), and the winner's snapshot is recomputed deterministically from the union of observations. Reads filter merged entities by default, so the loser disappears from default views without any retroactive rewriting of history.",
      },
    ],
    mustList: [
      "Have exactly one row per entity (PK on entity_id)",
      "Be byte-for-byte reproducible from observations + schema + reducer config (modulo computed_at)",
      "Carry a provenance entry for every field in snapshot",
      "Stamp schema_version, observation_count, last_observation_at, and computed_at on every recomputation",
      "Be filtered by user ownership on every read path",
    ],
    mustNotList: [
      "Be edited directly by clients or agents, every change is the reducer reacting to new observations",
      "Survive an entity merge on the merged-from side, the loser's snapshot is deleted, the winner's is recomputed",
      "Be treated as durable ground truth, observations are durable, snapshots are derived",
      "Carry a value in snapshot without a corresponding provenance entry",
    ],
    related: [
      { label: "Entity snapshots subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/entity_snapshots.md`, external: true, desc: "Schema, computation, provenance, embeddings, merge interaction" },
      { label: "Entities", href: "/primitives/entities", desc: "Canonical entity row this snapshot is derived for" },
      { label: "Observations", href: "/primitives/observations", desc: "Atoms of ground truth the reducer composes" },
      { label: "Reducer", href: `${REPO_DOCS_BASE}/subsystems/reducer.md`, external: true, desc: "Architecture, merge strategies, converters" },
      { label: "Vector ops", href: `${REPO_DOCS_BASE}/subsystems/vector_ops.md`, external: true, desc: "Embedding generation, ivfflat tuning, sqlite-vec parity" },
      { label: "Determinism doctrine", href: `${REPO_DOCS_BASE}/architecture/determinism.md`, external: true, desc: "Why snapshot reproducibility matters" },
    ],
  },
  {
    slug: "sources",
    label: "Sources",
    singularLabel: "source",
    iconName: "Database",
    cardTagline:
      "Content-addressed raw storage for every byte that ever entered Neotoma",
    intro:
      "A source is the raw, content-addressed artifact that every other primitive ultimately traces back to: a file you uploaded, a webhook payload, a structured agent write. Sources are deduplicated per user by SHA-256 content hash so the same bytes are never stored twice.",
    flowPosition:
      "Source → Interpretation → Observation → Snapshot. Sources are the leftmost, immutable foundation of the three-layer truth model.",
    schemaTitle: "sources table (Postgres / hosted)",
    schemaCode: `CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);`,
    schemaFields: [
      { field: "id", type: "UUID", purpose: "Stable source identifier referenced by every observation, interpretation, and timeline event derived from it" },
      { field: "content_hash", type: "TEXT", purpose: "SHA-256 of the raw bytes; combined with user_id it is the deduplication key" },
      { field: "storage_url", type: "TEXT", purpose: "Where the bytes actually live (object storage, local disk, …)" },
      { field: "storage_status", type: "TEXT", purpose: "uploaded / pending / failed; ingestion uses this to gate downstream interpretation" },
      { field: "mime_type", type: "TEXT", purpose: "Used to choose the right interpreter and to render the source back to humans" },
      { field: "byte_size", type: "INTEGER", purpose: "Quota accounting, integrity sanity-check" },
      { field: "source_type", type: "TEXT", purpose: "Classifier (file, http, structured, …) used by the read path and Inspector" },
      { field: "source_agent_id", type: "TEXT", purpose: "Optional attribution of the writing agent (AAuth tier, clientInfo)" },
      { field: "source_metadata", type: "JSONB", purpose: "Free-form provenance (URL, headers, capture tool, etc.)" },
      { field: "user_id", type: "UUID", purpose: "Owner; combined with content_hash this enforces per-user dedupe and RLS" },
    ],
    sections: [
      {
        id: "deduplication",
        heading: "Per-user content addressing",
        body:
          "Two writes of identical bytes by the same user collapse to a single sources row via the unique (content_hash, user_id) constraint. Two different users uploading the same bytes get two distinct sources rows: deduplication is intentionally not cross-user so privacy boundaries remain intact and per-user storage accounting stays accurate.",
      },
      {
        id: "lifecycle",
        heading: "Lifecycle",
        body:
          "Sources are created by the ingest path, consumed by zero or more interpretations, and (if the user explicitly deletes) cascade-removed along with their interpretations, observations, and timeline events. Reinterpretation never touches the sources row, it creates a new interpretations row pointing at the same source.",
      },
      {
        id: "rls",
        heading: "Row-level security",
        body:
          "All downstream reads filter by source_id ∈ caller's owned sources. Even where user_id is denormalised onto downstream rows, the source-scoped filter is the security boundary. Only the MCP server writes sources via service_role; clients never insert directly.",
      },
    ],
    mustList: [
      "Carry a non-null content_hash, byte_size, mime_type, source_type, and user_id",
      "Be deduplicated per user, repeat ingest of identical bytes returns the existing row",
      "Be referenced by every interpretation, observation, and timeline event derived from them (FK enforced)",
      "Be deletable only via explicit user action, which cascades to all derived primitives",
    ],
    mustNotList: [
      "Be mutated after upload, bytes and metadata are append-only",
      "Be deduped across user boundaries, content addressing is per-user",
      "Carry interpreted/extracted data, extraction lives on observations and interpretations",
      "Be exposed via APIs that bypass the source-ownership filter",
    ],
    related: [
      { label: "Sources subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/sources.md`, external: true, desc: "Full source-and-interpretation lifecycle, MCP tools, quota model" },
      { label: "Interpretations", href: "/primitives/interpretations", desc: "Versioned extraction attempts that consume a source" },
      { label: "Observations", href: "/primitives/observations", desc: "Granular facts produced from a source via an interpretation" },
      { label: "Timeline events", href: "/primitives/timeline-events", desc: "Source-anchored temporal records derived from extracted dates" },
      { label: "Determinism doctrine", href: `${REPO_DOCS_BASE}/architecture/determinism.md`, external: true, desc: "Where sources sit on the deterministic-vs-non-deterministic boundary" },
    ],
  },
  {
    slug: "interpretations",
    label: "Interpretations",
    singularLabel: "interpretation",
    iconName: "Sparkles",
    cardTagline:
      "Versioned, audited extraction attempts that turn a source into structured observations",
    intro:
      "An interpretation is a versioned attempt to extract structured information from a single source. It exists as a first-class record so the system can audit how data was extracted, reinterpret without rewriting history, and track extraction quality over time. Structured agent writes (already-structured payloads) skip interpretations entirely.",
    flowPosition:
      "Source → Interpretation → Observation → Snapshot. Interpretations are the second layer, they record which model, prompt, and schema version produced which observations.",
    schemaTitle: "interpretations table (Postgres / hosted)",
    schemaCode: `CREATE TABLE interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  extraction_completeness TEXT DEFAULT 'unknown',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);`,
    schemaFields: [
      { field: "id", type: "UUID", purpose: "Referenced by observations.interpretation_id for full provenance" },
      { field: "source_id", type: "UUID", purpose: "The source that was interpreted" },
      { field: "interpretation_config", type: "JSONB", purpose: "Audit log of model, model_version, extractor_type, prompt_version, temperature, schema_version" },
      { field: "status", type: "TEXT", purpose: "State machine: pending → running → completed | failed" },
      { field: "confidence", type: "NUMERIC(3,2)", purpose: "Aggregate model self-reported confidence in [0.00, 1.00], advisory, not authoritative" },
      { field: "unknown_field_count", type: "INTEGER", purpose: "Count of extracted fields that did not match the active schema and were routed to raw_fragments" },
      { field: "extraction_completeness", type: "TEXT", purpose: "complete / partial / unknown, coverage signal for the source" },
      { field: "archived_at", type: "TIMESTAMPTZ", purpose: "Set when a newer interpretation supersedes this one; the row stays queryable" },
    ],
    sections: [
      {
        id: "config-not-replay",
        heading: "interpretation_config is an audit log, not a replay contract",
        body:
          "interpretation_config captures the model, prompt, extractor type, and schema version active at run start. Re-running with the same config can produce different outputs because LLM weights drift, network conditions affect tokenisation, and tools the extractor calls may themselves be non-deterministic. What Neotoma guarantees is that whichever output happened is permanently linked to the config that produced it.",
      },
      {
        id: "state-machine",
        heading: "Status state machine",
        body:
          "pending (created, not started) → running (started_at set) → completed | failed (terminal). Terminal states never transition back; reruns create new rows. confidence, unknown_field_count, extraction_completeness, and completed_at are written on the terminal transition.",
      },
      {
        id: "reinterpretation",
        heading: "Reinterpretation creates new rows, never mutates",
        body:
          "Reinterpretation always creates a new interpretation and new observations. The prior interpretation gets archived_at marked but its observations remain queryable in observation history. The reducer chooses between competing observations using source_priority, specificity_score, and observed_at; corrections (priority 1000) always win.",
      },
      {
        id: "quality-signals",
        heading: "Quality signals",
        body:
          "unknown_field_count flags schema drift, sustained spikes mean the schema is missing real-world fields and should be evolved via update_schema_incremental. extraction_completeness (complete/partial/unknown) is set by the extractor at run end. confidence is advisory only, the reducer MUST NOT use it for merge decisions.",
      },
    ],
    mustList: [
      "Carry a non-null source_id, interpretation_config, and user_id",
      "Capture model / extractor / prompt / schema version in interpretation_config at run start",
      "Be immutable in identifying fields after write, only status, timing, quality, and archived_at change",
      "Pass attribution policy enforcement before write",
    ],
    mustNotList: [
      "Be mutated in a way that retroactively changes which observations a row produced",
      "Be hard-deleted (use archived_at) outside of explicit user-initiated source deletion",
      "Be created without a corresponding sources row",
      "Be assumed deterministic for replay, only audit-log linkage to config is guaranteed",
    ],
    related: [
      { label: "Interpretations subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/interpretations.md`, external: true, desc: "Full schema, status lifecycle, quality signals" },
      { label: "Sources", href: "/primitives/sources", desc: "Raw artifact every interpretation points back to" },
      { label: "Observations", href: "/primitives/observations", desc: "Granular facts produced by completed interpretations" },
      { label: "MCP spec, reinterpret", href: `${REPO_DOCS_BASE}/specs/MCP_SPEC.md`, external: true, desc: "reinterpret(source_id, interpretation_config?) tool" },
      { label: "Implementation", href: `${REPO_SRC_BASE}/services/interpretation.ts`, external: true, desc: "src/services/interpretation.ts, create / status transitions" },
    ],
  },
  {
    slug: "observations",
    label: "Observations",
    singularLabel: "observation",
    iconName: "Fingerprint",
    cardTagline:
      "Granular, immutable facts that the reducer composes into entity snapshots",
    intro:
      "An observation is a granular, source-specific statement about an entity at a point in time. Observations are the only thing the reducer reads to compute an entity snapshot, and they are the only place ground truth lives. Snapshots are derived; observations are durable.",
    flowPosition:
      "Source → Interpretation → Observation → Snapshot. Observations are the third layer, the immutable atoms of truth. Reducers merge them deterministically into snapshots.",
    schemaTitle: "Observation shape (conceptual)",
    schemaCode: `interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string;          // which raw artifact
  interpretation_id: string;  // which extraction run (NULL for structured writes)
  observed_at: Date;
  specificity_score: number;  // how specific this observation is
  source_priority: number;    // 0 = AI, 100 = structured, 1000 = correction
  fields: Record<string, unknown>;
  user_id: string;
}`,
    schemaFields: [
      { field: "entity_id", type: "string", purpose: "The entity this observation is about (resolved during ingestion, user-scoped)" },
      { field: "schema_version", type: "string", purpose: "Active entity schema version at extraction time" },
      { field: "source_id", type: "string", purpose: "What raw content produced this observation" },
      { field: "interpretation_id", type: "string | null", purpose: "Which extraction run produced this; NULL for structured `store` writes (entities without file-backed interpretation)" },
      { field: "observed_at", type: "Date", purpose: "When this observation was made (or extracted from the source)" },
      { field: "specificity_score", type: "number", purpose: "Reducer tie-break: how specific this observation is for its fields" },
      { field: "source_priority", type: "number", purpose: "0 (AI) / 100 (structured agent) / 1000 (user correction). Corrections always win." },
      { field: "fields", type: "object", purpose: "The actual granular facts, whatever the schema admits at this version" },
    ],
    sections: [
      {
        id: "three-layer",
        heading: "The three-layer truth model",
        body:
          "Source carries raw bytes. Interpretation carries the audit trail of how those bytes were read. Observations carry granular facts that link back to both. Snapshots are deterministically composed from all observations for an entity by the reducer. This separation is what lets Neotoma reinterpret without rewriting history and replay snapshots at any point in time.",
      },
      {
        id: "immutability",
        heading: "Immutability and provenance",
        body:
          "Observations are never mutated. Every observation links to its source_id and interpretation_id, so any field on any snapshot can be traced back to the exact bytes and extractor that produced it. Reinterpretation, correction, and re-ingest always produce new observations, the audit trail grows monotonically.",
      },
      {
        id: "priority-and-merging",
        heading: "Source priority and merging",
        body:
          "When two observations disagree about the same field, the reducer picks the winner using (source_priority, specificity_score, observed_at). User corrections write at priority 1000 and always win. Structured agent writes are at 100. AI interpretations are at 0. This priority is deterministic and surfaceable: the Inspector shows which observation produced each snapshot field.",
      },
      {
        id: "writes",
        heading: "Where observations come from",
        body:
          "Three writers create observations: structured `store` calls with an entities payload (source_priority 100, interpretation_id NULL), AI interpretation pipelines on completion (source_priority 0, interpretation_id set), and explicit user corrections via correct() (source_priority 1000). All writes flow through service_role on the MCP server.",
      },
    ],
    mustList: [
      "Link to a non-null source_id and a resolved entity_id",
      "Be immutable, corrections and reinterpretations create new observations, not edits",
      "Carry a source_priority that determines reducer tie-breaks deterministically",
      "Pass attribution policy enforcement before write",
    ],
    mustNotList: [
      "Be mutated after creation",
      "Be created without a corresponding sources row (structured writes still own a synthetic source)",
      "Use confidence directly in reducer merge logic, that is reserved for source_priority and specificity_score",
      "Be returned across user boundaries; every read filters through source ownership",
    ],
    related: [
      { label: "Observation architecture", href: `${REPO_DOCS_BASE}/subsystems/observation_architecture.md`, external: true, desc: "Three-layer model, lifecycle, snapshot computation, provenance" },
      { label: "Sources", href: "/primitives/sources", desc: "Raw artifact each observation links back to" },
      { label: "Interpretations", href: "/primitives/interpretations", desc: "Extraction run each AI-produced observation belongs to" },
      { label: "Relationships", href: "/primitives/relationships", desc: "Edges follow the same observation-snapshot pattern" },
      { label: "Versioned history", href: "/versioned-history", desc: "Why immutable observations matter for agent memory" },
    ],
  },
  {
    slug: "relationships",
    label: "Relationships",
    singularLabel: "relationship",
    iconName: "GitCompare",
    cardTagline:
      "First-class typed graph edges that follow the same observation-snapshot pattern as entities",
    intro:
      "Relationships are first-class typed edges between entities, not hard-coded foreign keys. They are stored as observations and snapshots, so multiple sources can contribute to the same edge, every edge carries full provenance, and the graph stays open-ontology and queryable.",
    flowPosition:
      "Sits next to entities. Sources produce relationship observations the same way they produce entity observations; the relationship reducer composes them into a relationship snapshot.",
    schemaTitle: "Relationship pattern",
    schemaCode: `Source → Relationship Observations → Relationship Reducer → Relationship Snapshot

// Multiple sources can write the same relationship.
// Each write is an immutable observation with its own provenance.
// The snapshot merges them with deterministic rules.

Source A (Invoice PDF):  SETTLES → metadata: { amount: 1500, currency: "USD" }
Source B (Bank Record):  SETTLES → metadata: { amount: 1500, payment_method: "wire" }

Snapshot (merged):       metadata: { amount: 1500, currency: "USD", payment_method: "wire" }
                         provenance: { amount: "obs_A", currency: "obs_A", payment_method: "obs_B" }`,
    sections: [
      {
        id: "core-types",
        heading: "Core relationship types",
        body:
          "PART_OF (hierarchical containment, e.g. invoice_line_item PART_OF invoice). CORRECTS (corrections supersede originals). REFERS_TO (mentions / references). SETTLES (payment settles invoice). DUPLICATE_OF (entity dedupe). DEPENDS_ON (task ordering). SUPERSEDES (versioning). EMBEDS (container embeds reusable asset, e.g. blog post EMBEDS image).",
      },
      {
        id: "open-ontology",
        heading: "Open ontology, not hard-coded hierarchies",
        body:
          "Neotoma does not hard-code parent-child columns or a fixed schema of edge types. Hierarchies emerge from edges, which means out-of-order ingestion, multiple parents, overlapping summaries, and corrections all compose without schema changes. New edge types can be introduced without migrating data.",
      },
      {
        id: "observation-pattern",
        heading: "Observation-snapshot pattern",
        body:
          "Each write to a relationship is an immutable observation that carries metadata and provenance. The reducer merges all observations for the same (source_entity, target_entity, type) into a single snapshot. The provenance map records, per metadata field, which observation produced which value, exactly the same shape as entity snapshots.",
      },
      {
        id: "queryability",
        heading: "Queryable in both directions",
        body:
          "Relationships are first-class rows that can be queried by source entity, target entity, type, or metadata. Read paths support traversals (find all PART_OF children of an invoice) and reverse lookups (find every entity that REFERS_TO this contract). Same RLS rules apply, only relationships whose source/target you own are visible.",
      },
    ],
    mustList: [
      "Be stored as immutable observations + a deterministically computed snapshot",
      "Carry full provenance, every metadata field traces to the observation that set it",
      "Be typed (PART_OF / CORRECTS / REFERS_TO / SETTLES / DUPLICATE_OF / DEPENDS_ON / SUPERSEDES / EMBEDS, …)",
      "Respect source-ownership RLS on every read path",
    ],
    mustNotList: [
      "Be modeled as foreign keys on entity tables",
      "Be mutated in place, corrections and supersessions create new observations",
      "Be created without explicit source_entity_id, target_entity_id, and type",
      "Bypass the relationship reducer for ad-hoc snapshot writes",
    ],
    related: [
      { label: "Relationships subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/relationships.md`, external: true, desc: "Types, graph patterns, query examples" },
      { label: "Observations", href: "/primitives/observations", desc: "Underlying primitive each relationship observation builds on" },
      { label: "Entity merge", href: `${REPO_DOCS_BASE}/subsystems/entity_merge.md`, external: true, desc: "DUPLICATE_OF mechanics and merge handling" },
      { label: "Architectural decisions", href: `${REPO_DOCS_BASE}/architecture/architectural_decisions.md`, external: true, desc: "Why relationships are first-class and the graph is open-ontology" },
    ],
  },
  {
    slug: "timeline-events",
    label: "Timeline events",
    singularLabel: "timeline event",
    iconName: "CalendarClock",
    cardTagline:
      "Source-anchored temporal records derived deterministically from extracted dates",
    intro:
      "A timeline event is an immutable, source-anchored record that fixes one entity in time at a specific date drawn verbatim from a source field. It is a primitive record type, distinct from the application-level event entity (calendar/meeting), and distinct from system observability events.",
    flowPosition:
      "Derived as a side-effect of writing an entity snapshot. Sources produce observations; observations produce snapshots; snapshots produce timeline events for any field that parses as a date.",
    schemaTitle: "timeline_events table (Postgres / hosted)",
    schemaCode: `CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_id UUID REFERENCES sources(id),
  source_field TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL
);`,
    schemaFields: [
      { field: "id", type: "UUID", purpose: "Deterministic, SHA-256 of (source_id, entity_id, source_field, event_timestamp) projected into UUID shape" },
      { field: "event_type", type: "TEXT", purpose: "Stable label like InvoiceIssued, FlightDeparture, TaskCompleted" },
      { field: "event_timestamp", type: "TIMESTAMPTZ", purpose: "ISO 8601 in UTC, drawn verbatim from a source field" },
      { field: "source_id", type: "UUID", purpose: "Owning source, used for RLS filtering" },
      { field: "source_field", type: "TEXT", purpose: "The exact entity/field name that produced the date (invoice_date, due_date, …)" },
      { field: "entity_id", type: "UUID", purpose: "Subject of the event (the entity whose snapshot field carried the date)" },
      { field: "metadata", type: "JSONB", purpose: "Optional event-level provenance (agent attribution, tier, schema version)" },
    ],
    sections: [
      {
        id: "four-invariants",
        heading: "Four invariants",
        body:
          "Source-linked: every event has source_id and source_field. Deterministic: id is SHA-256(source_id, entity_id, source_field, event_timestamp) shaped as a UUIDv4, re-derivation upserts the same row. Timestamp-normalized: only strings matching strict date shapes (or numeric epoch values in a sane range) are accepted. Immutable: events are never mutated; reinterpretation produces new rows alongside old ones.",
      },
      {
        id: "derivation",
        heading: "How events are derived",
        body:
          "Three writers invoke timeline event derivation: structured `store` ingestion, AI interpretation completion, and reducer snapshot recomputation. The writer selects fields via the schema's temporal_fields declaration (preferred) or a curated allow-set + strict date-shape regex (legacy fallback). System fields like created_at, updated_at, and computed_at are denylisted.",
      },
      {
        id: "deterministic-id",
        heading: "Deterministic ID, idempotent upsert",
        body:
          "generateTimelineEventId hashes the four-tuple and shapes the first 32 hex chars as a UUIDv4. Upserts use onConflict: 'id', re-deriving an event with identical inputs converges on the same row. A reinterpretation that emits a different timestamp for the same (source, entity, field) writes a new event row alongside the old one; nothing is retroactively rewritten.",
      },
      {
        id: "not-system-events",
        heading: "Not the same as system observability events",
        body:
          "Timeline events are user-facing temporal records anchored to source data. System observability events (source.created, ingestion.failed, …) are emitted by the platform and live in a separate subsystem. The application-level event entity type (calendar/meeting) is also distinct, that is an entity, not a timeline_events row.",
      },
      {
        id: "read-path",
        heading: "Read path",
        body:
          "GET /api/timeline returns paginated events for the authenticated user, filtered by entity_id, event_type, start_date, or end_date. The MCP layer exposes list_timeline_events with the same filters. Both paths defensively load the user's source set first and only return events whose source_id is in that set.",
      },
    ],
    mustList: [
      "Derive only from extracted source date fields, never inferred, predicted, or computed",
      "Carry a non-null source_id, source_field, and event_timestamp",
      "Use the deterministic generateTimelineEventId hash so re-derivation is idempotent",
      "Pass attribution policy enforcement before write",
      "Be filtered by source ownership on every read path",
    ],
    mustNotList: [
      "Be created by agents through a direct write surface",
      "Mutate after creation",
      "Inherit dates from created_at, updated_at, or other system fields",
      "Be derived from string values that fail strict date-shape validation",
      "Be returned across user boundaries, source-scoped filtering is required even where user_id matches",
    ],
    related: [
      { label: "Timeline events subsystem doc", href: `${REPO_DOCS_BASE}/subsystems/timeline_events.md`, external: true, desc: "Derivation rules, deterministic ID, event type mapping, read paths" },
      { label: "Timeline events doctrine", href: `${REPO_DOCS_BASE}/foundation/timeline_events.md`, external: true, desc: "Foundational invariants and generation rules" },
      { label: "Sources", href: "/primitives/sources", desc: "Every event traces back to a source" },
      { label: "Observations", href: "/primitives/observations", desc: "Date fields on observations are what feed timeline derivation" },
      { label: "Replayable timeline", href: "/replayable-timeline", desc: "How deterministic timeline reconstruction works end-to-end" },
      { label: "Implementation", href: `${REPO_SRC_BASE}/services/timeline_events.ts`, external: true, desc: "src/services/timeline_events.ts, derivation and upsert" },
    ],
  },
];

export const PRIMITIVE_RECORD_TYPE_GUIDES_LIST = PRIMITIVE_RECORD_TYPE_GUIDES;

export const PRIMITIVE_RECORD_TYPE_SLUGS = PRIMITIVE_RECORD_TYPE_GUIDES.map(
  (g) => g.slug,
);
