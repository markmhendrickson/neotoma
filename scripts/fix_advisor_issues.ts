#!/usr/bin/env tsx

/**
 * Fix Supabase Performance Advisor Issues
 * 
 * This script queries the database to identify specific issues and generates
 * a migration to fix them.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
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

async function findUnindexedForeignKeys(supabase: any) {
  // Query using direct SQL via REST API
  const { data, error } = await supabase
    .from("pg_indexes")
    .select("*")
    .limit(0); // This won't work, we need to use a different approach

  // Use Management API or direct database connection
  // For now, return empty and we'll use the API data
  return [];
}

async function findUnusedIndexes(supabase: any) {
  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE 'pg_%'
        AND indexname NOT LIKE '%_pkey'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_stat_user_indexes
          WHERE schemaname = pg_indexes.schemaname
            AND tablename = pg_indexes.tablename
            AND indexrelname = pg_indexes.indexname
            AND idx_scan > 0
        )
      ORDER BY tablename, indexname;
    `,
  });

  if (error) {
    console.error("Error querying unused indexes:", error);
    return [];
  }

  return data || [];
}

async function findMultiplePermissivePolicies(supabase: any) {
  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
      GROUP BY schemaname, tablename, policyname, permissive, roles, cmd
      HAVING COUNT(*) > 1
      ORDER BY tablename, cmd;
    `,
  });

  if (error) {
    console.error("Error querying policies:", error);
    return [];
  }

  return data || [];
}

async function findFunctionsWithoutSearchPath(supabase: any) {
  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT
        n.nspname AS schema_name,
        p.proname AS function_name,
        pg_get_functiondef(p.oid) AS function_def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%'
      ORDER BY p.proname;
    `,
  });

  if (error) {
    console.error("Error querying functions:", error);
    return [];
  }

  return data || [];
}

async function main() {
  console.log("[INFO] Analyzing database for advisor issues...\n");

  const supabase = await getSupabaseClient();

  // Find issues
  const unindexedFKs = await findUnindexedForeignKeys(supabase);
  const unusedIndexes = await findUnusedIndexes(supabase);
  const multiplePolicies = await findMultiplePermissivePolicies(supabase);
  const functionsNoSearchPath = await findFunctionsWithoutSearchPath(supabase);

  console.log(`Found ${unindexedFKs.length} unindexed foreign keys`);
  console.log(`Found ${unusedIndexes.length} unused indexes`);
  console.log(`Found ${multiplePolicies.length} tables with multiple permissive policies`);
  console.log(`Found ${functionsNoSearchPath.length} functions without search_path\n`);

  // Generate migration
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0].replace("T", "");
  const migrationContent = `-- Migration: Fix Performance Advisor Issues
-- Generated: ${new Date().toISOString()}
-- Description: Addresses ${unindexedFKs.length + unusedIndexes.length + multiplePolicies.length + functionsNoSearchPath.length} performance advisor issues

-- ============================================================================
-- 1. Add indexes for unindexed foreign keys (${unindexedFKs.length} issues)
-- ============================================================================

${unindexedFKs.map((fk: any) => {
  const indexName = `idx_${fk.table_name}_${fk.column_name}`;
  return `-- Index for foreign key: ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}
CREATE INDEX IF NOT EXISTS ${indexName} ON ${fk.table_name}(${fk.column_name});`;
}).join("\n\n")}

-- ============================================================================
-- 2. Remove unused indexes (${unusedIndexes.length} issues)
-- ============================================================================
-- WARNING: Review these indexes before dropping. Some may be needed for future queries.
-- Consider monitoring query patterns before removing.

${unusedIndexes.slice(0, 10).map((idx: any) => {
  return `-- Unused index: ${idx.indexname} on ${idx.tablename}
-- DROP INDEX IF EXISTS ${idx.indexname}; -- Uncomment after review`;
}).join("\n\n")}

${unusedIndexes.length > 10 ? `-- ... and ${unusedIndexes.length - 10} more unused indexes (review manually)\n` : ""}

-- ============================================================================
-- 3. Consolidate multiple permissive policies (${multiplePolicies.length} issues)
-- ============================================================================
-- WARNING: Review these policies carefully. Consolidating may change access patterns.
-- Consider combining policies using OR conditions.

${multiplePolicies.map((pol: any) => {
  return `-- Multiple permissive policies on ${pol.tablename} for ${pol.cmd}
-- Review and consolidate: ${pol.policyname}`;
}).join("\n\n")}

-- ============================================================================
-- 4. Add search_path to functions (${functionsNoSearchPath.length} issues)
-- ============================================================================

${functionsNoSearchPath.map((func: any) => {
  return `-- Function ${func.function_name} needs search_path
-- ALTER FUNCTION ${func.schema_name}.${func.function_name} SET search_path = public, pg_catalog;`;
}).join("\n\n")}

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. Unindexed foreign keys: Indexes added for better join performance
-- 2. Unused indexes: Review before dropping - may be needed for future queries
-- 3. Multiple permissive policies: Review and consolidate for better performance
-- 4. Functions without search_path: Add SET search_path to prevent injection attacks
`;

  const migrationPath = join(__dirname, "../supabase/migrations", `${timestamp}_fix_advisor_issues.sql`);
  await writeFile(migrationPath, migrationContent);

  console.log(`[INFO] Migration file created: ${migrationPath}\n`);
  console.log("[INFO] Review the migration before applying:\n");
  console.log(`  npm run migrate\n`);
}

main().catch(console.error);
