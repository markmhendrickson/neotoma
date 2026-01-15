#!/usr/bin/env tsx

/**
 * Get detailed advisor issue information from Management API
 */

import dotenv from "dotenv";

dotenv.config();

interface AdvisorLint {
  name: string;
  level: "ERROR" | "WARNING" | "INFO";
  title: string;
  description: string;
  detail?: string;
  remediation?: string;
  metadata?: any;
}

async function fetchAdvisorIssues(projectRef: string, accessToken: string, type: "performance" | "security"): Promise<AdvisorLint[]> {
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
}

async function main() {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectId || !accessToken) {
    console.error("SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN must be set");
    process.exit(1);
  }

  const performanceIssues = await fetchAdvisorIssues(projectId, accessToken, "performance");
  const securityIssues = await fetchAdvisorIssues(projectId, accessToken, "security");

  const allIssues = [...performanceIssues, ...securityIssues];

  // Group by issue type
  const byType = new Map<string, AdvisorLint[]>();
  for (const lint of allIssues) {
    if (!byType.has(lint.name)) {
      byType.set(lint.name, []);
    }
    byType.get(lint.name)!.push(lint);
  }

  console.log("\n=== Multiple Permissive Policies ===\n");
  const multiplePolicies = byType.get("multiple_permissive_policies") || [];
  for (const issue of multiplePolicies) {
    console.log(`Table: ${issue.metadata?.table || "unknown"}`);
    console.log(`Metadata: ${JSON.stringify(issue.metadata, null, 2)}`);
    console.log(`Detail: ${issue.detail || issue.description}`);
    console.log("---");
  }

  console.log("\n=== Duplicate Indexes ===\n");
  const duplicateIndexes = byType.get("duplicate_index") || [];
  for (const issue of duplicateIndexes) {
    console.log(`Table: ${issue.metadata?.table || "unknown"}`);
    console.log(`Index: ${issue.metadata?.index || "unknown"}`);
    console.log(`Metadata: ${JSON.stringify(issue.metadata, null, 2)}`);
    console.log(`Detail: ${issue.detail || issue.description}`);
    console.log("---");
  }

  console.log("\n=== Functions Without Search Path ===\n");
  const functionsNoSearchPath = byType.get("function_search_path_mutable") || [];
  for (const issue of functionsNoSearchPath) {
    console.log(`Function: ${issue.metadata?.function || "unknown"}`);
    console.log(`Metadata: ${JSON.stringify(issue.metadata, null, 2)}`);
    console.log(`Detail: ${issue.detail || issue.description}`);
    console.log("---");
  }

  console.log("\n=== Unused Indexes (first 10) ===\n");
  const unusedIndexes = byType.get("unused_index") || [];
  for (const issue of unusedIndexes.slice(0, 10)) {
    console.log(`Table: ${issue.metadata?.table || "unknown"}`);
    console.log(`Index: ${issue.metadata?.index || "unknown"}`);
    console.log(`Metadata: ${JSON.stringify(issue.metadata, null, 2)}`);
    console.log("---");
  }
}

main().catch(console.error);
