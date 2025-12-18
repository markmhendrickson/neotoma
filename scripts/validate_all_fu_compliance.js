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

