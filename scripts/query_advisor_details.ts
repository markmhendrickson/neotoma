#!/usr/bin/env tsx

/**
 * Query database for specific advisor issue details
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function getSupabaseClient() {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;

  const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  const supabaseUrl = buildUrl(projectId, url);
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_PROJECT_ID (or SUPABASE_URL) and SUPABASE_SERVICE_KEY must be set");
  }

  return createClient(supabaseUrl, serviceKey);
}

async function main() {
  const supabase = await getSupabaseClient();

  // Query for multiple permissive policies
  console.log("\n=== Tables with Multiple Permissive Policies ===\n");
  const { data: policies, error: policiesError } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        tablename,
        array_agg(policyname ORDER BY policyname) as policies,
        array_agg(DISTINCT cmd) as commands,
        COUNT(*) as policy_count
      FROM pg_policies
      WHERE schemaname = 'public' 
        AND permissive = 'PERMISSIVE'
      GROUP BY tablename
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, tablename;
    `,
  });

  if (policiesError) {
    console.error("Error querying policies:", policiesError);
  } else {
    console.log(JSON.stringify(policies, null, 2));
  }

  // Query for duplicate indexes
  console.log("\n=== Duplicate Indexes ===\n");
  const { data: indexes, error: indexesError } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        tablename,
        array_agg(indexname ORDER BY indexname) as index_names,
        indexdef,
        COUNT(*) as duplicate_count
      FROM pg_indexes
      WHERE schemaname = 'public'
      GROUP BY tablename, indexdef
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, tablename;
    `,
  });

  if (indexesError) {
    console.error("Error querying indexes:", indexesError);
  } else {
    console.log(JSON.stringify(indexes, null, 2));
  }

  // Query for unused indexes
  console.log("\n=== Unused Indexes (Top 20 by size) ===\n");
  const { data: unusedIndexes, error: unusedError } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        schemaname,
        tablename,
        indexrelname as indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public' 
        AND idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 20;
    `,
  });

  if (unusedError) {
    console.error("Error querying unused indexes:", unusedError);
  } else {
    console.log(JSON.stringify(unusedIndexes, null, 2));
  }

  // Query for functions without search_path
  console.log("\n=== Functions Without Search Path ===\n");
  const { data: functions, error: functionsError } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        CASE WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' THEN 'has_search_path' ELSE 'missing' END as status
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%'
      ORDER BY p.proname;
    `,
  });

  if (functionsError) {
    console.error("Error querying functions:", functionsError);
  } else {
    console.log(JSON.stringify(functions, null, 2));
  }
}

main().catch(console.error);
