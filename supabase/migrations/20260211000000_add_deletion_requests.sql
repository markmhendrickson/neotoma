-- Migration: Add deletion_requests table for GDPR compliance (Phase 2: Hard Deletion)
-- Created: 2026-02-11
-- Description: Tracks deletion requests with deadline monitoring for GDPR Article 17 compliance

-- ============================================================================
-- deletion_requests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_id TEXT, -- Entity ID to delete (if specific entity)
  relationship_id TEXT, -- Relationship ID to delete (if specific relationship)
  deletion_type TEXT NOT NULL CHECK (deletion_type IN ('entity', 'relationship', 'user_data_complete')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'extended')),
  
  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  soft_deleted_at TIMESTAMPTZ, -- When soft deletion completed
  hard_deleted_at TIMESTAMPTZ, -- When hard deletion completed (cryptographic erasure or physical)
  completed_at TIMESTAMPTZ, -- When entire request completed
  deadline TIMESTAMPTZ NOT NULL, -- GDPR deadline (30 days default, up to 90 days for extended)
  backup_deletion_deadline TIMESTAMPTZ, -- Deadline for backup deletion
  
  -- Request details
  reason TEXT, -- Optional reason for deletion
  legal_basis TEXT CHECK (legal_basis IN ('user_request', 'consent_withdrawal', 'unlawful_processing', 'legal_obligation', 'user_objection')),
  requester_email TEXT,
  requester_verified BOOLEAN DEFAULT false,
  
  -- Deletion method
  deletion_method TEXT CHECK (deletion_method IN ('soft_only', 'cryptographic_erasure', 'physical_deletion')),
  encryption_key_deleted_at TIMESTAMPTZ, -- When encryption key was deleted (for cryptographic erasure)
  
  -- Retention period (for legal obligations)
  retention_period_days INTEGER, -- Number of days to retain before hard deletion
  retention_reason TEXT, -- Reason for retention (e.g., "Tax records - 7 years")
  
  -- Extension tracking
  extension_granted BOOLEAN DEFAULT false,
  extension_reason TEXT,
  extension_granted_at TIMESTAMPTZ,
  original_deadline TIMESTAMPTZ,
  
  -- Confirmation
  user_notified_at TIMESTAMPTZ, -- When user was notified of status
  user_confirmation_received BOOLEAN DEFAULT false,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_deadline ON deletion_requests(deadline);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_entity ON deletion_requests(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deletion_requests_relationship ON deletion_requests(relationship_id) WHERE relationship_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_at ON deletion_requests(requested_at DESC);

-- Enable RLS
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users read own deletion requests" ON deletion_requests;
CREATE POLICY "Users read own deletion requests" ON deletion_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - deletion_requests" ON deletion_requests;
CREATE POLICY "Service role full access - deletion_requests" ON deletion_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table comment
COMMENT ON TABLE deletion_requests IS 'Tracks GDPR deletion requests with deadline monitoring and status tracking. Supports soft deletion, cryptographic erasure, and physical deletion.';

-- Column comments
COMMENT ON COLUMN deletion_requests.deletion_type IS 'Type of deletion: entity (single entity), relationship (single relationship), or user_data_complete (all user data)';
COMMENT ON COLUMN deletion_requests.status IS 'Current status: pending, in_progress, completed, rejected, or extended';
COMMENT ON COLUMN deletion_requests.deadline IS 'GDPR compliance deadline (30 days default, up to 90 days for extended requests)';
COMMENT ON COLUMN deletion_requests.deletion_method IS 'Method used: soft_only (immutable), cryptographic_erasure (encrypt + delete key), or physical_deletion (break immutability)';
COMMENT ON COLUMN deletion_requests.retention_period_days IS 'Days to retain before hard deletion (for legal obligations like tax records)';
COMMENT ON COLUMN deletion_requests.extension_granted IS 'Whether deadline was extended (max 90 days total for complex requests)';

-- ============================================================================
-- Update trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_deletion_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deletion_requests_updated_at ON deletion_requests;
CREATE TRIGGER deletion_requests_updated_at
  BEFORE UPDATE ON deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_deletion_requests_updated_at();
