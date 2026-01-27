#!/usr/bin/env tsx

/**
 * Verify Supabase RLS State
 * 
 * This script queries the actual database to verify RLS policies and compare
 * with what the Management API reports. Helps identify discrepancies.
 * 
 * Usage:
 *   tsx scripts/verify_supabase_rls_state.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();
dotenv.config();

interface PolicyInfo {
  tablename: string;
  policyname: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface TableRLSInfo {
  tablename: string;
  rls_enabled: boolean;
  policy_count: number;
  policies: PolicyInfo[];
}

// Get Supabase config
const buildUrl = (projectId: string | undefined, fallbackUrl: string | undefined) => {
  if (projectId) return `https://${projectId}.supabase.co`;
  return fallbackUrl || "";
};

const projectId = process.env.SUPABASE_PROJECT_ID;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const url = process.env.SUPABASE_URL;

const env = process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development";
const supabaseUrl = buildUrl(projectId, url) || (env === "production" 
  ? (process.env.PROD_SUPABASE_PROJECT_ID ? `https://${process.env.PROD_SUPABASE_PROJECT_ID}.supabase.co` : process.env.PROD_SUPABASE_URL)
  : (process.env.DEV_SUPABASE_PROJECT_ID ? `https://${process.env.DEV_SUPABASE_PROJECT_ID}.supabase.co` : process.env.DEV_SUPABASE_URL));
const supabaseKey = serviceKey || (env === "production"
  ? process.env.PROD_SUPABASE_SERVICE_KEY
  : process.env.DEV_SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseKey) {
  console.error("[ERROR] Missing Supabase credentials. Set SUPABASE_PROJECT_ID and SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function execSQL(query: string): Promise<any> {
  try {
    const { data, error } = await supabase.rpc("exec_sql", { sql_text: query });
    if (error) {
      // Try alternative parameter name
      const { data: data2, error: error2 } = await supabase.rpc("exec_sql", { query });
      if (error2) {
        throw error2;
      }
      return data2;
    }
    return data;
  } catch (err) {
    console.log(`[WARN] Could not execute via exec_sql: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function queryManagementAPI(endpoint: string): Promise<any> {
  const projectRef = projectId || (url ? url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] : null);
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectRef || !accessToken) {
    console.log(`[WARN] Missing SUPABASE_ACCESS_TOKEN or project ref for Management API`);
    return null;
  }

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}${endpoint}`,
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

    return await response.json();
  } catch (err) {
    console.log(`[WARN] Management API query failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function checkRLSStatus(): Promise<void> {
  console.log("\n[INFO] Checking RLS status on all tables...\n");

  // Use Management API security advisor to get actual RLS issues
  const securityData = await queryManagementAPI("/advisors/security");
  
  if (securityData && securityData.lints) {
    const rlsDisabledIssues = securityData.lints.filter((lint: any) => 
      lint.name === "rls_disabled" || lint.title?.toLowerCase().includes("rls disabled")
    );
    
    if (rlsDisabledIssues.length > 0) {
      console.log(`❌ Found ${rlsDisabledIssues.length} tables with RLS disabled:\n`);
      for (const issue of rlsDisabledIssues) {
        const table = issue.metadata?.table || "unknown";
        console.log(`  - ${table}`);
      }
      console.log();
    } else {
      console.log("✅ No tables with RLS disabled (according to Management API)\n");
    }
  } else {
    console.log("[WARN] Could not query RLS status via Management API\n");
  }
}

async function checkPolicyRoles(): Promise<void> {
  console.log("\n[INFO] Checking policy roles (looking for anonymous access)...\n");

  // Use Management API security advisor
  const securityData = await queryManagementAPI("/advisors/security");
  
  if (securityData && securityData.lints) {
    const anonymousAccessIssues = securityData.lints.filter((lint: any) => 
      lint.name === "auth_allow_anonymous_sign_ins" || 
      lint.title?.toLowerCase().includes("anonymous")
    );
    
    if (anonymousAccessIssues.length > 0) {
      console.log(`❌ Found ${anonymousAccessIssues.length} tables with policies allowing anonymous access:\n`);
      
      const tablesByIssue = new Map<string, number>();
      for (const issue of anonymousAccessIssues) {
        // Try multiple ways to extract table name
        let table = issue.metadata?.table;
        
        // Try remediation field (most reliable based on sample)
        if (!table && issue.remediation) {
          const match = issue.remediation.match(/Table\s+`?public\.(\w+)`?/i);
          if (match) table = match[1];
        }
        
        // Try description
        if (!table && issue.description) {
          const match = issue.description.match(/Table\s+`?public\.(\w+)`?/i);
          if (match) table = match[1];
        }
        
        // Try fix field
        if (!table && issue.fix) {
          const match = issue.fix.match(/Table\s+`?public\.(\w+)`?/i);
          if (match) table = match[1];
        }
        
        table = table || "unknown";
        tablesByIssue.set(table, (tablesByIssue.get(table) || 0) + 1);
      }
      
      // Sort by table name, but put "unknown" last
      const sortedTables = Array.from(tablesByIssue.entries()).sort((a, b) => {
        if (a[0] === "unknown") return 1;
        if (b[0] === "unknown") return -1;
        return a[0].localeCompare(b[0]);
      });
      
      for (const [table, count] of sortedTables) {
        if (table === "unknown") {
          console.log(`  - ${table} (${count} issues - table names not in metadata, check full issue details)`);
        } else {
          console.log(`  - ${table} (${count} issue${count > 1 ? 's' : ''})`);
        }
      }
      console.log();
      console.log("These tables need policies with 'TO authenticated' restriction");
      console.log();
      
      // Show first few full issue details for debugging
      if (anonymousAccessIssues.length > 0 && anonymousAccessIssues[0].metadata?.table === undefined) {
        console.log("Sample issue details (for debugging):");
        console.log(JSON.stringify(anonymousAccessIssues[0], null, 2).substring(0, 500));
        console.log();
      }
    } else {
      console.log("✅ No anonymous access issues found (according to Management API)\n");
    }
  } else {
    console.log("[WARN] Could not query policies via Management API\n");
  }
}

async function checkAuthUidFunction(): Promise<void> {
  console.log("\n[INFO] Checking auth_uid() function definition...\n");

  // Check via Management API security advisor
  const securityData = await queryManagementAPI("/advisors/security");
  
  if (securityData && securityData.lints) {
    const searchPathIssues = securityData.lints.filter((lint: any) => 
      lint.name === "function_search_path_mutable" || 
      lint.metadata?.function === "auth_uid" ||
      (lint.title?.toLowerCase().includes("search_path") && lint.metadata?.function === "auth_uid")
    );
    
    if (searchPathIssues.length > 0) {
      console.log("❌ auth_uid() function is MISSING SET search_path");
      console.log("   Fix: Add SET search_path = public, pg_catalog to function definition");
      console.log();
    } else {
      console.log("✅ auth_uid() function appears to have SET search_path (no issues reported)");
      console.log();
    }
  } else {
    console.log("[WARN] Could not check auth_uid() function via Management API");
    console.log("   Migration 20260115130254_optimize_rls_policies.sql should have set it");
    console.log();
  }
}

async function checkSpecificTables(): Promise<void> {
  console.log("\n[INFO] Checking specific tables mentioned in errors...\n");

  const tablesToCheck = ['payload_submissions', 'record_relationships', 'entity_event_edges'];
  
  // Use Management API to check these tables
  const securityData = await queryManagementAPI("/advisors/security");
  
  if (securityData && securityData.lints) {
    for (const tableName of tablesToCheck) {
      const tableIssues = securityData.lints.filter((lint: any) => 
        lint.metadata?.table === tableName
      );
      
      const rlsDisabled = tableIssues.find((lint: any) => 
        lint.name === "rls_disabled" || lint.title?.toLowerCase().includes("rls disabled")
      );
      
      if (rlsDisabled) {
        console.log(`❌ ${tableName}: RLS DISABLED - NEEDS FIX`);
      } else if (tableIssues.length > 0) {
        console.log(`⚠️  ${tableName}: Has ${tableIssues.length} other issue(s)`);
      } else {
        // Table might not exist or have no issues
        console.log(`✅ ${tableName}: No issues reported (may not exist or is fine)`);
      }
    }
  } else {
    console.log("[WARN] Could not check specific tables via Management API");
    console.log("   Tables to check: " + tablesToCheck.join(", "));
  }
  console.log();
}

async function generateFixSQL(): Promise<void> {
  console.log("\n[INFO] Generating SQL fixes based on Management API issues...\n");

  const securityData = await queryManagementAPI("/advisors/security");
  let fixSQL = "-- Auto-generated fixes for RLS issues\n";
  fixSQL += `-- Generated: ${new Date().toISOString()}\n\n`;
  
  let hasFixes = false;

  if (securityData && securityData.lints) {
    // RLS disabled issues
    const rlsDisabled = securityData.lints.filter((lint: any) => 
      lint.name === "rls_disabled" || lint.title?.toLowerCase().includes("rls disabled")
    );
    
    for (const issue of rlsDisabled) {
      const table = issue.metadata?.table;
      if (table) {
        fixSQL += `-- Fix: Enable RLS on ${table}\n`;
        fixSQL += `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n\n`;
        hasFixes = true;
      }
    }

    // Function search_path issues
    const searchPathIssues = securityData.lints.filter((lint: any) => 
      lint.name === "function_search_path_mutable" && lint.metadata?.function === "auth_uid"
    );
    
    if (searchPathIssues.length > 0) {
      fixSQL += `-- Fix: Add SET search_path to auth_uid() function\n`;
      fixSQL += `CREATE OR REPLACE FUNCTION auth_uid() RETURNS UUID\n`;
      fixSQL += `LANGUAGE SQL SECURITY DEFINER STABLE\n`;
      fixSQL += `SET search_path = public, pg_catalog\n`;
      fixSQL += `AS $$ SELECT auth.uid() $$;\n\n`;
      hasFixes = true;
    }
  }

  if (hasFixes) {
    console.log("Generated fix SQL:");
    console.log(fixSQL);
    console.log("\n[INFO] Save this to a migration file and apply it");
  } else {
    console.log("✅ No critical fixes needed based on Management API");
    console.log("   (Note: Some issues may require manual fixes or dashboard settings)");
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("Supabase RLS State Verification");
  console.log("=".repeat(70));

  await checkRLSStatus();
  await checkPolicyRoles();
  await checkAuthUidFunction();
  await checkSpecificTables();
  await generateFixSQL();

  console.log("=".repeat(70));
  console.log("Verification complete");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error("[ERROR] Verification failed:", error);
  process.exit(1);
});
