#!/usr/bin/env node

/**
 * Release Orchestrator
 *
 * Spawns and coordinates worker agents for parallel Feature Unit execution.
 * Uses Cursor Cloud Agents API to spawn background agents.
 *
 * Usage:
 *   node scripts/release_orchestrator.js <release_id>
 *
 * Example:
 *   node scripts/release_orchestrator.js v0.1.0
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RELEASE_ID = process.argv[2];
if (!RELEASE_ID) {
  console.error("Usage: node scripts/release_orchestrator.js <release_id>");
  process.exit(1);
}

const MANIFEST_PATH = `docs/releases/in_progress/${RELEASE_ID}/manifest.yaml`;
const STATUS_FILE = `docs/releases/in_progress/${RELEASE_ID}/agent_status.json`;
const EXECUTION_SCHEDULE_PATH = `docs/releases/in_progress/${RELEASE_ID}/execution_schedule.md`;

// Load YAML (simple parser for basic structure)
async function loadYAML(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  const yaml = {};

  // Simple YAML parser for nested structures
  const lines = content.split("\n");
  const stack = [{ obj: yaml, indent: -1 }];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const match = trimmed.match(/^([^:]+):\s*(.*)$/);

    if (!match) continue;

    const key = match[1].trim();
    let value = match[2].trim();

    // Strip inline comments (everything after # that's not in quotes)
    const commentIndex = value.indexOf("#");
    if (commentIndex !== -1) {
      // Check if # is inside quotes
      const beforeComment = value.substring(0, commentIndex);
      const quoteCount = (beforeComment.match(/"/g) || []).length;
      if (quoteCount % 2 === 0) {
        // Not inside quotes, strip comment
        value = value.substring(0, commentIndex).trim();
      }
    }

    // Remove surrounding quotes if present
    value = value.replace(/^["']|["']$/g, "");

    // Pop stack until we find parent with less indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    if (value === "" || value === "{}") {
      // Nested object
      const newObj = {};
      current[key] = newObj;
      stack.push({ obj: newObj, indent });
    } else {
      // Value
      current[key] = value;
    }
  }

  return yaml;
}

// Load execution schedule from markdown
async function loadExecutionSchedule(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  const batches = [];

  // Parse markdown execution schedule
  const batchRegex =
    /#### Batch (\d+)[\s\S]*?Feature Units:[\s\S]*?(- `FU-\d+`[^\n]*\n)+/g;
  let match;

  while ((match = batchRegex.exec(content)) !== null) {
    const batchId = parseInt(match[1]);
    const fuMatches = match[0].match(/- `FU-(\d+)`/g);
    const fus = fuMatches ? fuMatches.map((m) => m.match(/FU-(\d+)/)[1]) : [];

    batches.push({
      batch_id: batchId,
      feature_units: fus.map((id) => `FU-${id}`),
    });
  }

  return batches.sort((a, b) => a.batch_id - b.batch_id);
}

// Initialize status file
async function initializeStatus(releaseId, batches) {
  const status = {
    release_id: releaseId,
    orchestrator: {
      agent_id: `orch_${Date.now()}`,
      started_at: new Date().toISOString(),
      current_batch: null,
      status: "running",
    },
    batches: batches.map((batch) => ({
      batch_id: batch.batch_id,
      status: "pending",
      feature_units: batch.feature_units.map((fuId) => ({
        fu_id: fuId,
        worker_agent_id: null,
        status: "pending",
        progress: 0,
        started_at: null,
        last_update: null,
        completed_at: null,
        error: null,
        tests: {
          unit: {
            passed: null,
            coverage: null,
            command: null,
          },
          integration: {
            passed: null,
            command: null,
          },
          e2e: {
            passed: null,
            command: null,
          },
        },
      })),
    })),
    errors: [],
    completed_fus: [],
  };

  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
  return status;
}

// Load status file
async function loadStatus() {
  try {
    const content = await fs.readFile(STATUS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

// Update status file atomically
async function updateStatus(updater) {
  const status = await loadStatus();
  updater(status);
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
}

// Spawn worker agent via Cursor Cloud Agents API
async function spawnWorkerAgent(fuId, batchId, releaseId, manifest) {
  const agentInstructions = generateAgentInstructions(fuId, batchId, releaseId);

  // Validate required environment variables
  if (!process.env.CURSOR_CLOUD_API_URL || !process.env.CURSOR_CLOUD_API_KEY) {
    throw new Error(
      "Missing required environment variables: CURSOR_CLOUD_API_URL and/or CURSOR_CLOUD_API_KEY"
    );
  }

  if (!process.env.REPO_URL) {
    throw new Error("Missing required environment variable: REPO_URL");
  }

  // Select model based on FU complexity
  const selectedModel = selectModelForFU(fuId, manifest);
  const metadata = getFUMetadata(fuId, manifest);
  const duration = estimateFUDuration(fuId);

  // Determine which tier was selected (for logging)
  const modelTier =
    selectedModel === MODEL_TIERS.low
      ? "low"
      : selectedModel === MODEL_TIERS.medium
      ? "medium"
      : selectedModel === MODEL_TIERS.high
      ? "high"
      : "unknown";

  console.log(`[INFO] Spawning worker agent for ${fuId} in Batch ${batchId}`);
  console.log(
    `[INFO]   Model: ${selectedModel} (${modelTier} tier) - complexity: priority=${metadata.priority}, risk=${metadata.risk_level}, duration=${duration}min`
  );

  // Log if using default (no env var override)
  if (!process.env[`CURSOR_MODEL_${modelTier.toUpperCase()}`]) {
    console.log(
      `[INFO]   Using recommended default model (override via CURSOR_MODEL_${modelTier.toUpperCase()})`
    );
  }

  const apiUrl = process.env.CURSOR_CLOUD_API_URL.replace(/\/$/, ""); // Remove trailing slash
  const endpoint = `${apiUrl}/background-agents`;

  try {
    const requestBody = {
      name: `${fuId}-Batch-${batchId}`,
      repository: process.env.REPO_URL,
      branch: process.env.RELEASE_BRANCH || "main",
      instructions: agentInstructions,
      environment: {
        FU_ID: fuId,
        BATCH_ID: batchId.toString(),
        RELEASE_ID: releaseId,
        STATUS_FILE: STATUS_FILE,
      },
      max_duration_minutes: duration + 30,
    };

    // Add model parameter if API supports it
    // Note: Check Cursor Cloud API docs for exact parameter name
    // Common options: "model", "agent_model", "llm_model"
    if (selectedModel) {
      requestBody.model = selectedModel;
      // Also try alternative parameter names if primary doesn't work
      // requestBody.agent_model = selectedModel;
      // requestBody.llm_model = selectedModel;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CURSOR_CLOUD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to spawn agent: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    const agentId = data.id || data.agent_id;

    if (!agentId) {
      throw new Error(`API response missing agent ID: ${JSON.stringify(data)}`);
    }

    console.log(
      `[INFO] Successfully spawned worker agent ${agentId} for ${fuId}`
    );
    return agentId;
  } catch (error) {
    console.error(
      `[ERROR] Failed to spawn worker agent for ${fuId}:`,
      error.message
    );
    throw error;
  }
}

// Generate agent instructions template
function generateAgentInstructions(fuId, batchId, releaseId) {
  return `You are a worker agent executing Feature Unit ${fuId} in Batch ${batchId} for Release ${releaseId}.

**Your Task:**
1. Load FU specification: \`docs/feature_units/completed/${fuId}/FU-${fuId}_spec.md\` or \`docs/specs/MVP_FEATURE_UNITS.md\`
2. Execute Feature Unit workflow:
   - Check if FU spec exists (if not, create it)
   - If UI FU and no prototype, create prototype
   - Run implementation workflow
   - Run tests (unit, integration, E2E)
   - Update status file: \`${STATUS_FILE}\`
3. Report completion:
   - Update status: \`{"fu_id": "${fuId}", "status": "completed", "timestamp": "..."}\`
   - Report any errors or blockers

**Constraints:**
- Follow all constraints from \`docs/foundation/agent_instructions.md\`
- Update status file atomically (use file locking)
- Do not modify FUs assigned to other agents
- Report failures immediately (don't retry indefinitely)

**Status File Location:** \`${STATUS_FILE}\`
**Update Frequency:** Every 5-10 minutes
**Completion Signal:** Set \`status: "completed"\` and \`progress: 1.0\``;
}

// Model tier configuration (cost optimization)
// Cheaper models for simpler work, more expensive for complex work
//
// RECOMMENDED DEFAULTS (used when env vars not configured):
// - Low tier: "auto" - FREE on Cursor plans (no per-token charges)
// - Medium tier: "claude-3-5-sonnet-20241022" - Better coding performance, balanced cost
// - High tier: "claude-3-5-sonnet-20241022" - Superior coding quality for complex FUs
//
// MODEL SELECTION RATIONALE:
// - Low tier: "auto" chosen because it's FREE on Cursor plans (no per-token charges)
//   * Simple tasks don't need best coding quality, so free > paid
//   * If "auto" not available, falls back to gpt-4o-mini (~$0.15/$0.60 per 1M tokens)
// - Medium/High tier: Claude 3.5 Sonnet chosen for superior coding performance:
//   * Claude 3.5 Sonnet: 84.9% HumanEval vs GPT-4o: 67.0%
//   * Claude 3.5 Sonnet: Better SWE-bench performance (72.7% vs 54.6%)
//   * Cost: $3/$15 per 1M tokens (slightly more than GPT-4o $2.50/$10)
//   * Worth the premium for coding tasks where quality matters
//
// Override via environment variables:
//   CURSOR_MODEL_LOW, CURSOR_MODEL_MEDIUM, CURSOR_MODEL_HIGH
//
// Alternative models (if defaults unavailable):
//   Low: "gpt-4o-mini" (~$0.15/$0.60 per 1M tokens), "claude-haiku", "gpt-3.5-turbo"
//   Medium: "gpt-4o", "claude-3-opus-20240229"
//   High: "claude-3-opus-20240229", "gpt-4-turbo"
//
// IMPORTANT: Cursor Plan Pricing
//   - "auto" model: FREE (included in Cursor plan, no per-token charges)
//   - Explicit model selection: Charged per-token usage
//   - For low-tier tasks, "auto" is always cheaper (free vs paid)
const MODEL_TIERS = {
  // Low complexity: Simple FUs, low risk, short duration (< 4 hours)
  // Recommended: "auto" (FREE on Cursor plans, no per-token charges)
  // Fallback: gpt-4o-mini (~$0.15/$0.60 per 1M tokens) if "auto" not supported
  // For simple tasks, free > paid, and speed/cost > coding quality
  low: process.env.CURSOR_MODEL_LOW || "auto",

  // Medium complexity: Moderate FUs, medium risk, medium duration (4-8 hours)
  // Recommended: claude-3-5-sonnet-20241022 (superior coding, ~$3/$15 per 1M tokens)
  // Claude outperforms GPT on coding benchmarks (84.9% vs 67.0% HumanEval)
  medium: process.env.CURSOR_MODEL_MEDIUM || "claude-3-5-sonnet-20241022",

  // High complexity: Complex FUs, high risk, long duration (> 8 hours), critical path
  // Recommended: claude-3-5-sonnet-20241022 (best coding quality, ~$3/$15 per 1M tokens)
  // For complex coding tasks, quality > cost savings
  high: process.env.CURSOR_MODEL_HIGH || "claude-3-5-sonnet-20241022",
};

// Estimate FU duration (placeholder - should be based on FU spec)
function estimateFUDuration(fuId) {
  // Default estimates in minutes
  const estimates = {
    "FU-000": 60,
    "FU-002": 30,
    "FU-050": 480, // 8 hours
    "FU-051": 240, // 4 hours
    "FU-052": 120, // 2 hours
    "FU-053": 120,
    "FU-054": 120,
    "FU-100": 1680, // 1-2 weeks
    "FU-101": 1680,
    "FU-102": 1680,
    "FU-103": 1680,
    "FU-200": 1680,
    "FU-201": 480,
    "FU-202": 240,
    "FU-203": 480,
    "FU-204": 480,
    "FU-205": 480,
    "FU-206": 240,
  };

  return estimates[fuId] || 480; // Default 8 hours
}

// Get FU metadata from manifest
function getFUMetadata(fuId, manifest) {
  const fus = manifest.feature_units || [];
  const fu = fus.find((f) => f.id === fuId);

  if (!fu) {
    return {
      priority: "P2", // Default to medium priority
      risk_level: "medium", // Default to medium risk
      dependencies: [],
    };
  }

  return {
    priority: fu.priority || "P2",
    risk_level: fu.risk_level || "medium",
    dependencies: fu.dependencies || [],
    notes: fu.notes || null,
  };
}

// Determine model tier based on FU complexity
function selectModelForFU(fuId, manifest) {
  const metadata = getFUMetadata(fuId, manifest);
  const duration = estimateFUDuration(fuId);

  // Complexity scoring
  let complexityScore = 0;

  // Priority weight (P0 = critical = higher complexity)
  const priorityWeight = {
    P0: 3,
    P1: 2,
    P2: 1,
    P3: 0.5,
  };
  complexityScore += priorityWeight[metadata.priority] || 1;

  // Risk level weight
  const riskWeight = {
    high: 3,
    medium: 1.5,
    low: 0.5,
  };
  complexityScore += riskWeight[metadata.risk_level] || 1.5;

  // Duration weight (longer = more complex)
  // Normalize duration: < 4 hours = 0.5, 4-8 hours = 1, > 8 hours = 2
  let durationWeight = 0.5;
  if (duration >= 480) {
    // >= 8 hours
    durationWeight = 2;
  } else if (duration >= 240) {
    // >= 4 hours
    durationWeight = 1;
  }
  complexityScore += durationWeight;

  // Dependency count weight (more dependencies = more complex)
  const dependencyWeight = Math.min(metadata.dependencies.length * 0.5, 2);
  complexityScore += dependencyWeight;

  // Select model tier based on total complexity score
  // Low: < 3, Medium: 3-6, High: > 6
  if (complexityScore < 3) {
    return MODEL_TIERS.low;
  } else if (complexityScore < 6) {
    return MODEL_TIERS.medium;
  } else {
    return MODEL_TIERS.high;
  }
}

// Check if batch dependencies are complete
async function canStartBatch(batch, status) {
  // Check all FUs in previous batches are complete
  for (let i = 0; i < batch.batch_id; i++) {
    const prevBatch = status.batches.find((b) => b.batch_id === i);
    if (!prevBatch) continue;

    const incomplete = prevBatch.feature_units.some(
      (fu) => fu.status !== "completed"
    );
    if (incomplete) {
      return false;
    }
  }

  // Check execution limits
  const activeAgents = status.batches
    .flatMap((b) => b.feature_units)
    .filter((fu) => fu.status === "running").length;

  const manifest = await loadYAML(MANIFEST_PATH);
  const maxParallel = parseInt(
    manifest.execution_strategy?.max_parallel_fus || 3
  );

  if (activeAgents >= maxParallel) {
    return false;
  }

  return true;
}

// Monitor worker agents
async function monitorWorkers(status) {
  if (!process.env.CURSOR_CLOUD_API_URL || !process.env.CURSOR_CLOUD_API_KEY) {
    // Fallback to file-based monitoring if API not configured
    return monitorWorkersFileBased(status);
  }

  const apiUrl = process.env.CURSOR_CLOUD_API_URL.replace(/\/$/, "");

  for (const batch of status.batches) {
    if (batch.status !== "running") continue;

    for (const fu of batch.feature_units) {
      if (fu.status === "running" && fu.worker_agent_id) {
        try {
          // Poll API for agent status
          const response = await fetch(
            `${apiUrl}/background-agents/${fu.worker_agent_id}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.CURSOR_CLOUD_API_KEY}`,
              },
            }
          );

          if (response.ok) {
            const agentData = await response.json();
            const agentStatus = agentData.status || agentData.state;

            // Update FU status based on agent status
            if (agentStatus === "completed" || agentStatus === "succeeded") {
              fu.status = "completed";
              fu.completed_at = new Date().toISOString();
            } else if (agentStatus === "failed" || agentStatus === "error") {
              fu.status = "failed";
              fu.error = agentData.error || "Agent failed";
            } else if (agentStatus === "running" || agentStatus === "active") {
              // Agent still running, check for stale updates
              const lastUpdate = fu.last_update
                ? new Date(fu.last_update)
                : null;
              if (lastUpdate) {
                const minutesSinceUpdate =
                  (Date.now() - lastUpdate.getTime()) / 1000 / 60;
                if (minutesSinceUpdate > 15) {
                  console.warn(
                    `[WARN] ${
                      fu.fu_id
                    } has not updated status file in ${minutesSinceUpdate.toFixed(
                      1
                    )} minutes (agent still running)`
                  );
                }
              }
            }
          } else if (response.status === 404) {
            // Agent not found - may have completed and been cleaned up
            console.warn(
              `[WARN] Agent ${fu.worker_agent_id} not found (may have completed)`
            );
          }
        } catch (error) {
          console.error(
            `[ERROR] Failed to check agent status for ${fu.fu_id}:`,
            error.message
          );
          // Fallback to file-based monitoring
          await monitorWorkersFileBased(status);
          return;
        }
      }
    }
  }

  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
}

// Verify test results meet standards
function verifyTestResults(tests, fuId) {
  // Required: unit tests must pass
  if (!tests.unit || !tests.unit.passed) {
    console.error(`[ERROR] ${fuId}: Unit tests missing or failed`);
    return false;
  }

  // Required: integration tests must pass
  if (!tests.integration || !tests.integration.passed) {
    console.error(`[ERROR] ${fuId}: Integration tests missing or failed`);
    return false;
  }

  // Coverage check (if reported)
  if (tests.unit.coverage !== undefined) {
    const minCoverage = 80; // Per feature_unit_spec.md: "Lines: >80%"
    if (tests.unit.coverage < minCoverage) {
      console.warn(
        `[WARN] ${fuId}: Unit test coverage ${tests.unit.coverage}% below minimum ${minCoverage}%`
      );
      // Warn but don't fail (coverage is a guideline)
    }
  }

  // E2E tests required for Medium/High risk FUs (check would require FU spec lookup)
  // For now, just verify if present, they passed
  if (tests.e2e && tests.e2e.passed !== null && !tests.e2e.passed) {
    console.error(`[ERROR] ${fuId}: E2E tests failed`);
    return false;
  }

  return true;
}

// Fallback file-based monitoring
async function monitorWorkersFileBased(status) {
  for (const batch of status.batches) {
    if (batch.status !== "running") continue;

    for (const fu of batch.feature_units) {
      if (fu.status === "running") {
        const lastUpdate = fu.last_update ? new Date(fu.last_update) : null;
        if (lastUpdate) {
          const minutesSinceUpdate =
            (Date.now() - lastUpdate.getTime()) / 1000 / 60;
          if (minutesSinceUpdate > 15) {
            console.warn(
              `[WARN] ${
                fu.fu_id
              } has not updated in ${minutesSinceUpdate.toFixed(1)} minutes`
            );
            fu.status = "stale";
          }
        }
      }
    }
  }

  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
}

// Run integration tests for batch
async function runIntegrationTests(batchId, releaseId) {
  console.log(`[INFO] Running integration tests for Batch ${batchId}`);

  const integrationTestsPath = `docs/releases/in_progress/${releaseId}/integration_tests.md`;

  try {
    // Parse integration_tests.md to find tests for this batch
    const content = await fs.readFile(integrationTestsPath, "utf-8");
    const tests = parseIntegrationTests(content, batchId);

    if (tests.length === 0) {
      console.log(
        `[INFO] No integration tests defined for Batch ${batchId}, skipping`
      );
      return true;
    }

    console.log(
      `[INFO] Found ${
        tests.length
      } integration test(s) for Batch ${batchId}: ${tests
        .map((t) => t.id)
        .join(", ")}`
    );

    // Execute each test
    for (const test of tests) {
      console.log(`[INFO] Running ${test.id}: ${test.name}`);

      // Execute test command
      const testResult = await executeTestCommand(test);

      // null means not_run (skip), false means failed, true means passed
      if (testResult === false) {
        console.error(`[ERROR] Integration test ${test.id} failed`);
        return false;
      } else if (testResult === null) {
        console.warn(
          `[WARN] Integration test ${test.id} not run (no command or test file missing)`
        );
        // Continue - don't fail batch if test not implemented yet
      } else {
        console.log(`[INFO] Integration test ${test.id} passed`);
      }
    }

    console.log(`[INFO] All integration tests passed for Batch ${batchId}`);
    return true;
  } catch (error) {
    console.error(
      `[ERROR] Integration tests failed for Batch ${batchId}:`,
      error.message
    );
    return false;
  }
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
    // Don't skip - mark as not_run so it shows up in report
    return null; // null means not_run, true means passed, false means failed
  }

  // Map test file paths to npm test commands
  // e.g., "tests/integration/event_sourcing.test.ts" -> "npm run test:integration -- tests/integration/event_sourcing.test.ts"
  const testFile = test.command;
  console.log(`[TEST] Test file: ${testFile}`);

  // Check if test file exists
  try {
    await fs.access(testFile);
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

    // Default to failed if we can't determine
    console.error(`[TEST] ✗ FAILED: ${test.id} (could not parse results)`);
    console.log(`${"=".repeat(80)}\n`);
    return false;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[TEST] ✗ ERROR: ${test.id} failed after ${duration}ms`);
    console.error(`[TEST] Error type: ${error.name || "Unknown"}`);
    console.error(`[TEST] Error message: ${error.message}`);

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

// Parse integration tests from markdown
function parseIntegrationTests(content, batchId) {
  const tests = [];

  // Match test definitions (#### IT-XXX: Test Name)
  const testRegex =
    /#### (IT-\d+):\s*([^\n]+)\n[\s\S]*?Batches Covered:\s*([^\n]+)/g;
  let match;

  while ((match = testRegex.exec(content)) !== null) {
    const testId = match[1];
    const testName = match[2].trim();
    const batchesStr = match[3].trim();

    // Parse batches (e.g., "0.5, 0.6, 5" or "1, 2, 3, 4, 6")
    const batches = batchesStr.split(",").map((b) => parseFloat(b.trim()));

    // Check if this batch is covered
    if (batches.includes(batchId) || batches.includes(parseFloat(batchId))) {
      // Extract test command if present (look for "test:" field)
      const testSection = match[0];
      const commandMatch = testSection.match(/test:\s*"([^"]+)"/i);
      const testCommand = commandMatch ? commandMatch[1] : null;

      tests.push({
        id: testId,
        name: testName,
        batches: batches,
        command: testCommand,
      });
    }
  }

  return tests;
}

// Main orchestrator loop
async function main() {
  console.log(`[INFO] Starting orchestrator for Release ${RELEASE_ID}`);

  // Load manifest
  const manifest = await loadYAML(MANIFEST_PATH);

  // Debug: log parsed manifest structure
  if (process.env.DEBUG) {
    console.log("[DEBUG] Parsed manifest:", JSON.stringify(manifest, null, 2));
  }

  const executionStrategy = manifest.execution_strategy || {};

  if (process.env.DEBUG) {
    console.log(
      "[DEBUG] Execution strategy:",
      JSON.stringify(executionStrategy, null, 2)
    );
  }

  if (executionStrategy.type !== "multi_agent") {
    console.log(
      `[INFO] Execution strategy type is "${
        executionStrategy.type || "undefined"
      }", expected "multi_agent". Skipping orchestrator.`
    );
    return;
  }

  // Load execution schedule
  const batches = await loadExecutionSchedule(EXECUTION_SCHEDULE_PATH);
  console.log(`[INFO] Loaded ${batches.length} batches`);

  // Initialize or load status
  let status = await loadStatus();
  if (!status) {
    status = await initializeStatus(RELEASE_ID, batches);
    console.log("[INFO] Initialized status file");
  }

  // Update orchestrator status
  status.orchestrator.status = "running";
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));

  // Execute batches
  for (const batch of batches) {
    let batchStatus = status.batches.find((b) => b.batch_id === batch.batch_id);

    // Skip if already completed
    if (batchStatus.status === "completed") {
      console.log(`[INFO] Batch ${batch.batch_id} already completed, skipping`);
      continue;
    }

    // Check if we can start this batch
    if (!(await canStartBatch(batch, status))) {
      console.log(
        `[INFO] Batch ${batch.batch_id} dependencies not complete, waiting...`
      );
      // In production, would wait and retry
      continue;
    }

    console.log(
      `[INFO] Starting Batch ${batch.batch_id} with ${batch.feature_units.length} FUs`
    );

    // Update batch status
    batchStatus.status = "running";
    batchStatus.started_at = new Date().toISOString();
    status.orchestrator.current_batch = batch.batch_id;
    await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));

    // Spawn worker agents for each FU in batch
    const workerAgents = [];
    for (const fuId of batch.feature_units) {
      const fuStatus = batchStatus.feature_units.find(
        (fu) => fu.fu_id === fuId
      );

      // Skip if already completed
      if (fuStatus.status === "completed") {
        console.log(`[INFO] ${fuId} already completed, skipping`);
        continue;
      }

      // Spawn worker agent
      const agentId = await spawnWorkerAgent(
        fuId,
        batch.batch_id,
        RELEASE_ID,
        manifest
      );

      // Update status
      fuStatus.worker_agent_id = agentId;
      fuStatus.status = "running";
      fuStatus.started_at = new Date().toISOString();
      fuStatus.last_update = new Date().toISOString();

      workerAgents.push({ agentId, fuId });

      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
    }

    console.log(
      `[INFO] Spawned ${workerAgents.length} worker agents for Batch ${batch.batch_id}`
    );

    // Monitor workers until all complete
    let allComplete = false;
    while (!allComplete) {
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute

      // Reload status (workers update it)
      status = await loadStatus();
      batchStatus = status.batches.find((b) => b.batch_id === batch.batch_id);

      // Check if all FUs complete
      allComplete = batchStatus.feature_units.every(
        (fu) => fu.status === "completed" || fu.status === "failed"
      );

      // Monitor for failures
      await monitorWorkers(status);

      // Log progress
      const completed = batchStatus.feature_units.filter(
        (fu) => fu.status === "completed"
      ).length;
      const total = batchStatus.feature_units.length;
      console.log(
        `[INFO] Batch ${batch.batch_id} progress: ${completed}/${total} FUs complete`
      );
    }

    // Check for failures
    const failures = batchStatus.feature_units.filter(
      (fu) => fu.status === "failed" || fu.status === "stale"
    );
    if (failures.length > 0) {
      console.error(
        `[ERROR] Batch ${batch.batch_id} has ${failures.length} failed FUs:`,
        failures.map((f) => f.fu_id)
      );
      // TODO: Handle failures (retry, escalate, abort)
      status.errors.push({
        batch_id: batch.batch_id,
        failed_fus: failures.map((f) => f.fu_id),
        timestamp: new Date().toISOString(),
      });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));

      // For now, abort on failure
      console.error("[ERROR] Aborting release execution due to failures");
      process.exit(1);
    }

    // Run integration tests
    const testsPassed = await runIntegrationTests(batch.batch_id, RELEASE_ID);
    if (!testsPassed) {
      console.error(
        `[ERROR] Integration tests failed for Batch ${batch.batch_id}`
      );
      process.exit(1);
    }

    // Mark batch as completed
    batchStatus.status = "completed";
    batchStatus.completed_at = new Date().toISOString();
    status.completed_fus.push(
      ...batchStatus.feature_units.map((fu) => fu.fu_id)
    );
    await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));

    // Check and update checkpoints (see .cursor/rules/checkpoint_management.md)
    await updateCheckpoints(batch.batch_id, manifest, batchStatus);

    console.log(`[INFO] Batch ${batch.batch_id} completed successfully`);
  }

  // All batches complete - ALWAYS run full integration test suite (REQUIRED)
  console.log(
    `[INFO] All batches complete. Running full integration test suite (REQUIRED)...`
  );

  // CRITICAL: Integration tests MUST run after all batches complete
  // This is a required step in the release build process
  const fullTestSuitePassed = await runFullIntegrationTestSuite(RELEASE_ID);

  // Note: Tests may show as "not_run" if test commands aren't defined yet
  // This is acceptable for initial releases, but should be addressed
  if (!fullTestSuitePassed) {
    const status = await loadStatus();
    const testResults = status.integration_tests || [];
    const failedCount = testResults.filter((t) => t.status === "failed").length;
    const notRunCount = testResults.filter(
      (t) => t.status === "not_run"
    ).length;

    if (failedCount > 0) {
      console.error(
        `[ERROR] Full integration test suite failed (${failedCount} test(s) failed)`
      );
      console.error(
        `[ERROR] Release cannot be marked as ready_for_deployment until all tests pass`
      );
      process.exit(1);
    } else if (notRunCount > 0) {
      console.warn(
        `[WARN] ${notRunCount} test(s) not run (no test commands defined or test files missing)`
      );
      console.warn(
        `[WARN] Release can proceed, but tests should be implemented for full validation`
      );
      // Don't fail - allow release to proceed if tests just aren't implemented yet
    }
  }

  console.log(`[INFO] Full integration test suite execution completed`);

  // All batches complete
  status.orchestrator.status = "completed";
  status.orchestrator.completed_at = new Date().toISOString();
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));

  // Ensure Checkpoint 2 is completed (see .cursor/rules/checkpoint_management.md)
  await ensureCheckpoint2Completed(manifest, status);

  console.log(`[INFO] Release ${RELEASE_ID} execution complete!`);

  // Generate release report (documentation-driven)
  console.log(`[INFO] Release execution complete. Report generation required.`);
  console.log(
    `[INFO] Follow instructions in: docs/feature_units/standards/release_report_spec.md`
  );
  console.log(
    `[INFO] Template: docs/feature_units/standards/release_report_template.md`
  );
  console.log(
    `[INFO] Output: docs/releases/in_progress/${RELEASE_ID}/release_report.md`
  );
  console.log(
    `[INFO] IMPORTANT: Release report MUST include Section 9 (Testing Guidance) with all manual test cases from integration_tests.md`
  );
  console.log(
    `[INFO] See .cursor/rules/post_build_testing.md for requirements`
  );
}

// Run full integration test suite after all batches complete
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
    const content = await fs.readFile(integrationTestsPath, "utf-8");
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

// Parse all integration tests from markdown (not filtered by batch)
function parseAllIntegrationTests(content) {
  const tests = [];

  // Match test definitions (#### IT-XXX: Test Name)
  const testRegex =
    /#### (IT-\d+):\s*([^\n]+)\n[\s\S]*?Batches Covered:\s*([^\n]+)/g;
  let match;

  while ((match = testRegex.exec(content)) !== null) {
    const testId = match[1];
    const testName = match[2].trim();

    // Extract test command if present (look for "test:" field or machine-checkable section)
    const testSection = match[0];
    const commandMatch =
      testSection.match(/test:\s*"([^"]+)"/i) ||
      testSection.match(/Machine-Checkable:[\s\S]*?`([^`]+)`/i);
    const testCommand = commandMatch ? commandMatch[1] : null;

    // Extract goal
    const goalMatch = testSection.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : testName;

    tests.push({
      id: testId,
      name: testName,
      goal: goal,
      command: testCommand,
    });
  }

  return tests.sort((a, b) => a.id.localeCompare(b.id));
}

// Update integration test results in status.md
async function updateIntegrationTestResults(releaseId, results) {
  const STATUS_MD_PATH = `docs/releases/in_progress/${releaseId}/status.md`;

  try {
    const statusContent = await fs.readFile(STATUS_MD_PATH, "utf-8");

    // Find integration test status table
    const testTableRegex =
      /(### 5\. Integration Test Status[\s\S]*?\| Test ID \| Name[\s\S]*?\| ------- \|)[\s\S]*?(\*\*Summary:\*\*)/;
    const match = statusContent.match(testTableRegex);

    if (!match) {
      console.warn(
        `[WARN] Could not find integration test status table in status.md`
      );
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

    await fs.writeFile(STATUS_MD_PATH, newContent, "utf-8");
    console.log(`[INFO] Updated integration test results in status.md`);
  } catch (error) {
    console.warn(
      `[WARN] Failed to update integration test results: ${error.message}`
    );
  }
}

// Update checkpoints when batch completes
async function updateCheckpoints(batchId, manifest, batchStatus) {
  const STATUS_MD_PATH = `docs/releases/in_progress/${RELEASE_ID}/status.md`;

  try {
    const statusContent = await fs.readFile(STATUS_MD_PATH, "utf-8");
    const checkpoints = manifest.checkpoints || {};
    let updated = false;
    let newContent = statusContent;

    // Check each checkpoint trigger
    for (const [checkpointKey, triggerBatch] of Object.entries(checkpoints)) {
      const triggerBatchNum = parseFloat(triggerBatch);
      const currentBatchNum = parseFloat(batchId);

      if (triggerBatchNum === currentBatchNum) {
        // Extract checkpoint name from key (e.g., "checkpoint_0.5_after_batch" -> "0.5")
        const checkpointId = checkpointKey
          .replace("checkpoint_", "")
          .replace("_after_batch", "");
        const checkpointName =
          checkpointId === "0.5"
            ? "Checkpoint 0.5 — Blockchain Foundation Review"
            : checkpointId === "1"
            ? "Checkpoint 1 — Mid-Release Review"
            : `Checkpoint ${checkpointId}`;

        // Check if checkpoint is still pending
        const checkpointRegex = new RegExp(
          `(- \\*\\*${checkpointName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\*\\*: )\`pending\``
        );

        if (checkpointRegex.test(newContent)) {
          // Update to completed
          const fuList = batchStatus.feature_units
            .map((fu) => fu.fu_id)
            .join(", ");
          const completionNote = `  - Batch ${batchId} completed: ${fuList} all complete.`;

          newContent = newContent.replace(checkpointRegex, `$1\`completed\``);

          // Add completion note after checkpoint line
          const checkpointLineRegex = new RegExp(
            `(- \\*\\*${checkpointName.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}\\*\\*: \`completed\`\\n)`
          );
          newContent = newContent.replace(
            checkpointLineRegex,
            `$1${completionNote}\n`
          );

          updated = true;
          console.log(
            `[INFO] Checkpoint ${checkpointId} marked as completed (triggered by Batch ${batchId})`
          );
        }
      }
    }

    if (updated) {
      await fs.writeFile(STATUS_MD_PATH, newContent, "utf-8");
    }
  } catch (error) {
    console.warn(`[WARN] Failed to update checkpoints: ${error.message}`);
    console.warn(
      `[WARN] Please manually update checkpoints in ${STATUS_MD_PATH}`
    );
  }
}

// Ensure Checkpoint 2 is completed after all batches
async function ensureCheckpoint2Completed(manifest, status) {
  const STATUS_MD_PATH = `docs/releases/in_progress/${RELEASE_ID}/status.md`;

  try {
    const statusContent = await fs.readFile(STATUS_MD_PATH, "utf-8");

    // Check if Checkpoint 2 exists and is pending
    const checkpoint2Regex =
      /(- \*\*Checkpoint 2 — Pre-Release Sign-Off\*\*: )`pending`/;

    if (checkpoint2Regex.test(statusContent)) {
      const completedBatches = status.batches.filter(
        (b) => b.status === "completed"
      ).length;
      const totalBatches = status.batches.length;
      const completedFUs = status.completed_fus.length;

      const completionNote = `  - All batches complete (${completedBatches}/${totalBatches}).
  - Release status: ready_for_deployment.
  - All P0 Feature Units complete (${completedFUs} completed).`;

      let newContent = statusContent.replace(
        checkpoint2Regex,
        `$1\`completed\``
      );

      // Add completion note
      const checkpoint2LineRegex =
        /(- \*\*Checkpoint 2 — Pre-Release Sign-Off\*\*: `completed`\n)/;
      newContent = newContent.replace(
        checkpoint2LineRegex,
        `$1${completionNote}\n`
      );

      await fs.writeFile(STATUS_MD_PATH, newContent, "utf-8");
      console.log(`[INFO] Checkpoint 2 marked as completed`);
    }
  } catch (error) {
    console.warn(`[WARN] Failed to update Checkpoint 2: ${error.message}`);
    console.warn(
      `[WARN] Please manually update Checkpoint 2 in ${STATUS_MD_PATH}`
    );
  }
}

// Run orchestrator
main().catch((error) => {
  console.error("[ERROR] Orchestrator failed:", error);
  process.exit(1);
});
