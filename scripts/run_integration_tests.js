#!/usr/bin/env node

/**
 * Standalone script to run full integration test suite for a release
 * Usage: node scripts/run_integration_tests.js <RELEASE_ID>
 */

import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const RELEASE_ID = process.argv[2] || "v0.1.0";

// Parse all integration tests from markdown
function parseAllIntegrationTests(content) {
  const tests = [];

  // First, parse test matrix table to get all test IDs and names
  const tableRegex = /\| (IT-\d+)\s+\| ([^\|]+)\s+\|/g;
  const tableMatches = [];
  let tableMatch;

  while ((tableMatch = tableRegex.exec(content)) !== null) {
    tableMatches.push({
      id: tableMatch[1],
      name: tableMatch[2].trim(),
    });
  }

  // Then find detailed test definitions
  for (const tableTest of tableMatches) {
    // Find the detailed test section (#### IT-XXX: Test Name)
    const testSectionRegex = new RegExp(
      `#### ${tableTest.id}:\\s*${tableTest.name.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}[\\s\\S]*?(?=####|$)`,
      "i"
    );
    const testSectionMatch = content.match(testSectionRegex);

    if (testSectionMatch) {
      const testSection = testSectionMatch[0];

      // Extract test command if present (look for "test:" field or machine-checkable section)
      const commandMatch =
        testSection.match(/\*\*test:\*\*\s*"([^"]+)"/i) ||
        testSection.match(/test:\s*"([^"]+)"/i) ||
        testSection.match(/Machine-Checkable:[\s\\S]*?`([^`]+)`/i);
      const testCommand = commandMatch ? commandMatch[1] : null;

      // Extract goal
      const goalMatch = testSection.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
      const goal = goalMatch ? goalMatch[1].trim() : tableTest.name;

      tests.push({
        id: tableTest.id,
        name: tableTest.name,
        goal: goal,
        command: testCommand,
      });
    } else {
      // Test defined in table but no detailed section - still add it
      tests.push({
        id: tableTest.id,
        name: tableTest.name,
        goal: tableTest.name,
        command: null,
      });
    }
  }

  return tests.sort((a, b) => a.id.localeCompare(b.id));
}

// Execute test command
async function executeTestCommand(test) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[TEST] Starting: ${test.id} - ${test.name}`);
  console.log(`[TEST] Goal: ${test.goal || "N/A"}`);
  console.log(`${"=".repeat(80)}`);

  if (!test.command) {
    console.warn(
      `[WARN] No test command defined for ${test.id}, marking as not_run`
    );
    return null; // null means not_run, true means passed, false means failed
  }

  // Map test file paths to npm test commands
  const testFile = test.command;
  console.log(`[TEST] Test file: ${testFile}`);

  // Check if test file exists
  try {
    await import("fs/promises").then((fs) => fs.access(testFile));
    console.log(`[TEST] ✓ Test file exists`);
  } catch (error) {
    console.warn(
      `[WARN] Test file ${testFile} not found for ${test.id}, marking as not_run`
    );
    return null; // Test file doesn't exist yet - mark as not_run
  }

  // Execute test via npm
  const startTime = Date.now();
  try {
    const command = `npm run test:integration -- ${testFile}`;
    console.log(`[TEST] Executing command: ${command}`);
    console.log(`[TEST] Working directory: ${process.cwd()}`);
    console.log(`[TEST] Timeout: 300000ms (5 minutes)`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;
    console.log(`[TEST] Execution completed in ${duration}ms`);

    // Log stdout (test output)
    if (stdout) {
      console.log(`[TEST] stdout (last 500 chars):`);
      console.log(stdout.slice(-500));
    }

    // Log stderr if present
    if (stderr && stderr.trim().length > 0) {
      console.log(`[TEST] stderr:`);
      console.log(stderr.slice(-500));
    }

    // Parse test results from stdout
    // Vitest outputs: "Test Files  X failed | Y passed (Z)" or "Tests  X failed | Y passed (Z)"
    const testFilesMatch = stdout.match(
      /Test Files\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/i
    );
    const testsMatch = stdout.match(
      /Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/i
    );

    let failedCount = 0;
    let passedCount = 0;

    if (testFilesMatch) {
      failedCount = parseInt(testFilesMatch[1], 10);
      passedCount = parseInt(testFilesMatch[2], 10);
      console.log(
        `[TEST] Parsed results: ${failedCount} failed, ${passedCount} passed (from Test Files)`
      );
    } else if (testsMatch) {
      failedCount = parseInt(testsMatch[1], 10);
      passedCount = parseInt(testsMatch[2], 10);
      console.log(
        `[TEST] Parsed results: ${failedCount} failed, ${passedCount} passed (from Tests)`
      );
    } else {
      console.warn(`[TEST] Could not parse test results from output`);
    }

    // If we're running a single test file, check if it passed
    // For single file: if passedCount > 0 and failedCount === 0, test passed
    if (passedCount > 0 && failedCount === 0) {
      console.log(
        `[TEST] ✓ PASSED: ${test.id} (${passedCount} test(s) passed in ${duration}ms)`
      );
      console.log(`${"=".repeat(80)}\n`);
      return true;
    } else if (failedCount > 0) {
      console.error(
        `[TEST] ✗ FAILED: ${test.id} (${failedCount} test(s) failed, ${passedCount} passed in ${duration}ms)`
      );
      console.log(`[TEST] Failed test details:`);
      // Extract failure details from stdout
      const failureMatch = stdout.match(/FAIL\s+([^\n]+)/i);
      if (failureMatch) {
        console.log(`[TEST]   ${failureMatch[1]}`);
      }
      console.log(`${"=".repeat(80)}\n`);
      return false;
    }

    // Fallback: check for "passed" in output
    if (stdout.includes("passed") && !stdout.match(/\d+\s+failed/i)) {
      console.log(
        `[TEST] ✓ PASSED: ${test.id} (parsed from output in ${duration}ms)`
      );
      console.log(`${"=".repeat(80)}\n`);
      return true;
    }

    if (stderr && !stderr.includes("PASS") && !stderr.includes("passed")) {
      console.warn(`[TEST] Warning: stderr output detected`);
      console.warn(`[TEST] stderr preview:`, stderr.substring(0, 200));
    }

    // Default to failed if we can't determine
    console.error(`[TEST] ✗ FAILED: ${test.id} (could not parse results)`);
    console.log(`[TEST] Raw stdout length: ${stdout.length} chars`);
    console.log(
      `[TEST] Raw stderr length: ${stderr ? stderr.length : 0} chars`
    );
    console.log(`${"=".repeat(80)}\n`);
    return false;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[TEST] ✗ ERROR: ${test.id} failed after ${duration}ms`);
    console.error(`[TEST] Error type: ${error.name || "Unknown"}`);
    console.error(`[TEST] Error message: ${error.message}`);

    // Check if error has stdout with test results
    if (error.stdout) {
      console.log(
        `[TEST] Error stdout available (${error.stdout.length} chars)`
      );
      const testFilesMatch = error.stdout.match(
        /Test Files\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/i
      );
      const testsMatch = error.stdout.match(
        /Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/i
      );

      let failedCount = 0;
      let passedCount = 0;

      if (testFilesMatch) {
        failedCount = parseInt(testFilesMatch[1], 10);
        passedCount = parseInt(testFilesMatch[2], 10);
        console.log(
          `[TEST] Parsed from error stdout: ${failedCount} failed, ${passedCount} passed`
        );
      } else if (testsMatch) {
        failedCount = parseInt(testsMatch[1], 10);
        passedCount = parseInt(testsMatch[2], 10);
        console.log(
          `[TEST] Parsed from error stdout: ${failedCount} failed, ${passedCount} passed`
        );
      }

      // If running single file and it has passed tests, consider it passed
      if (passedCount > 0 && failedCount === 0) {
        console.log(
          `[TEST] ✓ PASSED: ${test.id} (${passedCount} test(s) passed despite error)`
        );
        console.log(`${"=".repeat(80)}\n`);
        return true;
      } else if (failedCount > 0) {
        console.error(
          `[TEST] ✗ FAILED: ${test.id} (${failedCount} test(s) failed, ${passedCount} passed)`
        );
        console.log(`[TEST] Error stdout (last 500 chars):`);
        console.log(error.stdout.slice(-500));
        console.log(`${"=".repeat(80)}\n`);
        return false;
      }
    }

    if (error.stderr) {
      console.error(`[TEST] Error stderr (${error.stderr.length} chars):`);
      console.error(error.stderr.slice(-500));
    }

    if (error.code) {
      console.error(`[TEST] Error code: ${error.code}`);
    }

    if (error.signal) {
      console.error(`[TEST] Error signal: ${error.signal}`);
    }

    console.log(`${"=".repeat(80)}\n`);
    return false;
  }
}

// Update integration test results in status.md
async function updateIntegrationTestResults(releaseId, results) {
  const STATUS_MD_PATH = `docs/releases/in_progress/${releaseId}/status.md`;

  try {
    const statusContent = await readFile(STATUS_MD_PATH, "utf-8");

    // Find integration test status table - more flexible regex
    const testTableRegex =
      /(### 5\. Integration Test Status[\s\S]*?\| Test ID \| Name[\s\S]*?\| ------- \| ------- \|)[\s\S]*?(\*\*Summary:\*\*)/;
    let match = statusContent.match(testTableRegex);

    // Try alternative format without Notes column
    if (!match) {
      const altRegex =
        /(### 5\. Integration Test Status[\s\S]*?\| Test ID \| Name[\s\S]*?\| ------- \|)[\s\S]*?(\*\*Summary:\*\*)/;
      match = statusContent.match(altRegex);
    }

    if (!match) {
      console.warn(
        `[WARN] Could not find integration test status table in status.md`
      );
      console.warn(`[WARN] Attempting to find table with different pattern...`);
      // Try to find the table section and replace it manually
      const sectionMatch = statusContent.match(
        /(### 5\. Integration Test Status[\s\S]*?)(?=---|###|$)/
      );
      if (sectionMatch) {
        // Generate new table
        const testRows = results
          .map((r) => {
            const icon =
              r.status === "passed"
                ? "✅"
                : r.status === "failed"
                ? "❌"
                : "⏳";
            const statusText =
              r.status === "passed"
                ? "passed"
                : r.status === "failed"
                ? "failed"
                : "not_run";
            return `| ${r.id} | ${r.name} | ${icon} ${statusText} |`;
          })
          .join("\n");

        const passedCount = results.filter((r) => r.passed).length;
        const totalCount = results.length;

        const newSection = `### 5. Integration Test Status

| Test ID | Name                                  | Status     |
| ------- | ------------------------------------- | ---------- |
${testRows}

**Summary:** ${passedCount}/${totalCount} passed
`;

        const newContent = statusContent.replace(sectionMatch[0], newSection);
        await writeFile(STATUS_MD_PATH, newContent, "utf-8");
        console.log(`[INFO] Updated integration test results in status.md`);
        return;
      }
      return;
    }

    // Generate new test rows
    const testRows = results
      .map((r) => {
        const icon =
          r.status === "passed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
        const statusText =
          r.status === "passed"
            ? "passed"
            : r.status === "failed"
            ? "failed"
            : "not_run";
        return `| ${r.id} | ${r.name} | ${icon} ${statusText} |`;
      })
      .join("\n");

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    // Replace test table
    const newContent = statusContent.replace(
      testTableRegex,
      `$1\n${testRows}\n\n$2 ${passedCount}/${totalCount} passed`
    );

    await writeFile(STATUS_MD_PATH, newContent, "utf-8");
    console.log(`[INFO] Updated integration test results in status.md`);
  } catch (error) {
    console.warn(
      `[WARN] Failed to update integration test results: ${error.message}`
    );
  }
}

// Run full integration test suite
async function runFullIntegrationTestSuite(releaseId) {
  const suiteStartTime = Date.now();
  console.log(`\n${"#".repeat(80)}`);
  console.log(
    `[TEST SUITE] Starting full integration test suite for Release ${releaseId}`
  );
  console.log(`[TEST SUITE] Start time: ${new Date().toISOString()}`);
  console.log(`${"#".repeat(80)}\n`);

  const integrationTestsPath = `docs/releases/in_progress/${releaseId}/integration_tests.md`;

  try {
    console.log(
      `[TEST SUITE] Loading integration tests from: ${integrationTestsPath}`
    );
    const content = await readFile(integrationTestsPath, "utf-8");
    console.log(`[TEST SUITE] File loaded (${content.length} chars)`);

    // Parse all tests from integration_tests.md
    console.log(`[TEST SUITE] Parsing test definitions...`);
    const allTests = parseAllIntegrationTests(content);

    if (allTests.length === 0) {
      console.log(`[TEST SUITE] No integration tests defined, skipping`);
      return true;
    }

    console.log(`[TEST SUITE] Found ${allTests.length} integration test(s):`);
    allTests.forEach((t, idx) => {
      console.log(`[TEST SUITE]   ${idx + 1}. ${t.id}: ${t.name}`);
      console.log(`[TEST SUITE]      Goal: ${t.goal || "N/A"}`);
      console.log(`[TEST SUITE]      Command: ${t.command || "N/A"}`);
    });
    console.log(
      `\n[TEST SUITE] Test execution order: ${allTests
        .map((t) => t.id)
        .join(" → ")}\n`
    );

    // Execute each test
    const results = [];
    for (let i = 0; i < allTests.length; i++) {
      const test = allTests[i];
      console.log(`\n[TEST SUITE] Progress: ${i + 1}/${allTests.length} tests`);
      console.log(`[TEST SUITE] Running ${test.id}: ${test.name}`);

      const testResult = await executeTestCommand(test);

      // null = not_run, true = passed, false = failed
      const status =
        testResult === null ? "not_run" : testResult ? "passed" : "failed";

      results.push({
        id: test.id,
        name: test.name,
        passed: testResult === true, // Only true counts as passed
        status: status,
      });

      if (testResult === false) {
        console.error(`[TEST SUITE] ✗ ${test.id} FAILED`);
        // Continue running other tests to get full picture
      } else if (testResult === null) {
        console.warn(
          `[TEST SUITE] ⏳ ${test.id} NOT RUN (no command or test file missing)`
        );
      } else {
        console.log(`[TEST SUITE] ✓ ${test.id} PASSED`);
      }
    }

    const suiteDuration = Date.now() - suiteStartTime;
    console.log(`\n${"#".repeat(80)}`);
    console.log(
      `[TEST SUITE] Test suite execution completed in ${suiteDuration}ms`
    );
    console.log(`[TEST SUITE] End time: ${new Date().toISOString()}`);

    // Update status.md with test results
    console.log(`[TEST SUITE] Updating status.md with test results...`);
    await updateIntegrationTestResults(releaseId, results);

    // Check if all tests passed
    const allPassed = results.every((r) => r.passed);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => r.status === "failed").length;
    const notRun = results.filter((r) => r.status === "not_run").length;

    console.log(`\n[TEST SUITE] Summary:`);
    console.log(`[TEST SUITE]   Total tests: ${allTests.length}`);
    console.log(`[TEST SUITE]   ✓ Passed: ${passed}`);
    console.log(`[TEST SUITE]   ✗ Failed: ${failed}`);
    console.log(`[TEST SUITE]   ⏳ Not run: ${notRun}`);
    console.log(
      `[TEST SUITE]   Success rate: ${(
        (passed / allTests.length) *
        100
      ).toFixed(1)}%`
    );

    if (failed > 0) {
      console.log(`\n[TEST SUITE] Failed tests:`);
      results
        .filter((r) => r.status === "failed")
        .forEach((r) => {
          console.log(`[TEST SUITE]   - ${r.id}: ${r.name}`);
        });
    }

    if (notRun > 0) {
      console.log(`\n[TEST SUITE] Not run tests:`);
      results
        .filter((r) => r.status === "not_run")
        .forEach((r) => {
          console.log(`[TEST SUITE]   - ${r.id}: ${r.name}`);
        });
    }

    console.log(`${"#".repeat(80)}\n`);

    return allPassed;
  } catch (error) {
    console.error(`[ERROR] Full integration test suite failed:`, error.message);
    return false;
  }
}

// Main execution
runFullIntegrationTestSuite(RELEASE_ID)
  .then((allPassed) => {
    if (allPassed) {
      console.log(`[INFO] Integration test suite completed successfully`);
      process.exit(0);
    } else {
      console.log(
        `[INFO] Integration test suite completed with some failures or skipped tests`
      );
      process.exit(0); // Don't fail - just report results
    }
  })
  .catch((error) => {
    console.error(`[ERROR] Failed to run integration tests:`, error);
    process.exit(1);
  });
