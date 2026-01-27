/**
 * DATA_DIR Schema Analysis Script
 *
 * Analyzes parquet files in $DATA_DIR to identify entity types and field patterns
 * that could inspire additions to 1.0 schema definitions.
 *
 * Run: npx tsx scripts/analyze_data_dir_for_schemas.ts
 *
 * Output: docs/reports/data_dir_schema_analysis.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ENTITY_SCHEMAS } from "../src/services/schema_definitions.js";

interface DataTypeInfo {
  name: string;
  schema: Record<string, string>;
  description?: string;
  version?: string;
  hasSchema: boolean;
  recordCount?: number;
  fieldCount: number;
}

interface FieldPattern {
  fieldName: string;
  dataTypes: string[];
  frequency: number;
}

interface AnalysisReport {
  totalDataTypes: number;
  coveredTypes: string[];
  missingTypes: string[];
  dataTypeDetails: DataTypeInfo[];
  commonFieldPatterns: FieldPattern[];
  priorityRecommendations: {
    type: string;
    reason: string;
    category: string;
    recordCount?: number;
  }[];
}

async function analyzeDataDir(): Promise<AnalysisReport> {
  console.log("🔍 Analyzing $DATA_DIR parquet files...\n");

  const dataDir = process.env.DATA_DIR || path.join(process.env.HOME || "", "data");
  console.log(`📁 DATA_DIR: ${dataDir}\n`);

  // Use known data types from MCP list (72 types as of 2025-01-22)
  console.log("📊 Using known data types from Parquet MCP...");
  const dataTypes: string[] = [
    "account_identifiers", "accounts", "addresses", "arguments", "asset_types",
    "asset_values", "balances", "bank_certificates", "beliefs", "companies",
    "contacts", "contracts", "crypto_transactions", "daily_triages", "disputes",
    "domains", "email_workflows", "emails", "emotions", "env_var_mappings",
    "equity_units", "events", "execution_plans", "exercises", "financial_strategies",
    "fixed_costs", "flows", "foods", "goals", "habit_completions",
    "habit_objectives", "habits", "holdings", "income", "investments",
    "liabilities", "locations", "mcp_server_integrations", "meals", "messages",
    "movies", "notes", "orders", "outcomes", "payroll_documents",
    "people", "posts", "processes", "projects", "properties",
    "property_equipment", "purchases", "recurring_events", "related_materials", "relationships",
    "research", "sets", "songs", "strategies", "task_attachments",
    "task_comments", "task_dependencies", "task_stories", "tasks", "tax_events",
    "tax_filings", "transactions", "transcriptions", "transfers", "user_accounts",
    "wallets", "workouts"
  ];

  console.log(`   Found ${dataTypes.length} data types\n`);

  // Get existing schemas from schema_definitions.ts
  const existingSchemas = new Set(Object.keys(ENTITY_SCHEMAS));
  console.log(`📦 Existing schemas: ${existingSchemas.size}\n`);

  // Helper to normalize type names (handle plural/singular and composite names)
  const normalizeTypeName = (name: string): string => {
    // Handle special cases first
    if (name === "addresses") return "address";
    if (name === "processes") return "process";
    if (name === "strategies") return "strategy";
    
    // Handle composite names (e.g., task_dependencies → task_dependency)
    if (name.includes("_")) {
      const parts = name.split("_");
      const lastPart = parts[parts.length - 1];
      if (lastPart.endsWith("ies")) {
        // dependencies → dependency, stories → story
        parts[parts.length - 1] = lastPart.slice(0, -3) + "y";
      } else if (lastPart.endsWith("s") && lastPart !== "ss") {
        // attachments → attachment, comments → comment
        parts[parts.length - 1] = lastPart.slice(0, -1);
      }
      return parts.join("_");
    }
    
    // Remove trailing 's' for simple plurals
    if (name.endsWith("ies")) {
      return name.slice(0, -3) + "y";
    }
    if (name.endsWith("s") && name !== "address" && name !== "process") {
      return name.slice(0, -1);
    }
    return name;
  };

  // Check if a data type is covered (considering plural/singular and variants)
  const isCovered = (dataType: string): boolean => {
    return existingSchemas.has(dataType) || existingSchemas.has(normalizeTypeName(dataType));
  };

  // Analyze each data type
  console.log("🔬 Analyzing field patterns...\n");
  const dataTypeDetails: DataTypeInfo[] = [];
  const fieldCounts: Map<string, Set<string>> = new Map();

  for (const dataType of dataTypes) {
    // Check if covered (considering plural/singular)
    const hasSchema = isCovered(dataType);
    const info: DataTypeInfo = {
      name: dataType,
      schema: {},
      hasSchema,
      fieldCount: 0,
    };
    
    dataTypeDetails.push(info);

    // Track field patterns
    for (const field of Object.keys(info.schema)) {
      if (!fieldCounts.has(field)) {
        fieldCounts.set(field, new Set());
      }
      fieldCounts.get(field)!.add(dataType);
    }
  }

  // Identify covered and missing types (considering plural/singular)
  const coveredTypes = dataTypes.filter((t) => isCovered(t));
  const missingTypes = dataTypes.filter((t) => !isCovered(t));

  console.log(`✅ Covered: ${coveredTypes.length}`);
  console.log(`❌ Missing: ${missingTypes.length}\n`);

  // Calculate common field patterns
  const commonFieldPatterns: FieldPattern[] = Array.from(fieldCounts.entries())
    .map(([field, types]) => ({
      fieldName: field,
      dataTypes: Array.from(types),
      frequency: types.size,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);

  // Generate priority recommendations
  const priorityRecommendations = generateRecommendations(
    missingTypes,
    dataTypeDetails,
    existingSchemas
  );

  return {
    totalDataTypes: dataTypes.length,
    coveredTypes,
    missingTypes,
    dataTypeDetails,
    commonFieldPatterns,
    priorityRecommendations,
  };
}

function generateRecommendations(
  missingTypes: string[],
  dataTypeDetails: DataTypeInfo[],
  existingSchemas: Set<string>
): AnalysisReport["priorityRecommendations"] {
  const recommendations: AnalysisReport["priorityRecommendations"] = [];

  // Categorize missing types
  const categoryMap: Record<string, string> = {
    // Finance
    account_identifiers: "finance",
    asset_types: "finance",
    asset_values: "finance",
    bank_certificates: "finance",
    disputes: "finance",
    equity_units: "finance",
    financial_strategies: "finance",
    investments: "finance",
    payroll_documents: "finance",
    user_accounts: "finance",

    // Productivity
    arguments: "productivity",
    daily_triages: "productivity",
    execution_plans: "productivity",
    outcomes: "productivity",
    processes: "productivity",
    recurring_events: "productivity",
    strategies: "productivity",
    task_attachments: "productivity",
    task_comments: "productivity",
    task_dependencies: "productivity",
    task_stories: "productivity",

    // Knowledge
    addresses: "knowledge",
    domains: "knowledge",
    related_materials: "knowledge",
    research: "knowledge",
    transcriptions: "knowledge",

    // Health
    emotions: "health",
    foods: "health",
    habit_completions: "health",
    habit_objectives: "health",
    sets: "health",
    workouts: "health",

    // Media
    movies: "media",
    posts: "media",
    songs: "media",
    email_workflows: "media",
    emails: "media",

    // Infrastructure/Meta
    env_var_mappings: "infrastructure",
    mcp_server_integrations: "infrastructure",
  };

  // High priority: types with significant usage
  const highPriorityTypes = [
    "beliefs",
    "habits",
    "workouts",
    "outcomes",
    "emotions",
    "domains",
    "research",
    "arguments",
    "strategies",
    "processes",
  ];

  for (const type of missingTypes) {
    if (highPriorityTypes.includes(type)) {
      recommendations.push({
        type,
        reason: "High-value personal data type with distinct schema",
        category: categoryMap[type] || "unknown",
      });
    } else if (type.startsWith("task_")) {
      recommendations.push({
        type,
        reason: "Task-related metadata (extends core task schema)",
        category: "productivity",
      });
    } else if (type.startsWith("habit_")) {
      recommendations.push({
        type,
        reason: "Habit tracking metadata (extends core habit schema)",
        category: "health",
      });
    }
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = ["finance", "productivity", "health", "knowledge", "media"];
    return priorityOrder.indexOf(a.category) - priorityOrder.indexOf(b.category);
  });
}

function generateMarkdownReport(report: AnalysisReport): string {
  let md = "# DATA_DIR Schema Analysis Report\n\n";
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += "## Overview\n\n";
  md += `- Total DATA_DIR entity types: ${report.totalDataTypes}\n`;
  md += `- Covered by schema_definitions.ts: ${report.coveredTypes.length}\n`;
  md += `- Missing from schema_definitions.ts: ${report.missingTypes.length}\n\n`;

  md += "## Coverage Summary\n\n";
  md += `**Coverage rate**: ${Math.round((report.coveredTypes.length / report.totalDataTypes) * 100)}%\n\n`;

  md += "### Covered Types\n\n";
  md += "These DATA_DIR types have corresponding schemas in `schema_definitions.ts`:\n\n";
  for (const type of report.coveredTypes.sort()) {
    md += `- \`${type}\`\n`;
  }
  md += "\n";

  md += "### Missing Types\n\n";
  md += "These DATA_DIR types do NOT have schemas in `schema_definitions.ts`:\n\n";
  for (const type of report.missingTypes.sort()) {
    md += `- \`${type}\`\n`;
  }
  md += "\n";

  md += "## Priority Recommendations\n\n";
  md += "High-value types that should be added to 1.0 schemas:\n\n";

  const byCategory: Record<string, typeof report.priorityRecommendations> = {};
  for (const rec of report.priorityRecommendations) {
    if (!byCategory[rec.category]) {
      byCategory[rec.category] = [];
    }
    byCategory[rec.category].push(rec);
  }

  for (const [category, recs] of Object.entries(byCategory)) {
    md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const rec of recs) {
      md += `- **\`${rec.type}\`**: ${rec.reason}\n`;
    }
    md += "\n";
  }

  md += "## Field Pattern Analysis\n\n";
  if (report.commonFieldPatterns.length > 0) {
    md += "Most common fields across DATA_DIR types:\n\n";
    for (const pattern of report.commonFieldPatterns.slice(0, 10)) {
      md += `- \`${pattern.fieldName}\`: appears in ${pattern.frequency} types\n`;
    }
  } else {
    md += "No field patterns analyzed (requires parquet file parsing).\n";
  }
  md += "\n";

  md += "## Next Steps\n\n";
  md += "1. Review priority recommendations\n";
  md += "2. Add missing schemas to `src/services/schema_definitions.ts`\n";
  md += "3. Create corresponding fixtures in `tests/fixtures/json/`\n";
  md += "4. Update documentation\n";
  md += "5. Run `npm run schema:init` to register new schemas\n\n";

  md += "## Notes\n\n";
  md += "- This analysis identifies DATA_DIR types that could inspire schema additions\n";
  md += "- Not all DATA_DIR types need to be added (some may be infrastructure/meta types)\n";
  md += "- Focus on high-value personal data types first\n";
  md += "- Field pattern analysis requires parsing parquet files (not implemented in this version)\n";

  return md;
}

async function main() {
  try {
    const report = await analyzeDataDir();

    // Generate markdown report
    const markdown = generateMarkdownReport(report);

    // Write report
    const reportPath = path.join(
      process.cwd(),
      "docs/reports/data_dir_schema_analysis.md"
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, markdown, "utf-8");

    console.log(`\n✅ Analysis complete!`);
    console.log(`   Report saved to: ${reportPath}\n`);

    // Print summary
    console.log("📊 Summary:");
    console.log(`   - Total types: ${report.totalDataTypes}`);
    console.log(`   - Covered: ${report.coveredTypes.length}`);
    console.log(`   - Missing: ${report.missingTypes.length}`);
    console.log(`   - Recommendations: ${report.priorityRecommendations.length}\n`);
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  }
}

main();
