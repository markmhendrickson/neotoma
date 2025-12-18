#!/usr/bin/env node

/**
 * All Feature Units Compliance Validation
 *
 * Scans all release status files for completed Feature Units,
 * runs spec-compliance validation for each, and generates a
 * consolidated markdown summary report.
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateFUSpecCompliance } from "./validate_spec_compliance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RELEASES_DIR = path.join(__dirname, "..", "docs", "releases");
const SUMMARY_REPORT_PATH = path.join(
  RELEASES_DIR,
  "compliance_reports",
  "all_fus_compliance_summary.md",
);

/**
 * Parse a markdown table and return an array of row objects.
 * Assumes the first non-header row is the header row, followed by a separator row,
 * then one or more data rows.
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ rows: Array<Record<string, string>>, nextIndex: number }}
 */
function parseMarkdownTable(lines, startIndex) {
  let i = startIndex;
  // Skip until header row beginning with '|'
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    i++;
  }
  if (i >= lines.length) {
    return { rows: [], nextIndex: i };
  }

  const headerLine = lines[i].trim();
  const separatorLine = lines[i + 1] ? lines[i + 1].trim() : "";
  if (!separatorLine.startsWith("|")) {
    return { rows: [], nextIndex: i };
  }

  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  const rows = [];
  i += 2; // move past header and separator

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|") || /^[-\s|]+$/.test(line.trim())) {
      break;
    }
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length === 0) continue;

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  return { rows, nextIndex: i };
}

/**
 * Extract completed FUs from a single release status markdown file.
 * Uses the "Feature Unit Status" table with a "Status" column and
 * considers any row where Status contains "✅ Complete" as completed.
 *
 * @param {string} releaseId
 * @param {string} statusFilePath
 * @returns {Promise<Array<{ fuId: string, name: string, releaseId: string }>>}
 */
async function extractCompletedFUsFromStatusFile(releaseId, statusFilePath) {
  const content = await fs.readFile(statusFilePath, "utf-8");
  const lines = content.split("\n");

  const completed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/Feature Unit Status/i.test(line)) continue;

    const { rows } = parseMarkdownTable(lines, i + 1);
    if (!rows.length) continue;

    // Heuristically identify FU id and status columns by header labels
    const firstRow = rows[0];
    const headers = Object.keys(firstRow);

    const fuIdHeader =
      headers.find((h) => /^FU ID$/i.test(h)) ??
      headers.find((h) => /Feature Unit/i.test(h)) ??
      headers[0];

    const nameHeader =
      headers.find((h) => /Name/i.test(h)) ??
      headers.find((h) => /Feature Unit/i.test(h)) ??
      headers[1] ??
      fuIdHeader;

    const statusHeader =
      headers.find((h) => /Status/i.test(h)) ?? headers[2] ?? headers[1];

    for (const row of rows) {
      const status = (row[statusHeader] ?? "").toLowerCase();
      if (!status.includes("✅".toLowerCase()) && !status.includes("complete")) {
        continue;
      }

      let fuId = row[fuIdHeader] ?? "";
      fuId = fuId.replace(/`/g, "").trim();

      // Some tables use "Feature Unit" column like "FU-106: ..."; extract FU-xxx prefix
      const fuIdMatch = fuId.match(/(FU-\d{3})/i);
      if (fuIdMatch) {
        fuId = fuIdMatch[1];
      }

      if (!/^FU-\d{3}$/i.test(fuId)) {
        continue;
      }

      const name = (row[nameHeader] ?? "").trim();

      completed.push({
        fuId,
        name,
        releaseId,
      });
    }
  }

  return completed;
}

/**
 * Scan all release status.md files and extract completed FUs.
 * If the same FU appears in multiple releases, prefer the latest
 * (based on semantic version comparison of release IDs).
 *
 * @returns {Promise<Map<string, { fuId: string, name: string, releaseIds: string[] }>>}
 */
async function extractCompletedFUsFromReleases() {
  const entries = await fs.readdir(RELEASES_DIR, { withFileTypes: true });

  const releaseDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name));

  const fuMap = new Map();

  for (const releaseId of releaseDirs) {
    const statusPath = path.join(RELEASES_DIR, releaseId, "status.md");
    try {
      await fs.access(statusPath);
    } catch {
      continue;
    }

    const completed = await extractCompletedFUsFromStatusFile(
      releaseId,
      statusPath,
    );

    for (const fu of completed) {
      const existing = fuMap.get(fu.fuId);
      if (!existing) {
        fuMap.set(fu.fuId, {
          fuId: fu.fuId,
          name: fu.name,
          releaseIds: [releaseId],
        });
        continue;
      }

      // Track all releases, but prefer latest for primary validation
      if (!existing.releaseIds.includes(releaseId)) {
        existing.releaseIds.push(releaseId);
      }
    }
  }

  // Sort releaseIds for each FU so the last one is the latest
  for (const value of fuMap.values()) {
    value.releaseIds.sort(compareReleaseIds);
  }

  return fuMap;
}

/**
 * Compare semantic-ish release IDs like "v0.1.0"
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareReleaseIds(a, b) {
  const parse = (id) => {
    const m = id.match(/^v(\d+)\.(\d+)\.(\d+)$/i);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  };
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

/**
 * Run validation for each FU and aggregate results.
 * @param {Map<string, { fuId: string, name: string, releaseIds: string[] }>} fuMap
 * @returns {Promise<Array<Object>>}
 */
async function runBatchComplianceValidation(fuMap) {
  const results = [];

  for (const fu of fuMap.values()) {
    const primaryReleaseId = fu.releaseIds[fu.releaseIds.length - 1];

    try {
      const validation = await validateFUSpecCompliance(
        fu.fuId,
        primaryReleaseId,
      );

      results.push({
        fuId: fu.fuId,
        name: fu.name,
        primaryReleaseId,
        allReleaseIds: fu.releaseIds,
        totalRequirements: validation.totalRequirements ?? 0,
        passed: validation.passed ?? 0,
        failed: validation.failed ?? 0,
        compliance:
          validation.totalRequirements > 0
            ? (validation.passed / validation.totalRequirements) * 100
            : 100,
        reportPath: validation.reportPath ?? null,
        logPath: validation.logPath ?? null,
        compliant: validation.compliant ?? false,
        validationError: null,
      });
    } catch (error) {
      results.push({
        fuId: fu.fuId,
        name: fu.name,
        primaryReleaseId,
        allReleaseIds: fu.releaseIds,
        totalRequirements: 0,
        passed: 0,
        failed: 0,
        compliance: 0,
        reportPath: null,
        logPath: null,
        compliant: false,
        validationError: error.message ?? String(error),
      });
    }
  }

  return results;
}

/**
 * Generate the consolidated markdown summary report.
 * @param {Array<Object>} results
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function generateSummaryReport(results, outputPath) {
  const totalFUs = results.length;
  const fullyCompliant = results.filter(
    (r) => r.validationError == null && r.failed === 0,
  ).length;
  const withGaps = results.filter(
    (r) => r.validationError == null && r.failed > 0,
  ).length;
  const validationErrors = results.filter((r) => r.validationError != null)
    .length;

  const overallCompliance =
    results.length > 0
      ? (
          results.reduce((sum, r) => sum + (r.compliance ?? 0), 0) /
          results.length
        ).toFixed(1)
      : "0.0";

  const lines = [];

  lines.push("# All Feature Units Compliance Summary");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total FUs Validated:** ${totalFUs}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(`- Overall Compliance Rate: ${overallCompliance}%`);
  lines.push(`- Fully Compliant FUs: ${fullyCompliant}`);
  lines.push(`- FUs with Gaps: ${withGaps}`);
  lines.push(`- Validation Errors: ${validationErrors}`);
  lines.push("");
  lines.push("## Per-FU Compliance Status");
  lines.push("");
  lines.push(
    "| FU ID | Name | Release(s) | Requirements | Passed | Failed | Compliance | Report |",
  );
  lines.push(
    "|-------|------|------------|--------------|--------|--------|------------|--------|",
  );

  for (const r of results.sort((a, b) => a.fuId.localeCompare(b.fuId))) {
    const releases = r.allReleaseIds.join(", ");
    const compliance =
      r.validationError != null
        ? "N/A"
        : `${(r.compliance ?? 0).toFixed(1)}%`;
    const reportLink =
      r.reportPath && r.validationError == null
        ? `[link](${r.reportPath.replace(/^docs\//, "")})`
        : r.validationError
          ? `Validation error`
          : "-";

    lines.push(
      `| ${r.fuId} | ${r.name} | ${releases} | ${r.totalRequirements} | ${r.passed} | ${r.failed} | ${compliance} | ${reportLink} |`,
    );
  }

  lines.push("");
  lines.push("## Top Compliance Issues");
  lines.push("");
  lines.push(
    "Detailed gap aggregation across all FUs is not yet implemented. Refer to individual FU reports for specific gaps.",
  );
  lines.push("");
  lines.push("## Individual Reports");
  lines.push("");

  for (const r of results.sort((a, b) => a.fuId.localeCompare(b.fuId))) {
    if (r.reportPath && r.validationError == null) {
      lines.push(
        `- **${r.fuId}** (${r.primaryReleaseId}): [Compliance Report](${r.reportPath.replace(
          /^docs\//,
          "",
        )})`,
      );
    } else if (r.validationError) {
      lines.push(
        `- **${r.fuId}** (${r.primaryReleaseId}): Validation error — ${r.validationError}`,
      );
    }
  }

  const content = lines.join("\n");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf-8");
}

async function main() {
  console.log("[INFO] Extracting completed Feature Units from releases...");
  const fuMap = await extractCompletedFUsFromReleases();

  if (fuMap.size === 0) {
    console.log("[INFO] No completed Feature Units found in release status files.");
    return;
  }

  console.log(`[INFO] Found ${fuMap.size} unique completed Feature Units.`);

  console.log("[INFO] Running batch compliance validation...");
  const results = await runBatchComplianceValidation(fuMap);

  console.log("[INFO] Generating summary report...");
  await generateSummaryReport(results, SUMMARY_REPORT_PATH);

  console.log("[INFO] All FUs compliance summary generated at:");
  console.log(`  ${SUMMARY_REPORT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[ERROR] Batch FU compliance validation failed:", error);
    process.exit(1);
  });
}

#!/usr/bin/env node

/**
 * Batch FU Compliance Validation Script
 *
 * Validates spec compliance for all completed Feature Units across all releases
 * and generates a consolidated compliance report.
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import globPkg from "glob";
import { validateFUSpecCompliance } from "./validate_spec_compliance.js";

const { glob } = globPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

/**
 * Extract completed FUs from all release status files
 * @returns {Promise<Array>} Array of {fuId, name, releaseId} objects
 */
async function extractCompletedFUsFromReleases() {
  const statusFiles = glob.sync("docs/releases/**/status.md", {
    cwd: rootDir,
    absolute: true,
  });

  const completedFUs = new Map(); // Use Map to deduplicate, keeping latest release

  for (const statusFile of statusFiles) {
    const content = await fs.readFile(statusFile, "utf-8");
    const lines = content.split("\n");

    // Extract release ID from path
    const releaseMatch = statusFile.match(/releases\/(?:in_progress\/)?([^/]+)\//);
    const releaseId = releaseMatch ? releaseMatch[1] : "unknown";

    // Parse FU table entries
    let inFUTable = false;
    for (const line of lines) {
      // Detect start of FU status table
      if (line.includes("| FU ID") && line.includes("| Name") && line.includes("| Status")) {
        inFUTable = true;
        continue;
      }

      // Skip table separator
      if (inFUTable && line.match(/^\|[\s-]+\|/)) {
        continue;
      }

      // Parse FU rows
      if (inFUTable && line.startsWith("|")) {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        
        if (parts.length >= 3) {
          const fuId = parts[0];
          const name = parts[1];
          const status = parts[2];

          // Only include completed FUs
          if (status.includes("✅") || status.toLowerCase().includes("complete")) {
            // Deduplicate - keep latest version (last seen)
            completedFUs.set(fuId, { fuId, name, releaseId });
          }
        }
      }

      // Stop parsing when we hit another section
      if (inFUTable && line.startsWith("##") && !line.includes("Feature Unit")) {
        break;
      }
    }
  }

  return Array.from(completedFUs.values());
}

/**
 * Run batch compliance validation for all FUs
 * @param {Array} fuList - Array of {fuId, name, releaseId} objects
 * @returns {Promise<Array>} Array of validation results
 */
async function runBatchComplianceValidation(fuList) {
  const results = [];

  console.log(`\nValidating ${fuList.length} completed Feature Units...\n`);

  for (const fu of fuList) {
    const { fuId, name, releaseId } = fu;
    
    try {
      console.log(`[${fuId}] Validating...`);
      
      const validationResult = await validateFUSpecCompliance(fuId, releaseId);
      
      results.push({
        fuId,
        name,
        releaseId,
        status: "validated",
        compliant: validationResult.compliant,
        reportPath: validationResult.reportPath,
        gaps: validationResult.gaps,
        totalRequirements: validationResult.totalRequirements || 0,
        passed: validationResult.passed || 0,
        failed: validationResult.failed || 0
      });

      const complianceRate = results[results.length - 1].totalRequirements > 0
        ? ((results[results.length - 1].passed / results[results.length - 1].totalRequirements) * 100).toFixed(1)
        : "0.0";

      console.log(`[${fuId}] ${validationResult.compliant ? "✅" : "⚠️"} ${complianceRate}% compliant\n`);
      
    } catch (error) {
      console.error(`[${fuId}] ❌ Validation error: ${error.message}\n`);
      
      results.push({
        fuId,
        name,
        releaseId,
        status: "error",
        error: error.message,
        compliant: false,
        reportPath: null,
        gaps: [],
        totalRequirements: 0,
        passed: 0,
        failed: 0
      });
    }
  }

  return results;
}

/**
 * Analyze common gaps across all FUs
 * @param {Array} results - Array of validation results
 * @returns {Array} Array of {gap, count, fus} objects
 */
function analyzeCommonGaps(results) {
  const gapCounts = new Map();

  for (const result of results) {
    if (result.status === "validated" && result.gaps.length > 0) {
      for (const gap of result.gaps) {
        const gapText = gap.requirement || gap.text || "Unknown requirement";
        const key = gapText.substring(0, 100); // Normalize to first 100 chars
        
        if (!gapCounts.has(key)) {
          gapCounts.set(key, { gap: gapText, count: 0, fus: [] });
        }
        
        const entry = gapCounts.get(key);
        entry.count++;
        entry.fus.push(result.fuId);
      }
    }
  }

  // Sort by count descending, return top 10
  return Array.from(gapCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Generate summary compliance report
 * @param {Array} results - Array of validation results
 * @param {string} outputPath - Path to write the report
 * @returns {Promise<string>} Path to created report
 */
async function generateSummaryReport(results, outputPath) {
  const validated = results.filter((r) => r.status === "validated");
  const errors = results.filter((r) => r.status === "error");
  const fullyCompliant = validated.filter((r) => r.compliant);
  const withGaps = validated.filter((r) => !r.compliant);

  const totalRequirements = validated.reduce((sum, r) => sum + r.totalRequirements, 0);
  const totalPassed = validated.reduce((sum, r) => sum + r.passed, 0);
  const overallCompliance = totalRequirements > 0
    ? ((totalPassed / totalRequirements) * 100).toFixed(1)
    : "0.0";

  const commonGaps = analyzeCommonGaps(results);

  const reportContent = `# All Feature Units Compliance Summary

**Generated:** ${new Date().toISOString()}  
**Total FUs Validated:** ${results.length}

---

## Executive Summary

- **Overall Compliance Rate:** ${overallCompliance}%
- **Total Requirements Checked:** ${totalRequirements}
- **Total Passed:** ${totalPassed}
- **Total Failed:** ${totalRequirements - totalPassed}
- **Fully Compliant FUs:** ${fullyCompliant.length} (${validated.length > 0 ? ((fullyCompliant.length / validated.length) * 100).toFixed(1) : 0}%)
- **FUs with Gaps:** ${withGaps.length}
- **Validation Errors:** ${errors.length}

---

## Per-FU Compliance Status

| FU ID | Name | Release | Requirements | Passed | Failed | Compliance | Status | Report |
|-------|------|---------|--------------|--------|--------|------------|--------|--------|
${results
  .sort((a, b) => {
    // Sort by FU ID numerically
    const aNum = parseInt(a.fuId.replace("FU-", ""));
    const bNum = parseInt(b.fuId.replace("FU-", ""));
    return aNum - bNum;
  })
  .map((r) => {
    const compliance = r.totalRequirements > 0 
      ? ((r.passed / r.totalRequirements) * 100).toFixed(1) + "%" 
      : "N/A";
    const statusIcon = r.status === "error" 
      ? "❌ Error" 
      : r.compliant 
        ? "✅ Pass" 
        : "⚠️ Gaps";
    const reportLink = r.reportPath 
      ? `[View](${r.reportPath.replace(rootDir + "/", "")})` 
      : "-";
    const nameTrunc = r.name.length > 35 ? r.name.substring(0, 32) + "..." : r.name;
    
    return `| ${r.fuId} | ${nameTrunc} | ${r.releaseId} | ${r.totalRequirements} | ${r.passed} | ${r.failed} | ${compliance} | ${statusIcon} | ${reportLink} |`;
  })
  .join("\n")}

---

## Top Compliance Issues

${commonGaps.length > 0 
  ? commonGaps.map((gap, index) => {
    const gapText = gap.gap.length > 100 ? gap.gap.substring(0, 97) + "..." : gap.gap;
    return `${index + 1}. **${gapText}**
   - Occurrences: ${gap.count} FU(s)
   - Affected: ${gap.fus.join(", ")}`;
  }).join("\n\n")
  : "_No common gaps identified across FUs._"}

---

## Validation Errors

${errors.length > 0
  ? errors.map((err) => `- **${err.fuId}** (${err.name}): ${err.error}`).join("\n")
  : "_No validation errors._"}

---

## Individual Reports

${validated
  .filter((r) => r.reportPath)
  .map((r) => `- [${r.fuId} — ${r.name}](${r.reportPath.replace(rootDir + "/", "")})`)
  .join("\n")}

---

## Recommendations

${withGaps.length > 0 
  ? `**${withGaps.length} Feature Unit(s) have specification compliance gaps** that should be addressed to ensure implementation matches documented requirements.

### Priority Actions:
1. Review individual compliance reports for FUs with gaps
2. Address common issues appearing across multiple FUs
3. Update implementation to match specification requirements
4. Re-run validation after fixes

### Most Common Issues:
${commonGaps.slice(0, 3).map((gap, i) => `${i + 1}. ${gap.gap.substring(0, 80)}... (${gap.count} FUs affected)`).join("\n")}
`
  : `**All validated Feature Units are compliant** with their specifications. No gaps identified.`}

---

**Note:** This report validates that code implementation matches documented specifications. It does not validate functional correctness or test coverage.
`;

  // Ensure directory exists
  const reportDir = path.dirname(outputPath);
  await fs.mkdir(reportDir, { recursive: true });

  await fs.writeFile(outputPath, reportContent, "utf-8");
  return outputPath;
}

/**
 * Main execution
 */
async function main() {
  console.log("=== Batch FU Compliance Validation ===\n");

  // Extract completed FUs from all releases
  console.log("Scanning release status files...");
  const completedFUs = await extractCompletedFUsFromReleases();
  console.log(`Found ${completedFUs.length} completed Feature Units across all releases.\n`);

  // Run batch validation
  const results = await runBatchComplianceValidation(completedFUs);

  // Generate summary report
  const outputPath = path.join(
    rootDir,
    "docs/releases/compliance_reports/all_fus_compliance_summary.md"
  );
  console.log("\nGenerating summary report...");
  const reportPath = await generateSummaryReport(results, outputPath);

  // Print summary
  const validated = results.filter((r) => r.status === "validated");
  const fullyCompliant = validated.filter((r) => r.compliant);
  const withGaps = validated.filter((r) => !r.compliant);
  const errors = results.filter((r) => r.status === "error");

  console.log("\n=== Validation Complete ===\n");
  console.log(`Total FUs: ${results.length}`);
  console.log(`✅ Fully Compliant: ${fullyCompliant.length}`);
  console.log(`⚠️  With Gaps: ${withGaps.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`\nReport: ${reportPath.replace(rootDir + "/", "")}\n`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { extractCompletedFUsFromReleases, runBatchComplianceValidation, generateSummaryReport };

