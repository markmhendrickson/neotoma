import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { config } from "../../config.js";

let cachedDb: Database.Database | null = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    content_hash TEXT,
    mime_type TEXT,
    storage_url TEXT,
    file_size INTEGER,
    original_filename TEXT,
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
    observations_created INTEGER
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
    fields TEXT,
    created_at TEXT,
    user_id TEXT,
    idempotency_key TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entity_snapshots (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
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
    merged_to_entity_id TEXT,
    merged_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_timestamp TEXT NOT NULL,
    source_id TEXT,
    source_field TEXT,
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
  db: Database.Database,
  table: string,
  column: string,
  type: string
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (rows.some((r) => r.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
}

function ensureSchema(db: Database.Database): void {
  const transaction = db.transaction(() => {
    db.pragma("foreign_keys = OFF");
    for (const table of DEPRECATED_TABLES) {
      db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    db.pragma("foreign_keys = ON");

    for (const statement of SCHEMA_STATEMENTS) {
      db.prepare(statement).run();
    }

    // Add idempotency_key to sources/observations if missing (existing DBs created before this column existed)
    addColumnIfMissing(db, "sources", "idempotency_key", "TEXT");
    addColumnIfMissing(db, "observations", "idempotency_key", "TEXT");
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

export function getSqliteDb(): Database.Database {
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
