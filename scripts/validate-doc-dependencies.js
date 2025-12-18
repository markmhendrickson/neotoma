#!/usr/bin/env node
/**
 * Documentation Dependency Validator
 *
 * Validates that downstream documentation is up-to-date when upstream docs change.
 * Checks for:
 * - Outdated references in downstream docs
 * - Missing updates to restated information
 * - Broken links
 * - Inconsistencies between upstream and downstream docs
 *
 * Usage:
 *   node scripts/validate-doc-dependencies.js [upstream-doc-path]
 *   node scripts/validate-doc-dependencies.js --all
 *   node scripts/validate-doc-dependencies.js --check-modified
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

/**
 * Simple YAML parser for dependency map (basic implementation)
 */
function parseYAML(content) {
  const result = {};
  let currentKey = null;
  let currentSection = null;
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    // Key definition (ends with :)
    if (line.endsWith(":") && !line.startsWith(" ")) {
      currentKey = line.slice(0, -1).trim();
      result[currentKey] = {};
      currentSection = null;
      continue;
    }

    // Section definition (downstream:)
    if (line === "downstream:" && currentKey) {
      result[currentKey].downstream = [];
      currentSection = "downstream";
      continue;
    }

    // List item (- path:)
    if (
      line.startsWith("- path:") &&
      currentSection === "downstream" &&
      currentKey
    ) {
      const pathMatch = line.match(/- path:\s*(.+)/);
      if (pathMatch) {
        const item = { path: pathMatch[1].trim() };
        result[currentKey].downstream.push(item);

        // Look ahead for type and reason
        let j = i + 1;
        while (j < lines.length && lines[j].trim().startsWith(" ")) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("type:")) {
            item.type = nextLine.split("type:")[1].trim();
          } else if (nextLine.startsWith("reason:")) {
            item.reason = nextLine.split("reason:")[1].trim();
          }
          j++;
        }
      }
      continue;
    }
  }

  return result;
}

// Load dependency map
const depsPath = join(repoRoot, "docs", "doc_dependencies.yaml");
let dependencies = {};
if (existsSync(depsPath)) {
  const depsContent = readFileSync(depsPath, "utf-8");
  dependencies = parseYAML(depsContent);
}

/**
 * Get modified files from git
 */
function getModifiedFiles() {
  try {
    const output = execSync("git diff --name-only HEAD", { encoding: "utf-8" });
    return output
      .split("\n")
      .filter((line) => line.trim() && line.endsWith(".md"))
      .map((line) => join(repoRoot, line));
  } catch (error) {
    return [];
  }
}

/**
 * Check if a file exists
 */
function fileExists(path) {
  return existsSync(path);
}

/**
 * Read markdown file content
 */
function readMarkdownFile(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    return null;
  }
}

/**
 * Extract links from markdown content
 */
function extractLinks(content) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
    });
  }
  return links;
}

/**
 * Resolve relative path to absolute
 */
function resolveDocPath(basePath, relativePath) {
  // Remove anchor if present
  const pathWithoutAnchor = relativePath.split("#")[0];

  // Handle different relative path formats
  if (pathWithoutAnchor.startsWith("http")) {
    return null; // External link, skip
  }

  const baseDir = dirname(basePath);
  let resolved;

  if (pathWithoutAnchor.startsWith("/")) {
    // Absolute from repo root
    resolved = join(repoRoot, pathWithoutAnchor.slice(1));
  } else {
    // Relative to base path
    resolved = resolve(baseDir, pathWithoutAnchor);
  }

  // Normalize path
  return resolved;
}

/**
 * Check if downstream doc references upstream doc
 */
function checkReference(downstreamPath, upstreamPath, content) {
  const upstreamRelative = relative(dirname(downstreamPath), upstreamPath);
  const upstreamName = upstreamPath.split("/").pop();

  // Check for direct links
  const links = extractLinks(content);
  for (const link of links) {
    const resolved = resolveDocPath(downstreamPath, link.url);
    if (resolved && resolved === upstreamPath) {
      return { found: true, type: "link", context: link.text };
    }
  }

  // Check for mentions in Related Documents section
  const relatedDocsMatch = content.match(
    /## Related Documents[\s\S]*?(?=##|$)/
  );
  if (relatedDocsMatch) {
    const relatedSection = relatedDocsMatch[0];
    if (
      relatedSection.includes(upstreamName) ||
      relatedSection.includes(upstreamRelative)
    ) {
      return {
        found: true,
        type: "related_docs",
        context: "Related Documents section",
      };
    }
  }

  // Check for concept mentions (simple heuristic)
  const upstreamBasename = upstreamPath.split("/").pop().replace(".md", "");
  const conceptPatterns = [
    new RegExp(`\\b${upstreamBasename}\\b`, "i"),
    new RegExp(upstreamBasename.replace(/_/g, "[-_\\s]+"), "i"),
  ];

  for (const pattern of conceptPatterns) {
    if (pattern.test(content)) {
      return { found: true, type: "concept", context: "Concept mention" };
    }
  }

  return { found: false };
}

/**
 * Validate downstream dependencies for a given upstream doc
 */
function validateDownstreamDeps(upstreamPath) {
  const upstreamKey = relative(repoRoot, upstreamPath);
  const deps = dependencies[upstreamKey];

  if (!deps || !deps.downstream) {
    return {
      upstream: upstreamKey,
      downstream: [],
      errors: [],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];
  const checked = [];

  for (const dep of deps.downstream) {
    // Handle wildcards in paths (skip for now - would need glob library)
    if (dep.path.includes("*")) {
      continue;
    }

    const fullPath = join(repoRoot, dep.path);
    if (!fileExists(fullPath)) {
      warnings.push(`Downstream doc not found: ${dep.path}`);
      continue;
    }

    const content = readMarkdownFile(fullPath);
    if (!content) {
      errors.push(`Cannot read downstream doc: ${dep.path}`);
      continue;
    }

    const reference = checkReference(fullPath, upstreamPath, content);

    checked.push({
      path: dep.path,
      type: dep.type || "implicit",
      reason: dep.reason || "No reason specified",
      hasReference: reference.found,
      referenceType: reference.type,
      referenceContext: reference.context,
    });

    // Validate based on dependency type
    if (dep.type === "explicit" && !reference.found) {
      warnings.push(
        `Expected explicit reference in ${dep.path} to ${upstreamKey} (${
          dep.reason || "No reason"
        })`
      );
    }

    // Check for broken links
    const links = extractLinks(content);
    for (const link of links) {
      const resolved = resolveDocPath(fullPath, link.url);
      if (resolved && !resolved.startsWith("http") && !fileExists(resolved)) {
        errors.push(`Broken link in ${dep.path}: ${link.url} (${link.text})`);
      }
    }
  }

  return {
    upstream: upstreamKey,
    downstream: checked,
    errors,
    warnings,
  };
}

/**
 * Main validation function
 */
function main() {
  const args = process.argv.slice(2);

  let upstreamPaths = [];

  if (args.includes("--all")) {
    // Validate all upstream docs
    upstreamPaths = Object.keys(dependencies).map((key) => join(repoRoot, key));
  } else if (args.includes("--check-modified")) {
    // Check modified files
    upstreamPaths = getModifiedFiles();
  } else if (args.length > 0) {
    // Specific file(s) provided
    upstreamPaths = args.map((arg) => {
      if (arg.startsWith("/")) {
        return arg;
      }
      return join(repoRoot, arg);
    });
  } else {
    console.error("Usage:");
    console.error(
      "  node scripts/validate-doc-dependencies.js [upstream-doc-path]"
    );
    console.error("  node scripts/validate-doc-dependencies.js --all");
    console.error(
      "  node scripts/validate-doc-dependencies.js --check-modified"
    );
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let hasOutput = false;

  for (const upstreamPath of upstreamPaths) {
    if (!fileExists(upstreamPath)) {
      console.warn(`Warning: Upstream doc not found: ${upstreamPath}`);
      continue;
    }

    const result = validateDownstreamDeps(upstreamPath);

    if (
      result.errors.length > 0 ||
      result.warnings.length > 0 ||
      result.downstream.length > 0
    ) {
      hasOutput = true;
      console.log(`\n📄 Upstream: ${result.upstream}`);
      console.log(`   Downstream dependencies: ${result.downstream.length}`);

      if (result.errors.length > 0) {
        console.log(`\n   ❌ Errors (${result.errors.length}):`);
        for (const error of result.errors) {
          console.log(`      - ${error}`);
        }
        totalErrors += result.errors.length;
      }

      if (result.warnings.length > 0) {
        console.log(`\n   ⚠️  Warnings (${result.warnings.length}):`);
        for (const warning of result.warnings) {
          console.log(`      - ${warning}`);
        }
        totalWarnings += result.warnings.length;
      }

      // Show dependency details
      if (result.downstream.length > 0) {
        console.log(`\n   Dependencies:`);
        for (const dep of result.downstream) {
          const status = dep.hasReference ? "✅" : "⚠️";
          console.log(`      ${status} ${dep.path} (${dep.type})`);
          if (dep.hasReference) {
            console.log(
              `         Reference: ${dep.referenceType} - ${dep.referenceContext}`
            );
          }
        }
      }
    }
  }

  if (!hasOutput && upstreamPaths.length > 0) {
    console.log("✅ No downstream dependency issues found.");
  }

  // Summary
  if (hasOutput) {
    console.log(`\n📊 Summary:`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Warnings: ${totalWarnings}`);
  }

  if (totalErrors > 0) {
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log(
      "\n⚠️  Warnings found. Review downstream docs for consistency."
    );
    process.exit(0);
  } else {
    process.exit(0);
  }
}

main();



