-- FU-112 Storage Infrastructure: upload queue + storage usage tracking
set check_function_bodies = off;
set search_path = public;

-- Upload queue table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_file_path TEXT NOT NULL,
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID NOT NULL,
  payload_submission_id UUID REFERENCES public.payload_submissions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_queue_next_retry
  ON public.upload_queue(next_retry_at)
  WHERE retry_count < max_retries;

CREATE INDEX IF NOT EXISTS idx_upload_queue_user
  ON public.upload_queue(user_id);

ALTER TABLE public.upload_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - upload_queue" ON public.upload_queue;
CREATE POLICY "Service role full access - upload_queue"
  ON public.upload_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storage usage table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_usage (
  user_id UUID PRIMARY KEY,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  total_sources INTEGER NOT NULL DEFAULT 0,
  last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interpretation_count_month INTEGER NOT NULL DEFAULT 0,
  interpretation_limit_month INTEGER NOT NULL DEFAULT 100,
  billing_month TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM')
);

ALTER TABLE public.storage_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - storage_usage" ON public.storage_usage;
CREATE POLICY "Service role full access - storage_usage"
  ON public.storage_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper functions ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_storage_usage(
  p_user_id UUID,
  p_bytes BIGINT
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.storage_usage (user_id, total_bytes, total_sources, last_calculated)
  VALUES (p_user_id, p_bytes, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_bytes = public.storage_usage.total_bytes + p_bytes,
    total_sources = public.storage_usage.total_sources + 1,
    last_calculated = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_interpretation_count(
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_billing_month TEXT := to_char(NOW(), 'YYYY-MM');
BEGIN
  INSERT INTO public.storage_usage (user_id, interpretation_count_month, billing_month)
  VALUES (p_user_id, 1, current_billing_month)
  ON CONFLICT (user_id) DO UPDATE SET
    interpretation_count_month = CASE
      WHEN public.storage_usage.billing_month = current_billing_month
      THEN public.storage_usage.interpretation_count_month + 1
      ELSE 1
    END,
    billing_month = current_billing_month;
END;
$$;
