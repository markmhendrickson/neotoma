#!/usr/bin/env tsx

/**
 * Check Supabase Security and Performance Advisor issues
 * 
 * This script validates common security and performance issues that the
 * Supabase Advisor detects, allowing us to catch them before deployment.
 * 
 * Usage:
 *   tsx scripts/check_supabase_advisors.ts [--fix]
 * 
 * Exit codes:
 *   0 - No issues found
 *   1 - Issues found (use --fix to auto-fix where safe)
 */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();
dotenv.config();

interface AdvisorIssue {
  severity: "error" | "warning" | "info";
  type: string;
  entity: string;
  description: string;
  fixable: boolean;
  fix?: string;
}

const issues: AdvisorIssue[] = [];

/**
 * Check if RLS is enabled on all tables that have policies
 */
async function checkRLSEnabled(supabase: any): Promise<void> {
  // If no Supabase client, check migration files only
  if (!supabase) {
    await checkRLSInMigrations();
    return;
  }

  try {
    const { data, error } = await supabase.rpc("exec_sql", {
      query: `
        SELECT 
          t.tablename,
          CASE WHEN t.rowsecurity THEN 'enabled' ELSE 'disabled' END as rls_status,
          COUNT(p.policyname) as policy_count
        FROM pg_tables t
        LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
        WHERE t.schemaname = 'public'
          AND t.tablename NOT LIKE 'pg_%'
          AND t.tablename NOT LIKE '_%'
        GROUP BY t.tablename, t.rowsecurity
        HAVING COUNT(p.policyname) > 0 AND t.rowsecurity = false
        ORDER BY t.tablename;
      `,
    });

    if (error) {
      // Fallback: check via direct SQL inspection of migration files
      await checkRLSInMigrations();
      return;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        issues.push({
          severity: "error",
          type: "RLS Disabled with Policies",
          entity: `public.${row.tablename}`,
          description: `Table ${row.tablename} has ${row.policy_count} policies but RLS is disabled`,
          fixable: true,
          fix: `ALTER TABLE ${row.tablename} ENABLE ROW LEVEL SECURITY;`,
        });
      }
    }
  } catch (err) {
    // Fallback: check via direct SQL inspection of migration files
    await checkRLSInMigrations();
  }
}

/**
 * Check RLS in migration files (fallback when DB access not available)
 */
async function checkRLSInMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, "../supabase/migrations");
  const files = await readdir(migrationsDir);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const tablesCreated = new Set<string>();
  const tablesWithPolicies = new Set<string>();
  const tablesWithRLS = new Set<string>();

  for (const file of migrationFiles) {
    const content = await readFile(join(migrationsDir, file), "utf-8");
    
    // Find tables created (match table name after CREATE TABLE, including IF NOT EXISTS)
    // Use a more precise regex that captures the actual table name, not "IF" from "IF NOT EXISTS"
    const createTableMatches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi);
    for (const match of createTableMatches) {
      const tableName = match[1];
      // Skip false positives like "IF" from "IF NOT EXISTS"
      if (tableName && tableName !== 'IF' && tableName !== 'NOT' && tableName !== 'EXISTS') {
        tablesCreated.add(tableName);
      }
    }
    
    // Find tables with policies (match table name after ON, including underscores)
    const policyMatches = content.matchAll(/CREATE POLICY[^;]*ON\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
    for (const match of policyMatches) {
      tablesWithPolicies.add(match[1]);
    }

    // Find tables with RLS enabled (match table name after ALTER TABLE, including underscores)
    // Exclude matches inside DO blocks with IF EXISTS (conditional execution)
    const rlsMatches = content.matchAll(/ALTER TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ENABLE ROW LEVEL SECURITY/gi);
    for (const match of rlsMatches) {
      const matchIndex = match.index || 0;
      // Check if this ALTER TABLE is inside a DO block with IF EXISTS
      const beforeMatch = content.substring(Math.max(0, matchIndex - 500), matchIndex);
      const isInConditionalBlock = /DO\s+\$\$[\s\S]*?IF\s+EXISTS[\s\S]*?THEN/gi.test(beforeMatch);
      
      // Only count as RLS enabled if it's NOT in a conditional block
      // (conditional blocks may not execute if table doesn't exist yet)
      if (!isInConditionalBlock) {
        tablesWithRLS.add(match[1]);
      }
    }
  }

  // Check schema.sql as well
  const schemaPath = join(__dirname, "../supabase/schema.sql");
  try {
    const schemaContent = await readFile(schemaPath, "utf-8");
    const schemaCreateTableMatches = schemaContent.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi);
    for (const match of schemaCreateTableMatches) {
      tablesCreated.add(match[1]);
    }
    const schemaPolicyMatches = schemaContent.matchAll(/CREATE POLICY[^;]*ON\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
    for (const match of schemaPolicyMatches) {
      tablesWithPolicies.add(match[1]);
    }
    const schemaRLSMatches = schemaContent.matchAll(/ALTER TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ENABLE ROW LEVEL SECURITY/gi);
    for (const match of schemaRLSMatches) {
      const matchIndex = match.index || 0;
      const beforeMatch = schemaContent.substring(Math.max(0, matchIndex - 500), matchIndex);
      const isInConditionalBlock = /DO\s+\$\$[\s\S]*?IF\s+EXISTS[\s\S]*?THEN/gi.test(beforeMatch);
      
      if (!isInConditionalBlock) {
        tablesWithRLS.add(match[1]);
      }
    }
  } catch (err) {
    // Schema file might not exist
  }

  // Find tables with policies but no RLS
  for (const table of tablesWithPolicies) {
    if (!tablesWithRLS.has(table)) {
      issues.push({
        severity: "error",
        type: "RLS Disabled with Policies",
        entity: `public.${table}`,
        description: `Table ${table} has policies but RLS is not enabled in migrations`,
        fixable: true,
        fix: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
      });
    }
  }

  // Find tables created without RLS (all user-facing tables should have RLS)
  // Exclude system tables and edge tables that might be created conditionally
  const excludedTables = new Set([
    'pg_', '_', // System tables
    'schema_migrations', // Migration tracking table
  ]);
  
  for (const table of tablesCreated) {
    // Skip excluded tables
    if (Array.from(excludedTables).some(prefix => table.startsWith(prefix))) {
      continue;
    }
    
    // Check if RLS is enabled for this table
    if (!tablesWithRLS.has(table)) {
      issues.push({
        severity: "error",
        type: "RLS Not Enabled on Table",
        entity: `public.${table}`,
        description: `Table ${table} was created but RLS is not enabled. All tables must have RLS enabled for security.`,
        fixable: true,
        fix: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n-- Then add appropriate RLS policies`,
      });
    }
  }
}

/**
 * Check for functions without search_path set
 */
async function checkFunctionSearchPath(): Promise<void> {
  const migrationsDir = join(__dirname, "../supabase/migrations");
  const schemaPath = join(__dirname, "../supabase/schema.sql");
  const files = [schemaPath, ...(await readdir(migrationsDir)).map(f => join(migrationsDir, f))];

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    // Find function definitions
    const functionMatches = content.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)\s*\([^)]*\)\s*(?:RETURNS\s+\w+)?\s*(?:LANGUAGE\s+\w+)?\s*(?:SECURITY\s+\w+)?\s*(?:SET\s+search_path\s*=)?/gi
    );

    for (const match of functionMatches) {
      const funcName = match[1];
      const funcStart = match.index!;
      const funcEnd = content.indexOf("$$;", funcStart);
      if (funcEnd === -1) continue;

      const funcBody = content.substring(funcStart, funcEnd);
      
      // Check if search_path is set
      if (!funcBody.match(/SET\s+search_path\s*=/i)) {
        issues.push({
          severity: "warning",
          type: "Function Search Path Mutable",
          entity: `public.${funcName}`,
          description: `Function ${funcName} does not set search_path, which can lead to search_path injection attacks`,
          fixable: true,
          fix: `Add SET search_path = public, pg_catalog to function ${funcName}`,
        });
      }
    }
  }
}

/**
 * Check for extensions in public schema
 */
async function checkExtensionsInPublic(): Promise<void> {
  const schemaPath = join(__dirname, "../supabase/schema.sql");
  try {
    const content = await readFile(schemaPath, "utf-8");
    
    // Find CREATE EXTENSION statements
    const extensionMatches = content.matchAll(/CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)(?:\s+SCHEMA\s+(\w+))?/gi);
    
    for (const match of extensionMatches) {
      const extName = match[1];
      const schema = match[2] || "public";
      
      if (schema === "public" && extName !== "pgcrypto") {
        issues.push({
          severity: "warning",
          type: "Extension in Public",
          entity: `public.${extName}`,
          description: `Extension ${extName} is installed in the public schema. Consider moving to a dedicated schema.`,
          fixable: true,
          fix: `Move extension to extensions schema: CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION ${extName} SCHEMA extensions;`,
        });
      }
    }
  } catch (err) {
    // Schema file might not exist
  }
}

/**
 * Query Supabase Management API for Performance Advisor issues
 */
async function checkPerformanceAdvisorAPI(projectRef: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/advisors/performance`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        console.log("[INFO] Performance Advisor API not available (may be deprecated or require different permissions)\n");
        return;
      }
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const lints = data.lints || [];

    for (const lint of lints) {
      const severity = lint.level === "ERROR" ? "error" : lint.level === "WARNING" ? "warning" : "info";
      
      // Extract entity name from metadata
      let entity = "unknown";
      if (lint.metadata) {
        const schema = lint.metadata.schema || "public";
        const table = lint.metadata.table;
        const functionName = lint.metadata.function;
        const extension = lint.metadata.extension;
        const index = lint.metadata.index;
        const column = lint.metadata.column;
        
        if (table) {
          entity = `${schema}.${table}${column ? `.${column}` : ""}`;
        } else if (functionName) {
          entity = `${schema}.${functionName}`;
        } else if (extension) {
          entity = `${schema}.${extension}`;
        } else if (index) {
          entity = `${schema}.${index}`;
        } else {
          entity = schema;
        }
      }

      issues.push({
        severity,
        type: lint.name || lint.title || "Performance Issue",
        entity,
        description: lint.description || lint.detail || lint.title || "Performance issue detected",
        fixable: !!lint.remediation,
        fix: lint.remediation || undefined,
      });
    }
  } catch (err) {
    console.log(`[WARN] Could not fetch Performance Advisor from API: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/**
 * Query Supabase Management API for Security Advisor issues
 */
async function checkSecurityAdvisorAPI(projectRef: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/advisors/security`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        console.log("[INFO] Security Advisor API not available (may be deprecated or require different permissions)\n");
        return;
      }
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const lints = data.lints || [];

    for (const lint of lints) {
      const severity = lint.level === "ERROR" ? "error" : lint.level === "WARNING" ? "warning" : "info";
      
      // Extract entity name from metadata
      let entity = "unknown";
      if (lint.metadata) {
        const schema = lint.metadata.schema || "public";
        const table = lint.metadata.table;
        const functionName = lint.metadata.function;
        const extension = lint.metadata.extension;
        const index = lint.metadata.index;
        const column = lint.metadata.column;
        
        if (table) {
          entity = `${schema}.${table}${column ? `.${column}` : ""}`;
        } else if (functionName) {
          entity = `${schema}.${functionName}`;
        } else if (extension) {
          entity = `${schema}.${extension}`;
        } else if (index) {
          entity = `${schema}.${index}`;
        } else {
          entity = schema;
        }
      }

      issues.push({
        severity,
        type: lint.name || lint.title || "Security Issue",
        entity,
        description: lint.description || lint.detail || lint.title || "Security issue detected",
        fixable: !!lint.remediation,
        fix: lint.remediation || undefined,
      });
    }
  } catch (err) {
    console.log(`[WARN] Could not fetch Security Advisor from API: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/**
 * Check for public read policies that are too permissive
 */
async function checkPublicReadPolicies(): Promise<void> {
  const migrationsDir = join(__dirname, "../supabase/migrations");
  const schemaPath = join(__dirname, "../supabase/schema.sql");
  const files = [schemaPath, ...(await readdir(migrationsDir)).map(f => join(migrationsDir, f))];

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    // Find ALL policies with USING (true) that are NOT restricted to service_role
    // This catches overly permissive policies for any operation (SELECT, INSERT, UPDATE, DELETE, ALL)
    const permissivePolicyMatches = content.matchAll(
      /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(\w+)\s+(?:FOR\s+(\w+)\s+)?(?:TO\s+(\w+)\s+)?USING\s*\(\s*true\s*\)/gi
    );

    for (const match of permissivePolicyMatches) {
      const policyName = match[1];
      const tableName = match[2];
      const operation = match[3] || "ALL";
      const role = match[4] || "public";
      
      // Skip service_role policies (they're intentionally permissive)
      if (role.toLowerCase() === "service_role") {
        continue;
      }
      
      // Check if this is a service role policy by looking ahead in the content
      const matchIndex = match.index || 0;
      const afterMatch = content.substring(matchIndex, matchIndex + 200);
      if (afterMatch.includes("TO service_role") || afterMatch.includes("service_role")) {
        continue;
      }
      
      issues.push({
        severity: "warning",
        type: "Overly Permissive RLS Policy",
        entity: `public.${tableName}`,
        description: `Policy "${policyName}" on ${tableName} allows access with USING (true) for ${operation} operation. Should be user-scoped or restricted to service_role.`,
        fixable: true,
        fix: `Replace with user-scoped policy: DROP POLICY "${policyName}" ON ${tableName}; CREATE POLICY "${policyName}" ON ${tableName} FOR ${operation} USING (user_id = auth_uid());`,
      });
    }
    
    // Also check for policies without USING clause (implicitly permissive)
    const noUsingMatches = content.matchAll(
      /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(\w+)\s+FOR\s+(\w+)(?:\s+TO\s+(\w+))?(?![\s\S]*?USING)/gi
    );
    
    for (const match of noUsingMatches) {
      const policyName = match[1];
      const tableName = match[2];
      const operation = match[3];
      const role = match[4] || "public";
      
      // Skip service_role policies
      if (role.toLowerCase() === "service_role") {
        continue;
      }
      
      // Check if this is a service role policy
      const matchIndex = match.index || 0;
      const afterMatch = content.substring(matchIndex, matchIndex + 200);
      if (afterMatch.includes("TO service_role") || afterMatch.includes("service_role")) {
        continue;
      }
      
      issues.push({
        severity: "warning",
        type: "Overly Permissive RLS Policy",
        entity: `public.${tableName}`,
        description: `Policy "${policyName}" on ${tableName} for ${operation} operation lacks USING clause, which may allow overly permissive access.`,
        fixable: true,
        fix: `Add user-scoped USING clause: DROP POLICY "${policyName}" ON ${tableName}; CREATE POLICY "${policyName}" ON ${tableName} FOR ${operation} USING (user_id = auth_uid());`,
      });
    }
  }
}

/**
 * Generate a migration file to fix issues
 */
async function generateFixMigration(issuesToFix: AdvisorIssue[]): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0].replace("T", "");
  const migrationName = `${timestamp}_fix_advisor_issues.sql`;
  
  let migrationContent = `-- Migration: Fix Security Advisor issues
-- Generated: ${new Date().toISOString()}
-- Description: Auto-generated fixes for ${issuesToFix.length} advisor issue(s)

`;

  for (const issue of issuesToFix) {
    if (issue.fix) {
      migrationContent += `-- Fix: ${issue.type} - ${issue.entity}\n`;
      migrationContent += `-- ${issue.description}\n`;
      
      if (issue.type === "RLS Disabled with Policies") {
        migrationContent += `ALTER TABLE ${issue.entity.replace("public.", "")} ENABLE ROW LEVEL SECURITY;\n\n`;
      } else if (issue.type === "Function Search Path Mutable") {
        migrationContent += `-- TODO: Update function ${issue.entity.replace("public.", "")} to include SET search_path\n\n`;
      } else if (issue.type === "Extension in Public") {
        migrationContent += `-- TODO: Move extension ${issue.entity.replace("public.", "")} to extensions schema\n\n`;
      } else if (issue.type === "Overly Permissive RLS Policy") {
        migrationContent += `-- TODO: Update policy on ${issue.entity.replace("public.", "")} to require authentication\n\n`;
      }
    }
  }

  return migrationContent;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");

  console.log("[INFO] Checking Supabase Advisor issues...\n");

  // Get Supabase config - use single variable names (set by 1Password sync based on ENVIRONMENT)
  // With backward compatibility fallback to DEV_/PROD_ prefixes
  const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
    if (projectId) return `https://${projectId}.supabase.co`;
    return fallbackUrl || "";
  };

  // Primary: Use single variable names (environment-based selection via 1Password sync)
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;

  // Fallback: Use DEV_/PROD_ prefixes for backward compatibility
  const env = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
  const supabaseUrl = buildUrl(projectId, url) || (env === "production" 
    ? (process.env.PROD_SUPABASE_PROJECT_ID ? `https://${process.env.PROD_SUPABASE_PROJECT_ID}.supabase.co` : process.env.PROD_SUPABASE_URL)
    : (process.env.DEV_SUPABASE_PROJECT_ID ? `https://${process.env.DEV_SUPABASE_PROJECT_ID}.supabase.co` : process.env.DEV_SUPABASE_URL));
  const supabaseKey = serviceKey || (env === "production"
    ? process.env.PROD_SUPABASE_SERVICE_KEY
    : process.env.DEV_SUPABASE_SERVICE_KEY);

  let supabase: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
      console.log("[WARN] Could not connect to Supabase, checking migration files only\n");
    }
  } else {
    console.log("[INFO] No Supabase credentials found, checking migration files only\n");
  }

  // Extract project ref for Management API
  const projectRef = projectId || (url ? url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] : null);
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  // Query Supabase Management API for full advisor results (if access token available)
  if (projectRef && accessToken) {
    console.log("[INFO] Querying Supabase Management API for advisor issues...\n");
    await checkPerformanceAdvisorAPI(projectRef, accessToken);
    await checkSecurityAdvisorAPI(projectRef, accessToken);
  } else if (projectRef && !accessToken) {
    console.log("[INFO] SUPABASE_ACCESS_TOKEN not set - skipping Management API checks (dashboard may show more issues)\n");
  }

  // Run local checks (migration file analysis)
  await checkRLSEnabled(supabase);
  await checkFunctionSearchPath();
  await checkExtensionsInPublic();
  await checkPublicReadPolicies();

  // Report results
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  if (issues.length === 0) {
    console.log("✅ No advisor issues found!\n");
    process.exit(0);
  }

  console.log(`Found ${issues.length} issue(s):\n`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Info: ${infos.length}\n`);

  // Group by type
  const byType = new Map<string, AdvisorIssue[]>();
  for (const issue of issues) {
    if (!byType.has(issue.type)) {
      byType.set(issue.type, []);
    }
    byType.get(issue.type)!.push(issue);
  }

  for (const [type, typeIssues] of byType.entries()) {
    console.log(`${type} (${typeIssues.length}):`);
    for (const issue of typeIssues.slice(0, 10)) {
      console.log(`  - ${issue.entity}: ${issue.description}`);
      if (issue.fix) {
        console.log(`    Fix: ${issue.fix.substring(0, 100)}${issue.fix.length > 100 ? "..." : ""}`);
      }
    }
    if (typeIssues.length > 10) {
      console.log(`  ... and ${typeIssues.length - 10} more`);
    }
    console.log();
  }

  if (shouldFix) {
    const fixableIssues = issues.filter((i) => i.fixable);
    if (fixableIssues.length > 0) {
      console.log(`[INFO] Generating migration for ${fixableIssues.length} fixable issue(s)...\n`);
      const migrationContent = await generateFixMigration(fixableIssues);
      const migrationPath = join(__dirname, "../supabase/migrations", `fix_advisor_issues_${Date.now()}.sql`);
      await import("fs/promises").then((fs) => fs.writeFile(migrationPath, migrationContent));
      console.log(`[INFO] Migration file created: ${migrationPath}\n`);
      console.log("[INFO] Review and apply the migration manually\n");
    }
  } else {
    console.log("[INFO] Run with --fix to generate a migration file\n");
  }

  // Exit with error code if there are errors
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[ERROR] Failed to check advisors:", error);
  process.exit(1);
});





