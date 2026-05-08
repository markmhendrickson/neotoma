import { mkdirSync } from "fs";
import path from "path";
import { config } from "../../config.js";
import Database, { type SqliteDatabase } from "./sqlite_driver.js";

let cachedDb: SqliteDatabase | null = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    content_hash TEXT,
    mime_type TEXT,
    storage_url TEXT,
    file_size INTEGER,
    original_filename TEXT,
    source_type TEXT,
    provenance TEXT,
    created_at TEXT,
    idempotency_key TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS interpretations (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    interpretation_config TEXT,
    status TEXT,
    started_at TEXT,
    completed_at TEXT,
    observations_created INTEGER,
    user_id TEXT,
    created_at TEXT,
    error_message TEXT,
    unknown_fields_count INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    source_id TEXT,
    interpretation_id TEXT,
    observed_at TEXT NOT NULL,
    specificity_score REAL,
    source_priority INTEGER,
    observation_source TEXT,
    fields TEXT,
    created_at TEXT,
    user_id TEXT,
    idempotency_key TEXT,
    canonical_hash TEXT,
    identity_basis TEXT,
    identity_rule TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entity_snapshots (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    canonical_name TEXT,
    snapshot TEXT,
    computed_at TEXT,
    observation_count INTEGER,
    last_observation_at TEXT,
    provenance TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    aliases TEXT,
    created_at TEXT,
    updated_at TEXT,
    user_id TEXT,
    first_seen_at TEXT,
    last_seen_at TEXT,
    merged_to_entity_id TEXT,
    merged_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_timestamp TEXT NOT NULL,
    event_date TEXT,
    source_id TEXT,
    source_field TEXT,
    entity_id TEXT,
    created_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS relationship_observations (
    id TEXT PRIMARY KEY,
    relationship_key TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    source_id TEXT,
    interpretation_id TEXT,
    observed_at TEXT,
    specificity_score REAL,
    source_priority INTEGER,
    metadata TEXT,
    canonical_hash TEXT,
    created_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS relationship_snapshots (
    relationship_key TEXT PRIMARY KEY,
    relationship_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    snapshot TEXT,
    computed_at TEXT,
    observation_count INTEGER,
    last_observation_at TEXT,
    provenance TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS raw_fragments (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    interpretation_id TEXT,
    entity_id TEXT,
    entity_type TEXT NOT NULL,
    fragment_key TEXT NOT NULL,
    fragment_value TEXT,
    fragment_envelope TEXT,
    frequency_count INTEGER,
    first_seen TEXT,
    last_seen TEXT,
    user_id TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entity_merges (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    from_entity_id TEXT,
    to_entity_id TEXT,
    reason TEXT,
    merged_by TEXT,
    observations_rewritten INTEGER,
    created_at TEXT
  )`,
  // R5: symmetric audit table for split_entity. Mirrors entity_merges exactly
  // (user_id + idempotency_key unique index) so over-merges can be surgically
  // reversed without any content rewrite on observations. See
  // docs/subsystems/entity_merge.md § 5 (inverse operation).
  `CREATE TABLE IF NOT EXISTS entity_splits (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    source_entity_id TEXT,
    new_entity_id TEXT,
    predicate TEXT,
    reason TEXT,
    split_by TEXT,
    observations_rewritten INTEGER,
    idempotency_key TEXT,
    created_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS entity_splits_user_idempotency_unique
    ON entity_splits(user_id, idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS schema_registry (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    schema_definition TEXT NOT NULL,
    reducer_config TEXT NOT NULL,
    active INTEGER,
    created_at TEXT,
    user_id TEXT,
    scope TEXT,
    metadata TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS mcp_oauth_state (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    code_challenge TEXT,
    connection_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    client_state TEXT,
    created_at TEXT,
    expires_at TEXT,
    user_id TEXT,
    scope TEXT,
    final_redirect_uri TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS mcp_oauth_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    access_token_expires_at TEXT,
    client_name TEXT,
    last_used_at TEXT,
    created_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS mcp_oauth_client_state (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS local_auth_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS schema_recommendations (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    user_id TEXT,
    source TEXT,
    recommendation_type TEXT,
    confidence_score REAL,
    status TEXT,
    applied_at TEXT,
    idempotency_key TEXT,
    can_rollback INTEGER,
    fields_to_add TEXT,
    fields_to_remove TEXT,
    fields_to_modify TEXT,
    converters_to_add TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auto_enhancement_queue (
    id TEXT PRIMARY KEY,
    entity_type TEXT,
    fragment_key TEXT,
    frequency_count INTEGER,
    confidence_score REAL,
    priority INTEGER DEFAULT 100,
    retry_count INTEGER DEFAULT 0,
    processed_at TEXT,
    last_retry_at TEXT,
    error_message TEXT,
    field_name TEXT,
    field_type TEXT,
    payload TEXT,
    status TEXT,
    attempt_count INTEGER,
    last_attempt_at TEXT,
    error TEXT,
    created_at TEXT,
    updated_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS field_blacklist (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    field_name TEXT NOT NULL,
    reason TEXT,
    created_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS source_entity_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    edge_type TEXT,
    created_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS source_event_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    edge_type TEXT,
    created_at TEXT,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entity_embedding_rows (
    rowid INTEGER PRIMARY KEY,
    entity_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    merged INTEGER DEFAULT 0
  )`,
];

/** Legacy tables that may exist in older neotoma.db files. Dropped on open so DB matches canonical schema. */
const DEPRECATED_TABLES = [
  "records",
  "record_relationships",
  "record_entity_edges",
  "record_event_edges",
  "entity_event_edges",
  "state_events",
  "relationships",
  "payload_submissions",
  "interpretation_runs",
];

/** Add a column to a table if it does not exist (for existing SQLite DBs). */
function addColumnIfMissing(
  db: SqliteDatabase,
  table: string,
  column: string,
  type: string
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (rows.some((r) => r.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
}

function ensureSchema(db: SqliteDatabase): void {
  const transaction = db.transaction(() => {
    db.pragma("foreign_keys = OFF");
    for (const table of DEPRECATED_TABLES) {
      db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    db.pragma("foreign_keys = ON");

    for (const statement of SCHEMA_STATEMENTS) {
      db.prepare(statement).run();
    }

    // Add columns if missing (existing DBs created before these columns existed)
    addColumnIfMissing(db, "sources", "source_type", "TEXT");
    addColumnIfMissing(db, "sources", "original_filename", "TEXT");
    addColumnIfMissing(db, "sources", "mime_type", "TEXT");
    addColumnIfMissing(db, "sources", "storage_url", "TEXT");
    addColumnIfMissing(db, "sources", "file_size", "INTEGER");
    addColumnIfMissing(db, "sources", "idempotency_key", "TEXT");
    addColumnIfMissing(db, "observations", "idempotency_key", "TEXT");
    addColumnIfMissing(db, "interpretations", "user_id", "TEXT");
    addColumnIfMissing(db, "interpretations", "created_at", "TEXT");
    addColumnIfMissing(db, "interpretations", "error_message", "TEXT");
    addColumnIfMissing(db, "interpretations", "unknown_fields_count", "INTEGER");
    addColumnIfMissing(db, "observations", "canonical_hash", "TEXT");
    addColumnIfMissing(db, "observations", "identity_basis", "TEXT");
    addColumnIfMissing(db, "observations", "identity_rule", "TEXT");
    // Agent attribution (Phase 1 AAuth integration). `provenance` is a JSON
    // blob containing AAuth fields, fallback clientInfo, and trust tier; see
    // src/crypto/agent_identity.ts AttributionProvenance shape. Adding via
    // the soft-migration helper keeps existing databases backward-compatible.
    addColumnIfMissing(db, "observations", "provenance", "TEXT");
    // Write-kind classification (sensor / llm_summary / workflow_state /
    // human / import), orthogonal to numeric `source_priority` and to the
    // `provenance` attribution blob. Soft migration keeps pre-existing
    // rows at NULL so historical data round-trips intact.
    addColumnIfMissing(db, "observations", "observation_source", "TEXT");
    // Cross-instance sync (Phase 5): originating peer id stamped on
    // observations created from peer webhook replay; drives subscription
    // loop prevention on the event bus.
    addColumnIfMissing(db, "observations", "source_peer_id", "TEXT");
    addColumnIfMissing(db, "timeline_events", "provenance", "TEXT");
    addColumnIfMissing(db, "interpretations", "provenance", "TEXT");
    addColumnIfMissing(db, "relationship_observations", "provenance", "TEXT");
    addColumnIfMissing(db, "timeline_events", "entity_id", "TEXT");
    addColumnIfMissing(db, "entity_snapshots", "canonical_name", "TEXT");
    addColumnIfMissing(db, "entities", "first_seen_at", "TEXT");
    addColumnIfMissing(db, "entities", "last_seen_at", "TEXT");
    addColumnIfMissing(db, "timeline_events", "event_date", "TEXT");
    addColumnIfMissing(db, "raw_fragments", "entity_id", "TEXT");
    addColumnIfMissing(db, "auto_enhancement_queue", "fragment_key", "TEXT");
    addColumnIfMissing(db, "auto_enhancement_queue", "frequency_count", "INTEGER");
    addColumnIfMissing(db, "auto_enhancement_queue", "confidence_score", "REAL");
    addColumnIfMissing(db, "auto_enhancement_queue", "priority", "INTEGER");
    addColumnIfMissing(db, "auto_enhancement_queue", "retry_count", "INTEGER");
    addColumnIfMissing(db, "auto_enhancement_queue", "processed_at", "TEXT");
    addColumnIfMissing(db, "auto_enhancement_queue", "last_retry_at", "TEXT");
    addColumnIfMissing(db, "auto_enhancement_queue", "error_message", "TEXT");

    addColumnIfMissing(db, "local_auth_users", "is_ephemeral", "INTEGER NOT NULL DEFAULT 0");

    db.prepare(`CREATE TABLE IF NOT EXISTS sandbox_sessions (
      user_id TEXT PRIMARY KEY REFERENCES local_auth_users(id) ON DELETE CASCADE,
      bearer_token_hash TEXT NOT NULL,
      one_time_code_hash TEXT,
      pack_id TEXT NOT NULL DEFAULT 'generic',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    )`).run();
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_expires ON sandbox_sessions(expires_at)"
    ).run();
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_revoked ON sandbox_sessions(revoked_at)"
    ).run();

    // Parity with Postgres: unique constraint on (content_hash, user_id) for deduplication
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_content_hash_user ON sources(content_hash, user_id) WHERE content_hash IS NOT NULL AND user_id IS NOT NULL"
    ).run();
  });
  transaction();
}

/**
 * Clear the cached SQLite connection. Next getSqliteDb() will open a new
 * connection (and create the DB file if missing). Call this after I/O errors
 * (e.g. disk I/O error, DB file deleted while server was running).
 */
export function clearSqliteCache(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // Ignore close errors (e.g. file already deleted)
    }
    cachedDb = null;
  }
}

export function getSqliteDb(): SqliteDatabase {
  if (cachedDb) {
    return cachedDb;
  }

  const dbPath = config.sqlitePath;
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  ensureSchema(db);
  cachedDb = db;
  return db;
}

/**
 * Ensure a SQLite database file exists with Neotoma schema initialized.
 * Used by init to eagerly provision both dev and prod databases.
 */
export function ensureSqliteDbInitialized(dbPath: string): void {
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);
  } finally {
    db.close();
  }
}
