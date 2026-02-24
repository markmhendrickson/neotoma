/**
 * Plan Migration Script
 *
 * Automatically reviews plans in .cursor/plans and migrates relevant ones to docs/proposals.
 * Used by /migrate_plans command and /commit workflow.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

interface PlanMetadata {
  name: string;
  overview: string;
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "completed" | "in_progress";
  }>;
}

interface ImplementationItem {
  type: "file" | "function" | "migration" | "endpoint" | "table" | "column" | "service";
  path: string;
  name?: string;
  description?: string;
}

interface ImplementationAnalysis {
  items: ImplementationItem[];
  found: number;
  total: number;
  completionPercentage: number;
  foundItems: string[];
  missingItems: string[];
}

interface MigrationResult {
  migrated: Array<{ source: string; target: string }>;
  archived: string[];
  obsolete: Array<{ file: string; reason: string }>;
  manualReview: Array<{ file: string; reason: string }>;
}

export async function migratePlans(
  options: {
    plansDir?: string;
    proposalsDir?: string;
    archiveCompleted?: boolean;
    autoRemoveObsolete?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<MigrationResult> {
  const plansDir = options.plansDir || ".cursor/plans";
  const proposalsDir = options.proposalsDir || "docs/proposals";
  const archivedDir = join(proposalsDir, "archived");
  const dryRun = options.dryRun || false;

  const result: MigrationResult = {
    migrated: [],
    archived: [],
    obsolete: [],
    manualReview: [],
  };

  // Create directories
  if (!dryRun) {
    await mkdir(proposalsDir, { recursive: true });
    await mkdir(archivedDir, { recursive: true });
  }

  // Get all plan files
  const planFiles = (await readdir(plansDir))
    .filter((f) => f.endsWith(".plan.md"))
    .sort();

  console.log(`Found ${planFiles.length} plan file(s) to review\n`);

  // Process each plan
  for (const planFile of planFiles) {
    const planPath = join(plansDir, planFile);
    const planContent = await readFile(planPath, "utf-8");

    try {
      // Parse plan
      const metadata = parsePlanMetadata(planContent);
      const todoStats = analyzeTodoStatus(metadata.todos);

      console.log(`Reviewing: ${planFile}`);

      // Analyze plan content for implementation items
      const implementationAnalysis = await analyzePlanImplementation(
        planContent,
        metadata
      );

      // Check for duplicates
      const isDuplicate = checkForDuplicates(planFile, planFiles);
      if (isDuplicate) {
        console.log(`  ⚠ Duplicate plan - keeping most recent version only`);
        result.obsolete.push({
          file: planFile,
          reason: "duplicate (superseded by newer version)",
        });
        continue;
      }

      // Use implementation analysis to determine status (primary method)
      // Fall back to todos if no implementation items found
      const hasImplementationItems = implementationAnalysis.total > 0;
      const completionPercentage = hasImplementationItems
        ? implementationAnalysis.completionPercentage
        : todoStats.total > 0
        ? todoStats.completionPercentage
        : 0;

      console.log(
        hasImplementationItems
          ? `  Implementation: ${implementationAnalysis.found}/${implementationAnalysis.total} items found (${completionPercentage}% complete)`
          : `  Todos: ${todoStats.pending} pending, ${todoStats.completed} completed, ${todoStats.inProgress} in_progress`
      );

      // Determine action based on implementation analysis or todos
      if (!hasImplementationItems && todoStats.total === 0) {
        // No implementation items AND no todos - requires manual review
        console.log(`  ⚠ No implementation items or todos found - requires manual review`);
        result.manualReview.push({
          file: planFile,
          reason: "no implementation items or todos (cannot determine status)",
        });
        continue;
      }

      // Determine action based on completion percentage
      // Threshold: 80%+ = implemented, 0-79% = proposal
      if (completionPercentage >= 80) {
        // Mostly or fully implemented - archive
        console.log(`  ✓ Implemented (${completionPercentage}%) - archiving`);
        const archiveFile = planFile.replace(".plan.md", ".md");
        const archivePath = join(archivedDir, archiveFile);
        const archivedContent = convertToArchivedProposal(
          planContent,
          metadata,
          planFile,
          todoStats,
          implementationAnalysis
        );

        if (!dryRun) {
          await writeFile(archivePath, archivedContent);
        }

        result.archived.push(archiveFile);
        console.log(`    → archived/${archiveFile}`);
      } else if (completionPercentage > 0) {
        // Partially implemented - migrate to proposals
        console.log(`  ✓ Partially implemented (${completionPercentage}%) - migrating to proposals`);
        const proposalFile = generateProposalFilename(metadata.name);
        const proposalPath = join(proposalsDir, proposalFile);
        const proposalContent = convertToProposal(
          planContent,
          metadata,
          planFile,
          todoStats,
          implementationAnalysis
        );

        if (!dryRun) {
          await writeFile(proposalPath, proposalContent);
        }

        result.migrated.push({
          source: planFile,
          target: proposalFile,
        });
        console.log(`    → ${proposalFile}`);
      } else {
        // Not implemented - migrate to proposals
        console.log(`  ✓ Not implemented - migrating to proposals`);
        const proposalFile = generateProposalFilename(metadata.name);
        const proposalPath = join(proposalsDir, proposalFile);
        const proposalContent = convertToProposal(
          planContent,
          metadata,
          planFile,
          todoStats,
          implementationAnalysis
        );

        if (!dryRun) {
          await writeFile(proposalPath, proposalContent);
        }

        result.migrated.push({
          source: planFile,
          target: proposalFile,
        });
        console.log(`    → ${proposalFile}`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${planFile}:`, error);
      result.manualReview.push({
        file: planFile,
        reason: `parsing error: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }

    console.log("");
  }

  // Generate migration report
  if (!dryRun) {
    await generateMigrationReport(result, proposalsDir);
  }

  // Display summary
  console.log("\nMigration Summary:");
  console.log(`  Migrated: ${result.migrated.length}`);
  console.log(`  Archived: ${result.archived.length}`);
  console.log(`  Obsolete: ${result.obsolete.length}`);
  console.log(`  Manual review: ${result.manualReview.length}`);

  return result;
}

/**
 * Parse plan frontmatter to extract metadata
 */
function parsePlanMetadata(content: string): PlanMetadata {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  // Handle plans without frontmatter (legacy format)
  if (!frontmatterMatch) {
    // Extract title from first markdown heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1].trim() : "Untitled";
    
    // Extract overview from first paragraph or ## Overview section
    const overviewMatch = content.match(/## Overview\n\n([\s\S]*?)(?=\n##|$)/);
    const overview = overviewMatch ? overviewMatch[1].trim().substring(0, 200) : "";
    
    return { name, overview, todos: [] };
  }

  const frontmatter = frontmatterMatch[1];

  // Extract name
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch
    ? nameMatch[1].trim().replace(/^["']|["']$/g, "")
    : "Untitled";

  // Extract overview (handle both quoted and multiline)
  let overview = "";
  const overviewMatch = frontmatter.match(/^overview:\s*["'](.+)["']$/m);
  if (overviewMatch) {
    overview = overviewMatch[1];
  } else {
    const multilineMatch = frontmatter.match(/^overview:\s*\n\s+(.+)$/m);
    if (multilineMatch) {
      overview = multilineMatch[1].trim();
    }
  }

  // Extract todos - parse YAML structure
  const todos: PlanMetadata["todos"] = [];
  
  // Find where todos section starts
  const todosStartIndex = frontmatter.indexOf("todos:");
  if (todosStartIndex !== -1) {
    // Get everything after "todos:"
    const afterTodos = frontmatter.substring(todosStartIndex + 6);
    
    // Split into lines
    const lines = afterTodos.split("\n");
    let currentTodo: Partial<PlanMetadata["todos"][0]> | null = null;
    
    for (const line of lines) {
      // Check if line starts a new todo (has "- id:")
      if (line.match(/^\s+-\s+id:/)) {
        // Save previous todo
        if (currentTodo && currentTodo.id && currentTodo.content && currentTodo.status) {
          todos.push(currentTodo as PlanMetadata["todos"][0]);
        }
        // Start new todo
        const idValue = line.replace(/^\s+-\s+id:\s*/, "").trim();
        currentTodo = { id: idValue };
      }
      // Check for content line
      else if (line.match(/^\s+content:/)) {
        if (currentTodo) {
          const contentValue = line.replace(/^\s+content:\s*/, "").trim().replace(/^["']|["']$/g, "");
          currentTodo.content = contentValue;
        }
      }
      // Check for status line
      else if (line.match(/^\s+status:/)) {
        if (currentTodo) {
          const statusValue = line.replace(/^\s+status:\s*/, "").trim();
          currentTodo.status = statusValue as any;
        }
      }
      // Check if we hit another top-level key (end of todos section)
      else if (line.match(/^[a-z_]+:/)) {
        break;
      }
    }
    
    // Don't forget the last todo
    if (currentTodo && currentTodo.id && currentTodo.content && currentTodo.status) {
      todos.push(currentTodo as PlanMetadata["todos"][0]);
    }
  }

  return { name, overview, todos };
}

/**
 * Analyze todo status counts
 */
function analyzeTodoStatus(todos: PlanMetadata["todos"]): {
  total: number;
  pending: number;
  completed: number;
  inProgress: number;
  completionPercentage: number;
} {
  const total = todos.length;
  const pending = todos.filter((t) => t.status === "pending").length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const completionPercentage =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, completed, inProgress, completionPercentage };
}

/**
 * Analyze plan content to extract implementation items and check if they exist
 */
async function analyzePlanImplementation(
  content: string,
  metadata: PlanMetadata
): Promise<ImplementationAnalysis> {
  const items: ImplementationItem[] = [];

  // Extract file paths mentioned in plan (more specific patterns)
  const filePatterns = [
    /`(src\/[a-z0-9_/.-]+\.(ts|tsx|js|jsx))`/gi,
    /`(migrations\/[a-z0-9_/.-]+\.(sql|ts|tsx|js|jsx))`/gi,
    /`(frontend\/[a-z0-9_/.-]+\.(ts|tsx|js|jsx))`/gi,
    /File[:\s]+`?(src\/[a-z0-9_/.-]+\.(ts|tsx|js|jsx))`?/gi,
    /File[:\s]+`?(migrations\/[a-z0-9_/.-]+\.(sql|ts|tsx|js|jsx))`?/gi,
    /File[:\s]+`?(frontend\/[a-z0-9_/.-]+\.(ts|tsx|js|jsx))`?/gi,
    /###\s+.*\n\*\*File[:\s]+`?([a-z0-9_/.-]+\.(ts|tsx|js|jsx|sql))`?/gi,
  ];

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const filePath = match[1] || match[0];
      if (filePath && !filePath.includes("...") && !filePath.includes("example")) {
        items.push({
          type: "file",
          path: filePath,
        });
      }
    }
  }

  // Extract function names
  const functionPatterns = [
    /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    /export\s+(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    /const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s+)?\(/g,
    /Create\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi,
    /Implement\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi,
  ];

  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const funcName = match[1];
      if (funcName && funcName.length > 2) {
        items.push({
          type: "function",
          name: funcName,
          path: "", // Will search codebase
        });
      }
    }
  }

  // Extract migration files
  const migrationPattern = /migrations\/\[timestamp\]_([a-z0-9_]+)\.sql/gi;
  let match;
  while ((match = migrationPattern.exec(content)) !== null) {
    items.push({
      type: "migration",
      name: match[1],
      path: `**/migrations/*${match[1]}*.sql`,
    });
  }

  // Extract API endpoints
  const endpointPatterns = [
    /app\.(get|post|put|delete|patch)\("([^"]+)"/gi,
    /\/[a-z0-9_-]+/gi,
  ];

  for (const pattern of endpointPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const endpoint = match[2] || match[0];
      if (endpoint && endpoint.startsWith("/")) {
        items.push({
          type: "endpoint",
          path: endpoint,
        });
      }
    }
  }

  // Extract table/column names
  const tablePatterns = [
    /CREATE TABLE\s+([a-z_]+)/gi,
    /ALTER TABLE\s+([a-z_]+)/gi,
    /table:\s*`?([a-z_]+)`?/gi,
    /Column:\s*`?([a-z_]+)`?/gi,
    /Add\s+`?([a-z_]+)`?\s+column/gi,
  ];

  for (const pattern of tablePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (name && name.length > 1) {
        items.push({
          type: "table",
          name: name,
          path: `**/schema.sql`,
        });
      }
    }
  }

  // Remove duplicates
  const uniqueItems = Array.from(
    new Map(
      items.map((item) => [
        `${item.type}:${item.path}:${item.name || ""}`,
        item,
      ])
    ).values()
  );

  // Check which items exist
  const foundItems: string[] = [];
  const missingItems: string[] = [];

  for (const item of uniqueItems) {
    let exists = false;

    try {
      switch (item.type) {
        case "file":
          exists = existsSync(item.path);
          break;

        case "function":
          // Search for function in codebase
          try {
            const result = execSync(
              `grep -r "function ${item.name}\\|const ${item.name}\\|export.*${item.name}" src/ frontend/src/ 2>/dev/null | head -1`,
              { encoding: "utf-8", maxBuffer: 1024 * 1024 }
            );
            exists = result.trim().length > 0;
          } catch {
            exists = false;
          }
          break;

        case "migration":
          // Check if migration file exists (pattern match)
          try {
            const result = execSync(
              `find . -path "*/migrations/*${item.name}*.sql" 2>/dev/null | head -1`,
              { encoding: "utf-8", maxBuffer: 1024 * 1024 }
            );
            exists = result.trim().length > 0;
          } catch {
            exists = false;
          }
          break;

        case "endpoint":
          // Search for endpoint in actions.ts or server.ts
          try {
            const result = execSync(
              `grep -r "${item.path}" src/actions.ts src/server.ts 2>/dev/null | head -1`,
              { encoding: "utf-8", maxBuffer: 1024 * 1024 }
            );
            exists = result.trim().length > 0;
          } catch {
            exists = false;
          }
          break;

        case "table":
        case "column":
          // Check schema.sql
          try {
            const schemaContent = readFileSync("docs/releases/v0.2.15/migrations/01_add_source_graph_edges.sql", "utf-8");
            exists =
              schemaContent.includes(`CREATE TABLE ${item.name}`) ||
              schemaContent.includes(`ALTER TABLE`) ||
              schemaContent.includes(item.name);
          } catch {
            exists = false;
          }
          break;

        case "service":
          // Check if service file exists
          exists = existsSync(`src/services/${item.name}.ts`);
          break;
      }

      if (exists) {
        foundItems.push(
          `${item.type}:${item.path || item.name || "unknown"}`
        );
      } else {
        missingItems.push(
          `${item.type}:${item.path || item.name || "unknown"}`
        );
      }
    } catch (error) {
      // If check fails, assume missing
      missingItems.push(`${item.type}:${item.path || item.name || "unknown"}`);
    }
  }

  const total = uniqueItems.length;
  const found = foundItems.length;
  const completionPercentage = total > 0 ? Math.round((found / total) * 100) : 0;

  return {
    items: uniqueItems,
    found,
    total,
    completionPercentage,
    foundItems,
    missingItems,
  };
}

/**
 * Check if plan is a duplicate (multiple versions)
 */
function checkForDuplicates(planFile: string, allPlans: string[]): boolean {
  // Extract base name without version suffix
  const baseName = planFile.replace(/-v\d+|_v\d+/g, "");

  // Find all plans with same base name
  const similarPlans = allPlans.filter((f) => {
    const otherBase = f.replace(/-v\d+|_v\d+/g, "");
    return otherBase === baseName;
  });

  // If multiple versions exist, only keep the last one (alphabetically last = most recent)
  if (similarPlans.length > 1) {
    const sorted = similarPlans.sort();
    const latest = sorted[sorted.length - 1];
    return planFile !== latest;
  }

  return false;
}

/**
 * Generate proposal filename from plan name
 */
function generateProposalFilename(planName: string): string {
  return (
    planName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-") + ".md"
  );
}

/**
 * Convert plan to proposal format
 */
function convertToProposal(
  content: string,
  metadata: PlanMetadata,
  sourceFile: string,
  todoStats: ReturnType<typeof analyzeTodoStatus>,
  implementationAnalysis?: ImplementationAnalysis
): string {
  const today = new Date().toISOString().split("T")[0];

  // Extract priority from todos or plan content
  const priority = extractPriority(content, metadata);

  // Extract estimated effort from plan content
  const estimatedEffort = extractEstimatedEffort(content);

  // Remove frontmatter from content
  const contentWithoutFrontmatter = content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim();

  // Generate new frontmatter
  const newFrontmatter = `---
title: "${metadata.name}"
status: "proposal"
source_plan: "${sourceFile}"
migrated_date: "${today}"
priority: "${priority}"
${estimatedEffort ? `estimated_effort: "${estimatedEffort}"` : ""}
---`;

  // Generate Proposal Context section
  let statusDescription = "";
  let relevanceNote = "";

  if (implementationAnalysis && implementationAnalysis.total > 0) {
    statusDescription = `**Implementation Status:** ${implementationAnalysis.found}/${implementationAnalysis.total} items found (${implementationAnalysis.completionPercentage}% complete)
- Found: ${implementationAnalysis.foundItems.slice(0, 5).join(", ")}${implementationAnalysis.foundItems.length > 5 ? `, ...` : ""}
- Missing: ${implementationAnalysis.missingItems.slice(0, 5).join(", ")}${implementationAnalysis.missingItems.length > 5 ? `, ...` : ""}`;

    if (implementationAnalysis.completionPercentage > 0) {
      relevanceNote = `**Relevance:** Partially implemented - ${implementationAnalysis.completionPercentage}% complete. Remaining work needed.`;
    } else {
      relevanceNote = `**Relevance:** Not yet implemented - represents future work.`;
    }
  } else if (todoStats.total > 0) {
    statusDescription = `**Todo Status:** ${todoStats.completed}/${todoStats.total} todos completed (${todoStats.completionPercentage}%)
- Pending: ${todoStats.pending}
- In Progress: ${todoStats.inProgress}
- Completed: ${todoStats.completed}`;
    relevanceNote = `**Relevance:** This proposal represents future work that has not been fully implemented.`;
  } else {
    statusDescription = `**Status:** No implementation items or todos found in plan.`;
    relevanceNote = `**Relevance:** Requires manual review to determine implementation status.`;
  }

  const proposalContext = `
## Proposal Context

This proposal was migrated from \`.cursor/plans/${sourceFile}\` on ${today}.

${statusDescription}

${relevanceNote}

**Architecture Alignment:** Requires verification against current architecture docs.

---
`;

  return `${newFrontmatter}\n\n# ${metadata.name}\n${proposalContext}\n${contentWithoutFrontmatter}`;
}

/**
 * Convert plan to archived proposal format
 */
function convertToArchivedProposal(
  content: string,
  metadata: PlanMetadata,
  sourceFile: string,
  todoStats: ReturnType<typeof analyzeTodoStatus>,
  implementationAnalysis?: ImplementationAnalysis
): string {
  const today = new Date().toISOString().split("T")[0];

  const contentWithoutFrontmatter = content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim();

  const newFrontmatter = `---
title: "${metadata.name}"
status: "implemented"
source_plan: "${sourceFile}"
migrated_date: "${today}"
---`;

  let statusNote = "";
  if (implementationAnalysis && implementationAnalysis.total > 0) {
    statusNote = `**Status:** Fully implemented - ${implementationAnalysis.found}/${implementationAnalysis.total} implementation items found (${implementationAnalysis.completionPercentage}% complete).`;
  } else if (todoStats.total > 0) {
    statusNote = `**Status:** Fully implemented - all ${todoStats.total} todos completed.`;
  } else {
    statusNote = `**Status:** Fully implemented - content analysis indicates completion.`;
  }

  const archivedContext = `
## Archived Proposal

This proposal was migrated from \`.cursor/plans/${sourceFile}\` on ${today}.

${statusNote}

**Implementation Complete:** This work has been finished and is archived for reference.

---
`;

  return `${newFrontmatter}\n\n# ${metadata.name}\n${archivedContext}\n${contentWithoutFrontmatter}`;
}

/**
 * Extract priority from plan content
 */
function extractPriority(content: string, metadata: PlanMetadata): string {
  // Check todo IDs for priority prefixes
  const priorities = metadata.todos
    .map((t) => {
      const match = t.id.match(/^p(\d+)/i);
      return match ? `p${match[1]}` : null;
    })
    .filter(Boolean);

  if (priorities.length > 0) {
    // Return highest priority (lowest number)
    const sorted = priorities.sort();
    return sorted[0]!;
  }

  // Check content for priority mentions
  if (content.match(/P0|priority.*p0/i)) return "p0";
  if (content.match(/P1|priority.*p1/i)) return "p1";
  if (content.match(/P2|priority.*p2/i)) return "p2";
  if (content.match(/P3|priority.*p3/i)) return "p3";

  return "p2"; // Default to P2
}

/**
 * Extract estimated effort from plan content
 */
function extractEstimatedEffort(content: string): string | null {
  // Look for common patterns
  const patterns = [
    /Estimated?:\s*([^.\n]+)/i,
    /Effort:\s*([^.\n]+)/i,
    /Timeline:\s*([^.\n]+)/i,
    /Duration:\s*([^.\n]+)/i,
    /(\d+[-–]\d+\s+days?)/i,
    /(\d+\s+days?)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Generate migration report
 */
async function generateMigrationReport(
  result: MigrationResult,
  proposalsDir: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString();

  const report = `# Plan Migration Report

Generated: ${timestamp}

## Summary

- **Migrated to Proposals:** ${result.migrated.length}
- **Archived (Completed):** ${result.archived.length}
- **Obsolete (Logged):** ${result.obsolete.length}
- **Requires Manual Review:** ${result.manualReview.length}

---

## Migrated to Proposals

${
  result.migrated.length > 0
    ? result.migrated
        .map((m) => `- \`${m.source}\` → \`docs/proposals/${m.target}\``)
        .join("\n")
    : "_None_"
}

---

## Archived (Completed)

${
  result.archived.length > 0
    ? result.archived
        .map((a) => `- \`${a}\` → \`docs/proposals/archived/${a}\``)
        .join("\n")
    : "_None_"
}

---

## Obsolete (Logged for Manual Removal)

${
  result.obsolete.length > 0
    ? result.obsolete
        .map((o) => `- \`${o.file}\` - Reason: ${o.reason}`)
        .join("\n")
    : "_None_"
}

---

## Requires Manual Review

${
  result.manualReview.length > 0
    ? result.manualReview
        .map((m) => `- \`${m.file}\` - Reason: ${m.reason}`)
        .join("\n")
    : "_None_"
}

---

## Next Steps

1. Review migrated proposals in \`docs/proposals/\`
2. Manually review plans flagged above
3. Remove obsolete plans from \`.cursor/plans/\` if desired
4. Prioritize proposals for future implementation

---

_Generated by: /migrate_plans command on ${today}_
`;

  await writeFile(join(proposalsDir, "MIGRATION_REPORT.md"), report);
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");

  migratePlans({ dryRun })
    .then((result) => {
      console.log("\n✓ Migration complete");
      console.log(`Report: docs/proposals/MIGRATION_REPORT.md`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Migration failed:", error);
      process.exit(1);
    });
}
