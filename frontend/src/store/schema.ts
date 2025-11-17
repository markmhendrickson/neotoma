/**
 * Database schema for local SQLite store
 */

export const SCHEMA_VERSION = 1;

export const CREATE_RECORDS_TABLE = `
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    summary TEXT,
    properties TEXT NOT NULL,
    file_urls TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export const CREATE_RECORDS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_records_type ON records(type)`,
  `CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at DESC)`,
];

export const CREATE_SYNC_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_deltas (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    encrypted_data BLOB NOT NULL,
    timestamp TEXT NOT NULL,
    device_id TEXT NOT NULL
  )
`;

export const CREATE_SYNC_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_sync_version ON sync_deltas(version DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_device ON sync_deltas(device_id)`,
];

export function getSchemaSQL(): string {
  return [
    CREATE_RECORDS_TABLE,
    ...CREATE_RECORDS_INDEXES,
    CREATE_SYNC_TABLE,
    ...CREATE_SYNC_INDEXES,
  ].join(';\n') + ';';
}

