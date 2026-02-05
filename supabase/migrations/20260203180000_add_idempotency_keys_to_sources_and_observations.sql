-- Migration: Add idempotency keys to sources and observations
-- Created: 2026-02-03
-- Description: Adds idempotency_key columns and unique indexes for replay-safe ingestion and corrections

-- Sources idempotency key
ALTER TABLE sources
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_idempotency_key
ON sources(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN sources.idempotency_key IS
'Client-provided idempotency key for ingestion requests. Enforced per user to prevent duplicate sources.';

-- Observations idempotency key (corrections and manual inserts)
ALTER TABLE observations
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_idempotency_key
ON observations(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN observations.idempotency_key IS
'Client-provided idempotency key for correction observations. Enforced per user to prevent duplicates.';
