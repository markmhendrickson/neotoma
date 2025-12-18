#!/usr/bin/env node

/**
 * Spec Compliance Validation Script
 *
 * Validates that Feature Unit implementations match their specification requirements.
 * Extracts requirements from specs, logs implementation decisions, runs compliance checks,
 * and generates compliance reports.
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  checkFunctionExists,
  checkDatabaseColumn,
  checkDatabaseTable,
  checkImportExists,
  checkServiceCall,
  checkValidationLogic,
  checkPatternExists,
} from "./spec_compliance_patterns.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract requirements from spec file
 * @param {string} specPath - Path to spec markdown file
 * @returns {Promise<Array<{text: string, section: string, lineNumber: number, type: string, category: string}>>}
 */
export async function extractRequirements(specPath) {
  const content = await fs.readFile(specPath, "utf-8");
  const lines = content.split("\n");
  const requirements = [];

  let currentSection = "Unknown";
  let sectionStack = [];

  // Track heading levels for nested sections
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  // Pattern to match requirement statements
  // First, check if we're in a MUST/MUST NOT section
  let inMustSection = false;
  let inMustNotSection = false;

  const requirementPatterns = [
    /^\s*\*\*MUST:\*\*\s*$/i, // Section header
    /^\s*\*\*MUST\s+NOT:\*\*\s*$/i, // Section header
    /^\s*-\s*\*\*MUST:\*\*\s*(.+)$/i,
    /^\s*-\s*\*\*MUST\s+NOT:\*\*\s*(.+)$/i,
    /^\s*-\s*\*\*SHALL:\*\*\s*(.+)$/i,
    /^\s*-\s*\*\*REQUIRED:\*\*\s*(.+)$/i,
    /^\s*-\s*\*\*MUST\s+IMPLEMENT:\*\*\s*(.+)$/i,
    /^\s*MUST\s+NOT\s+(.+)$/i,
    /^\s*MUST\s+(.+)$/i,
    /^\s*SHALL\s+NOT\s+(.+)$/i,
    /^\s*SHALL\s+(.+)$/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track section headings
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Update section stack based on heading level
      while (sectionStack.length >= level) {
        sectionStack.pop();
      }
      sectionStack.push(title);
      currentSection = sectionStack.join(" > ");

      // Reset section flags when we hit a new heading
      inMustSection = false;
      inMustNotSection = false;
    }

    // Check if we're entering a MUST or MUST NOT section
    if (/^\s*\*\*MUST:\*\*\s*$/i.test(line)) {
      inMustSection = true;
      inMustNotSection = false;
      continue;
    }
    if (/^\s*\*\*MUST\s+NOT:\*\*\s*$/i.test(line)) {
      inMustSection = false;
      inMustNotSection = true;
      continue;
    }

    // Check for requirement statements
    // If we're in a MUST section and this is a list item, treat it as a requirement
    if ((inMustSection || inMustNotSection) && /^\s*-\s+.+$/.test(line)) {
      const listItemMatch = line.match(/^\s*-\s+(.+)$/);
      if (listItemMatch) {
        const requirementText = listItemMatch[1].trim();

        // Skip if it's just a section header
        if (requirementText.match(/^\*\*(MUST|SHALL|REQUIRED)/i)) {
          continue;
        }

        let type = inMustNotSection ? "must_not" : "must";
        let category = "implementation";

        // Determine category based on context
        const lowerText = requirementText.toLowerCase();
        if (
          lowerText.includes("database") ||
          lowerText.includes("table") ||
          lowerText.includes("column") ||
          lowerText.includes("migration")
        ) {
          category = "database";
        } else if (
          lowerText.includes("validate") ||
          lowerText.includes("validation") ||
          lowerText.includes("check")
        ) {
          category = "validation";
        } else if (
          lowerText.includes("test") ||
          lowerText.includes("testing")
        ) {
          category = "testing";
        } else if (
          lowerText.includes("import") ||
          lowerText.includes("call") ||
          lowerText.includes("service")
        ) {
          category = "integration";
        }

        // Skip if it's too short or just formatting
        if (
          !requirementText ||
          requirementText.length < 5 ||
          requirementText.match(/^[*_`]+$/)
        ) {
          continue;
        }

        requirements.push({
          text: requirementText,
          section: currentSection,
          lineNumber,
          type,
          category,
        });
        continue; // Skip to next line, don't check other patterns
      }
    }

    // Also check explicit requirement patterns (for formats like "- **MUST:** requirement text")
    for (const pattern of requirementPatterns.slice(2)) {
      // Skip section header patterns (first 2)
      const match = line.match(pattern);
      if (match && match[1]) {
        let type = "must";
        let category = "implementation";

        // Determine type
        if (line.includes("MUST NOT") || line.includes("SHALL NOT")) {
          type = "must_not";
        } else if (line.includes("SHALL")) {
          type = "shall";
        } else if (line.includes("REQUIRED")) {
          type = "required";
        }

        // Determine category based on context
        const lowerLine = line.toLowerCase();
        if (
          lowerLine.includes("database") ||
          lowerLine.includes("table") ||
          lowerLine.includes("column") ||
          lowerLine.includes("migration")
        ) {
          category = "database";
        } else if (
          lowerLine.includes("validate") ||
          lowerLine.includes("validation") ||
          lowerLine.includes("check")
        ) {
          category = "validation";
        } else if (
          lowerLine.includes("test") ||
          lowerLine.includes("testing")
        ) {
          category = "testing";
        } else if (
          lowerLine.includes("import") ||
          lowerLine.includes("call") ||
          lowerLine.includes("service")
        ) {
          category = "integration";
        }

        const requirementText = match[1].trim();

        // Skip if it's just a section header (like "**MUST:**")
        if (!requirementText || requirementText.length < 5) {
          continue;
        }

        requirements.push({
          text: requirementText,
          section: currentSection,
          lineNumber,
          type,
          category,
        });
      }
    }

    // Also check for checklist items that might contain requirements
    const checklistPattern = /^\s*-\s*\[.*?\]\s*(.+)$/;
    const checklistMatch = line.match(checklistPattern);
    if (checklistMatch) {
      const text = checklistMatch[1];
      // Check if it contains requirement language
      if (/must|shall|required/i.test(text) && !text.includes("**MUST**")) {
        // Extract the requirement part
        const reqMatch = text.match(/(?:must|shall|required)\s+(.+)/i);
        if (reqMatch) {
          requirements.push({
            text: reqMatch[1].trim(),
            section: currentSection,
            lineNumber,
            type: "must",
            category: "implementation",
          });
        }
      }
    }
  }

  return requirements;
}

/**
 * Generate implementation decision log template
 * @param {string} fuId - Feature Unit ID (e.g., "FU-100")
 * @param {Array} requirements - Array of requirement objects
 * @param {string} outputPath - Path to write the log file
 * @returns {Promise<string>} Path to created log file
 */
export async function generateImplementationLog(
  fuId,
  requirements,
  outputPath
) {
  const logContent = `# Implementation Decision Log: ${fuId}

**Generated:** ${new Date().toISOString()}

## Overview

This log documents implementation decisions made for ${fuId} and how each requirement from the specification was addressed.

## Implementation Decisions

${requirements
  .map(
    (req, index) => `### Decision ${index + 1}: ${req.text.substring(0, 60)}${
      req.text.length > 60 ? "..." : ""
    }

**Requirement:** ${req.text}
**Location:** ${req.section}, line ${req.lineNumber}
**Type:** ${req.type}
**Category:** ${req.category}
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending

`
  )
  .join("\n")}

## Summary

- **Total Requirements:** ${requirements.length}
- **Implemented:** 0
- **Partially Implemented:** 0
- **Not Implemented:** ${requirements.length}
- **Deferred:** 0

`;

  // Ensure directory exists
  const logDir = path.dirname(outputPath);
  await fs.mkdir(logDir, { recursive: true });

  await fs.writeFile(outputPath, logContent, "utf-8");
  return outputPath;
}

/**
 * Run compliance checks for a requirement
 * @param {Object} requirement - Requirement object
 * @param {string} fuId - Feature Unit ID
 * @returns {Promise<Object>} Check result with status, evidence, and gap
 */
async function checkRequirement(requirement, fuId) {
  const text = requirement.text.toLowerCase();
  let checkResult = { exists: false, evidence: [] };

  // Special handling for common requirement patterns
  if (
    text.includes("extraction_metadata") ||
    text.includes("extraction metadata")
  ) {
    // Check for extraction_metadata column
    checkResult = await checkDatabaseColumn("extraction_metadata", "records");
    if (!checkResult.exists) {
      // Also check if it's used in code
      checkResult = await checkPatternExists("extraction_metadata");
    }
  } else if (
    text.includes("partition") &&
    (text.includes("field") || text.includes("fields"))
  ) {
    // Check for partitionFields function
    checkResult = await checkFunctionExists("partitionFields");
    if (!checkResult.exists) {
      // Check for extractAndValidate which should call partitionFields
      checkResult = await checkFunctionExists("extractAndValidate");
    }
  } else if (
    text.includes("unknown_fields") ||
    text.includes("unknown fields")
  ) {
    // Check if unknown_fields is referenced in code
    checkResult = await checkPatternExists("unknown_fields");
    if (!checkResult.exists) {
      // Check for extraction_metadata usage which should contain unknown_fields
      checkResult = await checkPatternExists("extraction_metadata.*unknown");
    }
  } else if (
    text.includes("schema definition") &&
    (text.includes("validate") || text.includes("get"))
  ) {
    // Check for schema definition usage
    checkResult = await checkImportExists("schema_definitions");
    if (!checkResult.exists) {
      checkResult = await checkFunctionExists("getSchemaDefinition");
    }
  }

  // Determine what to check based on requirement text and category
  if (!checkResult.exists && requirement.category === "database") {
    // Check for database tables, columns
    const tableMatch = requirement.text.match(/table\s+['"]?(\w+)['"]?/i);
    const columnMatch = requirement.text.match(
      /column\s+['"]?(\w+)['"]?|(\w+)\s+column/i
    );

    if (tableMatch) {
      checkResult = await checkDatabaseTable(tableMatch[1]);
    } else if (columnMatch) {
      const columnName = columnMatch[1] || columnMatch[2];
      // Try to infer table name from context or common patterns
      const tableName =
        requirement.text.match(/table\s+['"]?(\w+)['"]?/i)?.[1] || "records";
      checkResult = await checkDatabaseColumn(columnName, tableName);
    }
  } else if (!checkResult.exists && requirement.category === "validation") {
    // Check for validation functions
    if (text.includes("partition") && text.includes("field")) {
      checkResult = await checkFunctionExists("partitionFields");
      if (!checkResult.exists) {
        checkResult = await checkValidationLogic("field_partitioning");
      }
    } else if (text.includes("validate") && text.includes("required")) {
      checkResult = await checkFunctionExists("validateRequired");
      if (!checkResult.exists) {
        checkResult = await checkValidationLogic("required_fields");
      }
    } else if (text.includes("schema") && text.includes("validation")) {
      checkResult = await checkValidationLogic("schema_validation");
      if (!checkResult.exists) {
        checkResult = await checkImportExists("schema_definitions");
      }
    }
  } else if (text.includes("function") || text.includes("implement")) {
    // Try to extract function name
    const funcMatch = requirement.text.match(
      /(?:function|implement)\s+['"]?(\w+)['"]?|['"]?(\w+)\(\)/i
    );
    if (funcMatch) {
      const funcName = funcMatch[1] || funcMatch[2];
      checkResult = await checkFunctionExists(funcName);
    }
  } else if (text.includes("import") || text.includes("use")) {
    // Check for imports
    const importMatch = requirement.text.match(
      /import.*?['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]/i
    );
    if (importMatch) {
      const moduleName = importMatch[1] || importMatch[2];
      checkResult = await checkImportExists(moduleName);
    }
  } else if (text.includes("call") || text.includes("invoke")) {
    // Check for service calls
    const callMatch = requirement.text.match(
      /call\s+['"]?(\w+)\.(\w+)['"]?|invoke\s+['"]?(\w+)['"]?/i
    );
    if (callMatch) {
      const serviceName = callMatch[1] || callMatch[3];
      const functionName = callMatch[2] || callMatch[3];
      checkResult = await checkServiceCall(serviceName, functionName);
    }
  } else {
    // Generic pattern check - look for key terms in codebase
    const keyTerms = requirement.text
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 4 &&
          !["must", "shall", "required", "implement", "should"].includes(word)
      )
      .slice(0, 3);

    if (keyTerms.length > 0) {
      const pattern = keyTerms.join("|");
      checkResult = await checkPatternExists(pattern);
    }
  }

  // Determine status
  let status = "fail";
  let gap = "";

  if (checkResult.exists && checkResult.evidence.length > 0) {
    status = "pass";
  } else {
    gap = `Required but not found in codebase. Expected: ${requirement.text}`;
  }

  return {
    requirement,
    status,
    evidence: checkResult.evidence,
    gap,
  };
}

/**
 * Run all compliance checks for a Feature Unit
 * @param {string} fuId - Feature Unit ID
 * @param {Array} requirements - Array of requirement objects
 * @param {string} implementationLogPath - Path to implementation log
 * @returns {Promise<Array>} Array of check results
 */
export async function runComplianceChecks(
  fuId,
  requirements,
  implementationLogPath
) {
  const results = [];

  for (const requirement of requirements) {
    const checkResult = await checkRequirement(requirement, fuId);
    results.push(checkResult);
  }

  return results;
}

/**
 * Generate compliance report
 * @param {string} fuId - Feature Unit ID
 * @param {Array} checkResults - Array of check result objects
 * @param {string} outputPath - Path to write the report
 * @returns {Promise<string>} Path to created report
 */
export async function generateComplianceReport(fuId, checkResults, outputPath) {
  const passed = checkResults.filter((r) => r.status === "pass");
  const failed = checkResults.filter((r) => r.status === "fail");

  const reportContent = `# ${fuId} Compliance Report

**Generated:** ${new Date().toISOString()}

## Summary

- **Total Requirements:** ${checkResults.length}
- **✅ Passed:** ${passed.length}
- **❌ Failed:** ${failed.length}
- **Compliance Rate:** ${
    checkResults.length > 0
      ? ((passed.length / checkResults.length) * 100).toFixed(1)
      : 0
  }%

## Requirements Status

| Requirement | Location | Status | Evidence | Gap |
|------------|----------|--------|----------|-----|
${checkResults
  .map((result) => {
    const req = result.requirement;
    const statusIcon = result.status === "pass" ? "✅ Pass" : "❌ Fail";
    const evidence =
      result.evidence.length > 0 ? result.evidence.slice(0, 2).join("; ") : "-";
    const gap = result.gap || "-";
    const reqText =
      req.text.length > 80 ? req.text.substring(0, 77) + "..." : req.text;
    return `| ${reqText} | ${req.section} | ${statusIcon} | ${evidence} | ${gap} |`;
  })
  .join("\n")}

${
  failed.length > 0
    ? `## Implementation Gaps

${failed
  .map((result, index) => {
    const req = result.requirement;
    return `${index + 1}. **Critical Gap:** ${req.text.substring(0, 60)}${
      req.text.length > 60 ? "..." : ""
    }
   - **Requirement:** ${req.section}, line ${req.lineNumber}
   - **Current:** Not implemented
   - **Required:** ${req.text}
   - **Files to modify:** [To be determined based on requirement]
`;
  })
  .join("\n")}`
    : ""
}

## Recommendations

${
  failed.length > 0
    ? `The following requirements need to be implemented before ${fuId} can be marked as complete:

${failed.map((result) => `- ${result.requirement.text}`).join("\n")}
`
    : `All requirements are implemented. ${fuId} is compliant with its specification.`
}

`;

  // Ensure directory exists
  const reportDir = path.dirname(outputPath);
  await fs.mkdir(reportDir, { recursive: true });

  await fs.writeFile(outputPath, reportContent, "utf-8");
  return outputPath;
}

/**
 * Main validation function
 * @param {string} fuId - Feature Unit ID
 * @param {string} releaseId - Release ID (e.g., "v0.1.0")
 * @returns {Promise<{compliant: boolean, reportPath: string, gaps: Array}>}
 */
export async function validateFUSpecCompliance(fuId, releaseId) {
  // Find spec file
  const specPaths = [
    `docs/feature_units/completed/${fuId}/${fuId}_spec.md`,
    `docs/feature_units/in_progress/${fuId}/${fuId}_spec.md`,
    `docs/specs/MVP_FEATURE_UNITS.md`,
  ];

  let specPath = null;
  for (const pathCandidate of specPaths) {
    try {
      await fs.access(pathCandidate);
      specPath = pathCandidate;
      break;
    } catch (error) {
      // Continue to next path
    }
  }

  if (!specPath) {
    throw new Error(`Could not find spec file for ${fuId}`);
  }

  // Extract requirements from spec
  const requirements = await extractRequirements(specPath);

  if (requirements.length === 0) {
    console.warn(`[WARN] No requirements found in spec for ${fuId}`);
    return {
      compliant: true,
      reportPath: null,
      gaps: [],
    };
  }

  // Generate implementation log
  const logDir = `docs/releases/${releaseId}/implementation_logs`;
  const logPath = path.join(logDir, `${fuId}_implementation_log.md`);
  await generateImplementationLog(fuId, requirements, logPath);

  // Run compliance checks
  const checkResults = await runComplianceChecks(fuId, requirements, logPath);

  // Generate compliance report
  const reportDir = `docs/releases/${releaseId}/compliance_reports`;
  const reportPath = path.join(reportDir, `${fuId}_compliance.md`);
  await generateComplianceReport(fuId, checkResults, reportPath);

  // Determine compliance
  const gaps = checkResults.filter((r) => r.status === "fail");
  const compliant = gaps.length === 0;

  return {
    compliant,
    reportPath,
    logPath,
    totalRequirements: checkResults.length,
    passed: checkResults.filter((r) => r.status === "pass").length,
    failed: checkResults.filter((r) => r.status === "fail").length,
    gaps: gaps.map((g) => ({
      requirement: g.requirement.text,
      section: g.requirement.section,
      gap: g.gap,
    })),
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const fuId = process.argv[2];
  const releaseId = process.argv[3] || "v0.1.0";

  if (!fuId) {
    console.error(
      "Usage: node validate_spec_compliance.js <fu_id> [release_id]"
    );
    process.exit(1);
  }

  validateFUSpecCompliance(fuId, releaseId)
    .then((result) => {
      if (result.compliant) {
        console.log(`[SUCCESS] ${fuId} is compliant with its specification`);
        console.log(`Report: ${result.reportPath}`);
        process.exit(0);
      } else {
        console.error(
          `[FAILURE] ${fuId} has ${result.gaps.length} compliance gap(s)`
        );
        console.error(`Report: ${result.reportPath}`);
        result.gaps.forEach((gap) => {
          console.error(`  - ${gap.requirement}`);
        });
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(`[ERROR] Validation failed: ${error.message}`);
      process.exit(1);
    });
}
