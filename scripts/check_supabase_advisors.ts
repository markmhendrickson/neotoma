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
dotenv.config({ path: ".env.development" });
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
}

/**
 * Check RLS in migration files (fallback when DB access not available)
 */
async function checkRLSInMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, "../supabase/migrations");
  const files = await readdir(migrationsDir);
  const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const tablesWithPolicies = new Set<string>();
  const tablesWithRLS = new Set<string>();

  for (const file of migrationFiles) {
    const content = await readFile(join(migrationsDir, file), "utf-8");
    
    // Find tables with policies
    const policyMatches = content.matchAll(/CREATE POLICY.*ON\s+(\w+)/gi);
    for (const match of policyMatches) {
      tablesWithPolicies.add(match[1]);
    }

    // Find tables with RLS enabled
    const rlsMatches = content.matchAll(/ALTER TABLE\s+(\w+)\s+ENABLE ROW LEVEL SECURITY/gi);
    for (const match of rlsMatches) {
      tablesWithRLS.add(match[1]);
    }
  }

  // Check schema.sql as well
  const schemaPath = join(__dirname, "../supabase/schema.sql");
  try {
    const schemaContent = await readFile(schemaPath, "utf-8");
    const schemaPolicyMatches = schemaContent.matchAll(/CREATE POLICY.*ON\s+(\w+)/gi);
    for (const match of schemaPolicyMatches) {
      tablesWithPolicies.add(match[1]);
    }
    const schemaRLSMatches = schemaContent.matchAll(/ALTER TABLE\s+(\w+)\s+ENABLE ROW LEVEL SECURITY/gi);
    for (const match of schemaRLSMatches) {
      tablesWithRLS.add(match[1]);
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

    // Find public read policies with USING (true)
    const publicReadMatches = content.matchAll(
      /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(\w+)\s+FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/gi
    );

    for (const match of publicReadMatches) {
      const policyName = match[1];
      const tableName = match[2];
      
      issues.push({
        severity: "error",
        type: "Overly Permissive RLS Policy",
        entity: `public.${tableName}`,
        description: `Policy "${policyName}" on ${tableName} allows public read access (USING (true))`,
        fixable: true,
        fix: `Replace with authenticated-only: CREATE POLICY "${policyName}" ON ${tableName} FOR SELECT USING (auth.role() = 'authenticated');`,
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

  // Get Supabase config
  const supabaseUrl = process.env.SUPABASE_URL || process.env.DEV_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.DEV_SUPABASE_SERVICE_KEY;

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

  // Run all checks
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
    for (const issue of typeIssues.slice(0, 5)) {
      console.log(`  - ${issue.entity}: ${issue.description}`);
    }
    if (typeIssues.length > 5) {
      console.log(`  ... and ${typeIssues.length - 5} more`);
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

