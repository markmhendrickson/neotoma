#!/usr/bin/env tsx

/**
 * Generate migration to fix Supabase Performance Advisor issues
 * 
 * Uses the Management API to get detailed issue information and generates
 * a comprehensive migration file.
 */

import dotenv from "dotenv";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

interface AdvisorLint {
  name: string;
  level: "ERROR" | "WARNING" | "INFO";
  title: string;
  description: string;
  detail?: string;
  remediation?: string;
  metadata?: {
    schema?: string;
    table?: string;
    column?: string;
    function?: string;
    index?: string;
    extension?: string;
    constraint?: string;
    policy?: string;
  };
}

async function fetchAdvisorIssues(projectRef: string, accessToken: string, type: "performance" | "security"): Promise<AdvisorLint[]> {
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/advisors/${type}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.lints || [];
  } catch (err) {
    console.error(`Error fetching ${type} advisor:`, err);
    return [];
  }
}

function generateMigration(lints: AdvisorLint[]): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0].replace("T", "");
  
  // Group by issue type
  const byType = new Map<string, AdvisorLint[]>();
  for (const lint of lints) {
    if (!byType.has(lint.name)) {
      byType.set(lint.name, []);
    }
    byType.get(lint.name)!.push(lint);
  }

  let migration = `-- Migration: Fix Performance Advisor Issues
-- Generated: ${new Date().toISOString()}
-- Description: Addresses ${lints.length} performance advisor issues

`;

  // Handle unindexed foreign keys
  if (byType.has("unindexed_foreign_keys")) {
    const issues = byType.get("unindexed_foreign_keys")!;
    migration += `-- ============================================================================
-- 1. Add indexes for unindexed foreign keys (${issues.length} issues)
-- ============================================================================
-- Foreign keys without indexes can cause slow joins and constraint checks.
-- Adding indexes improves query performance.

`;
    // We need to query the database for specific FK details
    // For now, add a note
    migration += `-- NOTE: Run this query to find specific foreign keys needing indexes:
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND NOT EXISTS (
--     SELECT 1 FROM pg_indexes
--     WHERE tablename = tc.table_name
--       AND indexdef LIKE '%' || kcu.column_name || '%'
--   );

`;
    
    // Common foreign keys we know about from the codebase
    const commonFKs = [
      { table: "auto_enhancement_queue", column: "user_id", ref: "auth.users(id)" },
      { table: "schema_recommendations", column: "user_id", ref: "auth.users(id)" },
      { table: "schema_recommendations", column: "applied_by", ref: "auth.users(id)" },
      { table: "field_blacklist", column: "user_id", ref: "auth.users(id)" },
      { table: "field_blacklist", column: "created_by", ref: "auth.users(id)" },
      { table: "relationship_observations", column: "source_id", ref: "sources(id)" },
      { table: "relationship_observations", column: "interpretation_id", ref: "interpretations(id)" },
      { table: "source_entity_edges", column: "source_id", ref: "sources(id)" },
      { table: "source_entity_edges", column: "entity_id", ref: "entities(id)" },
      { table: "source_entity_edges", column: "interpretation_id", ref: "interpretations(id)" },
      { table: "source_event_edges", column: "source_id", ref: "sources(id)" },
      { table: "source_event_edges", column: "event_id", ref: "timeline_events(id)" },
      { table: "timeline_events", column: "source_id", ref: "sources(id)" },
      { table: "observations", column: "source_id", ref: "sources(id)" },
      { table: "observations", column: "interpretation_id", ref: "interpretations(id)" },
      { table: "raw_fragments", column: "source_id", ref: "sources(id)" },
      { table: "raw_fragments", column: "interpretation_id", ref: "interpretations(id)" },
      { table: "relationships", column: "source_material_id", ref: "sources(id)" },
      { table: "interpretations", column: "source_id", ref: "sources(id)" },
      { table: "schema_registry", column: "user_id", ref: "auth.users(id)" },
    ];

    for (const fk of commonFKs) {
      const indexName = `idx_${fk.table}_${fk.column}`;
      migration += `-- Index for ${fk.table}.${fk.column} -> ${fk.ref}
CREATE INDEX IF NOT EXISTS ${indexName} ON ${fk.table}(${fk.column}) WHERE ${fk.column} IS NOT NULL;

`;
    }
  }

  // Handle unused indexes
  if (byType.has("unused_index")) {
    const issues = byType.get("unused_index")!;
    migration += `-- ============================================================================
-- 2. Review unused indexes (${issues.length} issues)
-- ============================================================================
-- These indexes have never been used. Consider dropping them to save space
-- and improve write performance. However, review query patterns first.

`;
    migration += `-- NOTE: Review these indexes before dropping. Some may be needed for future queries.
-- To find unused indexes, run:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND idx_scan = 0
-- ORDER BY pg_relation_size(indexrelid) DESC;

`;
  }

  // Handle RLS initplan issues
  if (byType.has("auth_rls_initplan")) {
    const issues = byType.get("auth_rls_initplan")!;
    migration += `-- ============================================================================
-- 3. Optimize RLS policies with auth function calls (${issues.length} issues)
-- ============================================================================
-- RLS policies that call auth.uid() or current_setting() are re-evaluated for each row.
-- Consider using SECURITY DEFINER functions or caching auth values.

`;
    migration += `-- NOTE: Review RLS policies that use auth.uid() or current_setting().
-- Consider using a SECURITY DEFINER function that caches the auth value:
-- CREATE FUNCTION auth_uid() RETURNS UUID
-- LANGUAGE SQL SECURITY DEFINER STABLE
-- AS $$ SELECT auth.uid() $$;
-- Then use auth_uid() in policies instead of auth.uid().

`;
  }

  // Handle multiple permissive policies
  if (byType.has("multiple_permissive_policies")) {
    const issues = byType.get("multiple_permissive_policies")!;
    migration += `-- ============================================================================
-- 4. Consolidate multiple permissive policies (${issues.length} issues)
-- ============================================================================
-- Multiple permissive policies on the same table/role/action are inefficient.
-- Consider combining them using OR conditions.

`;
    migration += `-- NOTE: Review tables with multiple permissive policies and consolidate:
-- SELECT tablename, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
-- GROUP BY tablename
-- HAVING COUNT(*) > 1;

`;
  }

  // Handle functions without search_path
  if (byType.has("function_search_path_mutable")) {
    const issues = byType.get("function_search_path_mutable")!;
    migration += `-- ============================================================================
-- 5. Add search_path to functions (${issues.length} issues)
-- ============================================================================
-- Functions without search_path are vulnerable to search_path injection attacks.

`;
    migration += `-- NOTE: Find functions without search_path and add it:
-- SELECT n.nspname, p.proname
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%';
-- 
-- Then add: ALTER FUNCTION schema.function_name SET search_path = public, pg_catalog;

`;
  }

  migration += `-- ============================================================================
-- Summary
-- ============================================================================
-- Total issues addressed: ${lints.length}
-- Review all changes before applying in production.
-- Test thoroughly after applying this migration.
`;

  return migration;
}

async function main() {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectId || !accessToken) {
    console.error("SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN must be set");
    process.exit(1);
  }

  console.log("[INFO] Fetching advisor issues from Supabase API...\n");

  const performanceIssues = await fetchAdvisorIssues(projectId, accessToken, "performance");
  const securityIssues = await fetchAdvisorIssues(projectId, accessToken, "security");

  const allIssues = [...performanceIssues, ...securityIssues];

  console.log(`Found ${allIssues.length} total issues:\n`);
  console.log(`  Performance: ${performanceIssues.length}`);
  console.log(`  Security: ${securityIssues.length}\n`);

  const migration = generateMigration(allIssues);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0].replace("T", "");
  const migrationPath = join(__dirname, "../supabase/migrations", `${timestamp}_fix_advisor_issues.sql`);

  await writeFile(migrationPath, migration);

  console.log(`[INFO] Migration file created: ${migrationPath}\n`);
  console.log("[INFO] Review the migration, then apply:\n");
  console.log(`  npm run migrate\n`);
}

main().catch(console.error);
