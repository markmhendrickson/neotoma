-- Refresh PostgREST schema cache
-- Run this in Supabase Dashboard → SQL Editor

NOTIFY pgrst, 'reload schema';

-- Verify the table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'interpretations';


