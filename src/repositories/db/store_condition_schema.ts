/** Internal owner/key arbitration. No domain schema or entity identity changes. */
export const STORE_CONDITION_KEYS_SCHEMA = `CREATE TABLE IF NOT EXISTS store_condition_keys (
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('legacy', 'conditional')),
  request_hash TEXT,
  created_at TEXT NOT NULL,
  conditional_receipt TEXT,
  PRIMARY KEY (user_id, key_hash),
  CHECK ((mode = 'legacy' AND request_hash IS NULL AND conditional_receipt IS NULL)
    OR (mode = 'conditional' AND request_hash IS NOT NULL))
)`;
