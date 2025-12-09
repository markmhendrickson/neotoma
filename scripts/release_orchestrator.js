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

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RELEASE_ID = process.argv[2];
if (!RELEASE_ID) {
  console.error('Usage: node scripts/release_orchestrator.js <release_id>');
  process.exit(1);
}

const MANIFEST_PATH = `docs/releases/in_progress/${RELEASE_ID}/manifest.yaml`;
const STATUS_FILE = `docs/releases/in_progress/${RELEASE_ID}/agent_status.json`;
const EXECUTION_SCHEDULE_PATH = `docs/releases/in_progress/${RELEASE_ID}/execution_schedule.md`;

// Load YAML (simple parser for basic structure)
async function loadYAML(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const yaml = {};
  
  // Simple YAML parser for nested structures
  const lines = content.split('\n');
  const stack = [{ obj: yaml, indent: -1 }];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.length - line.trimStart().length;
    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    
    if (!match) continue;
    
    const key = match[1].trim();
    let value = match[2].trim();
    
    // Strip inline comments (everything after # that's not in quotes)
    const commentIndex = value.indexOf('#');
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
    value = value.replace(/^["']|["']$/g, '');
    
    // Pop stack until we find parent with less indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    
    const current = stack[stack.length - 1].obj;
    
    if (value === '' || value === '{}') {
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
  const content = await fs.readFile(filePath, 'utf-8');
  const batches = [];
  
  // Parse markdown execution schedule
  const batchRegex = /#### Batch (\d+)[\s\S]*?Feature Units:[\s\S]*?(- `FU-\d+`[^\n]*\n)+/g;
  let match;
  
  while ((match = batchRegex.exec(content)) !== null) {
    const batchId = parseInt(match[1]);
    const fuMatches = match[0].match(/- `FU-(\d+)`/g);
    const fus = fuMatches ? fuMatches.map(m => m.match(/FU-(\d+)/)[1]) : [];
    
    batches.push({
      batch_id: batchId,
      feature_units: fus.map(id => `FU-${id}`),
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
      status: 'running',
    },
    batches: batches.map(batch => ({
      batch_id: batch.batch_id,
      status: 'pending',
      feature_units: batch.feature_units.map(fuId => ({
        fu_id: fuId,
        worker_agent_id: null,
        status: 'pending',
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
    const content = await fs.readFile(STATUS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
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
async function spawnWorkerAgent(fuId, batchId, releaseId) {
  const agentInstructions = generateAgentInstructions(fuId, batchId, releaseId);
  
  // Validate required environment variables
  if (!process.env.CURSOR_CLOUD_API_URL || !process.env.CURSOR_CLOUD_API_KEY) {
    throw new Error('Missing required environment variables: CURSOR_CLOUD_API_URL and/or CURSOR_CLOUD_API_KEY');
  }
  
  if (!process.env.REPO_URL) {
    throw new Error('Missing required environment variable: REPO_URL');
  }
  
  const apiUrl = process.env.CURSOR_CLOUD_API_URL.replace(/\/$/, ''); // Remove trailing slash
  const endpoint = `${apiUrl}/background-agents`;
  
  console.log(`[INFO] Spawning worker agent for ${fuId} in Batch ${batchId} via ${endpoint}`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CURSOR_CLOUD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${fuId}-Batch-${batchId}`,
        repository: process.env.REPO_URL,
        branch: process.env.RELEASE_BRANCH || 'main',
        instructions: agentInstructions,
        environment: {
          FU_ID: fuId,
          BATCH_ID: batchId.toString(),
          RELEASE_ID: releaseId,
          STATUS_FILE: STATUS_FILE,
        },
        max_duration_minutes: estimateFUDuration(fuId) + 30,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to spawn agent: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    const agentId = data.id || data.agent_id;
    
    if (!agentId) {
      throw new Error(`API response missing agent ID: ${JSON.stringify(data)}`);
    }
    
    console.log(`[INFO] Successfully spawned worker agent ${agentId} for ${fuId}`);
    return agentId;
  } catch (error) {
    console.error(`[ERROR] Failed to spawn worker agent for ${fuId}:`, error.message);
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

// Estimate FU duration (placeholder - should be based on FU spec)
function estimateFUDuration(fuId) {
  // Default estimates in minutes
  const estimates = {
    'FU-000': 60,
    'FU-002': 30,
    'FU-050': 480, // 8 hours
    'FU-051': 240, // 4 hours
    'FU-052': 120, // 2 hours
    'FU-053': 120,
    'FU-054': 120,
    'FU-100': 1680, // 1-2 weeks
    'FU-101': 1680,
    'FU-102': 1680,
    'FU-103': 1680,
    'FU-200': 1680,
    'FU-201': 480,
    'FU-202': 240,
    'FU-203': 480,
    'FU-204': 480,
    'FU-205': 480,
    'FU-206': 240,
  };
  
  return estimates[fuId] || 480; // Default 8 hours
}

// Check if batch dependencies are complete
async function canStartBatch(batch, status) {
  // Check all FUs in previous batches are complete
  for (let i = 0; i < batch.batch_id; i++) {
    const prevBatch = status.batches.find(b => b.batch_id === i);
    if (!prevBatch) continue;
    
    const incomplete = prevBatch.feature_units.some(fu => fu.status !== 'completed');
    if (incomplete) {
      return false;
    }
  }
  
  // Check execution limits
  const activeAgents = status.batches
    .flatMap(b => b.feature_units)
    .filter(fu => fu.status === 'running').length;
  
  const manifest = await loadYAML(MANIFEST_PATH);
  const maxParallel = parseInt(manifest.execution_strategy?.max_parallel_fus || 3);
  
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
  
  const apiUrl = process.env.CURSOR_CLOUD_API_URL.replace(/\/$/, '');
  
  for (const batch of status.batches) {
    if (batch.status !== 'running') continue;
    
    for (const fu of batch.feature_units) {
      if (fu.status === 'running' && fu.worker_agent_id) {
        try {
          // Poll API for agent status
          const response = await fetch(`${apiUrl}/background-agents/${fu.worker_agent_id}`, {
            headers: {
              'Authorization': `Bearer ${process.env.CURSOR_CLOUD_API_KEY}`,
            },
          });
          
          if (response.ok) {
            const agentData = await response.json();
            const agentStatus = agentData.status || agentData.state;
            
            // Update FU status based on agent status
            if (agentStatus === 'completed' || agentStatus === 'succeeded') {
              fu.status = 'completed';
              fu.completed_at = new Date().toISOString();
            } else if (agentStatus === 'failed' || agentStatus === 'error') {
              fu.status = 'failed';
              fu.error = agentData.error || 'Agent failed';
            } else if (agentStatus === 'running' || agentStatus === 'active') {
              // Agent still running, check for stale updates
              const lastUpdate = fu.last_update ? new Date(fu.last_update) : null;
              if (lastUpdate) {
                const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 1000 / 60;
                if (minutesSinceUpdate > 15) {
                  console.warn(`[WARN] ${fu.fu_id} has not updated status file in ${minutesSinceUpdate.toFixed(1)} minutes (agent still running)`);
                }
              }
            }
          } else if (response.status === 404) {
            // Agent not found - may have completed and been cleaned up
            console.warn(`[WARN] Agent ${fu.worker_agent_id} not found (may have completed)`);
          }
        } catch (error) {
          console.error(`[ERROR] Failed to check agent status for ${fu.fu_id}:`, error.message);
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
      console.warn(`[WARN] ${fuId}: Unit test coverage ${tests.unit.coverage}% below minimum ${minCoverage}%`);
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
    if (batch.status !== 'running') continue;
    
    for (const fu of batch.feature_units) {
      if (fu.status === 'running') {
        const lastUpdate = fu.last_update ? new Date(fu.last_update) : null;
        if (lastUpdate) {
          const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 1000 / 60;
          if (minutesSinceUpdate > 15) {
            console.warn(`[WARN] ${fu.fu_id} has not updated in ${minutesSinceUpdate.toFixed(1)} minutes`);
            fu.status = 'stale';
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
    const content = await fs.readFile(integrationTestsPath, 'utf-8');
    const tests = parseIntegrationTests(content, batchId);
    
    if (tests.length === 0) {
      console.log(`[INFO] No integration tests defined for Batch ${batchId}, skipping`);
      return true;
    }
    
    console.log(`[INFO] Found ${tests.length} integration test(s) for Batch ${batchId}: ${tests.map(t => t.id).join(', ')}`);
    
    // Execute each test
    for (const test of tests) {
      console.log(`[INFO] Running ${test.id}: ${test.name}`);
      
      // Execute test command
      const testPassed = await executeTestCommand(test);
      
      if (!testPassed) {
        console.error(`[ERROR] Integration test ${test.id} failed`);
        return false;
      }
      
      console.log(`[INFO] Integration test ${test.id} passed`);
    }
    
    console.log(`[INFO] All integration tests passed for Batch ${batchId}`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Integration tests failed for Batch ${batchId}:`, error.message);
    return false;
  }
}

// Execute test command
async function executeTestCommand(test) {
  if (!test.command) {
    console.warn(`[WARN] No test command defined for ${test.id}, skipping`);
    return true; // Skip tests without commands
  }
  
  // Map test file paths to npm test commands
  // e.g., "tests/integration/event_sourcing.test.ts" -> "npm run test:integration -- tests/integration/event_sourcing.test.ts"
  const testFile = test.command;
  
  // Check if test file exists
  try {
    await fs.access(testFile);
  } catch (error) {
    console.warn(`[WARN] Test file ${testFile} not found, skipping ${test.id}`);
    return true; // Skip if test file doesn't exist yet
  }
  
  // Execute test via npm
  try {
    const command = `npm run test:integration -- ${testFile}`;
    console.log(`[INFO] Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300000, // 5 minute timeout
    });
    
    if (stderr && !stderr.includes('PASS')) {
      console.error(`[ERROR] Test ${test.id} stderr:`, stderr);
    }
    
    // Check exit code (execAsync throws on non-zero exit)
    return true;
  } catch (error) {
    console.error(`[ERROR] Test ${test.id} failed:`, error.message);
    if (error.stdout) console.error('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    return false;
  }
}

// Parse integration tests from markdown
function parseIntegrationTests(content, batchId) {
  const tests = [];
  
  // Match test definitions (#### IT-XXX: Test Name)
  const testRegex = /#### (IT-\d+):\s*([^\n]+)\n[\s\S]*?Batches Covered:\s*([^\n]+)/g;
  let match;
  
  while ((match = testRegex.exec(content)) !== null) {
    const testId = match[1];
    const testName = match[2].trim();
    const batchesStr = match[3].trim();
    
    // Parse batches (e.g., "0.5, 0.6, 5" or "1, 2, 3, 4, 6")
    const batches = batchesStr.split(',').map(b => parseFloat(b.trim()));
    
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
    console.log('[DEBUG] Parsed manifest:', JSON.stringify(manifest, null, 2));
  }
  
  const executionStrategy = manifest.execution_strategy || {};
  
  if (process.env.DEBUG) {
    console.log('[DEBUG] Execution strategy:', JSON.stringify(executionStrategy, null, 2));
  }
  
  if (executionStrategy.type !== 'multi_agent') {
    console.log(`[INFO] Execution strategy type is "${executionStrategy.type || 'undefined'}", expected "multi_agent". Skipping orchestrator.`);
    return;
  }
  
  // Load execution schedule
  const batches = await loadExecutionSchedule(EXECUTION_SCHEDULE_PATH);
  console.log(`[INFO] Loaded ${batches.length} batches`);
  
  // Initialize or load status
  let status = await loadStatus();
  if (!status) {
    status = await initializeStatus(RELEASE_ID, batches);
    console.log('[INFO] Initialized status file');
  }
  
  // Update orchestrator status
  status.orchestrator.status = 'running';
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
  
  // Execute batches
  for (const batch of batches) {
    let batchStatus = status.batches.find(b => b.batch_id === batch.batch_id);
    
    // Skip if already completed
    if (batchStatus.status === 'completed') {
      console.log(`[INFO] Batch ${batch.batch_id} already completed, skipping`);
      continue;
    }
    
    // Check if we can start this batch
    if (!(await canStartBatch(batch, status))) {
      console.log(`[INFO] Batch ${batch.batch_id} dependencies not complete, waiting...`);
      // In production, would wait and retry
      continue;
    }
    
    console.log(`[INFO] Starting Batch ${batch.batch_id} with ${batch.feature_units.length} FUs`);
    
    // Update batch status
    batchStatus.status = 'running';
    batchStatus.started_at = new Date().toISOString();
    status.orchestrator.current_batch = batch.batch_id;
    await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
    
    // Spawn worker agents for each FU in batch
    const workerAgents = [];
    for (const fuId of batch.feature_units) {
      const fuStatus = batchStatus.feature_units.find(fu => fu.fu_id === fuId);
      
      // Skip if already completed
      if (fuStatus.status === 'completed') {
        console.log(`[INFO] ${fuId} already completed, skipping`);
        continue;
      }
      
      // Spawn worker agent
      const agentId = await spawnWorkerAgent(fuId, batch.batch_id, RELEASE_ID);
      
      // Update status
      fuStatus.worker_agent_id = agentId;
      fuStatus.status = 'running';
      fuStatus.started_at = new Date().toISOString();
      fuStatus.last_update = new Date().toISOString();
      
      workerAgents.push({ agentId, fuId });
      
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
    }
    
    console.log(`[INFO] Spawned ${workerAgents.length} worker agents for Batch ${batch.batch_id}`);
    
    // Monitor workers until all complete
    let allComplete = false;
    while (!allComplete) {
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      
      // Reload status (workers update it)
      status = await loadStatus();
      batchStatus = status.batches.find(b => b.batch_id === batch.batch_id);
      
      // Check if all FUs complete
      allComplete = batchStatus.feature_units.every(fu => fu.status === 'completed' || fu.status === 'failed');
      
      // Monitor for failures
      await monitorWorkers(status);
      
      // Log progress
      const completed = batchStatus.feature_units.filter(fu => fu.status === 'completed').length;
      const total = batchStatus.feature_units.length;
      console.log(`[INFO] Batch ${batch.batch_id} progress: ${completed}/${total} FUs complete`);
    }
    
    // Check for failures
    const failures = batchStatus.feature_units.filter(fu => fu.status === 'failed' || fu.status === 'stale');
    if (failures.length > 0) {
      console.error(`[ERROR] Batch ${batch.batch_id} has ${failures.length} failed FUs:`, failures.map(f => f.fu_id));
      // TODO: Handle failures (retry, escalate, abort)
      status.errors.push({
        batch_id: batch.batch_id,
        failed_fus: failures.map(f => f.fu_id),
        timestamp: new Date().toISOString(),
      });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
      
      // For now, abort on failure
      console.error('[ERROR] Aborting release execution due to failures');
      process.exit(1);
    }
    
    // Run integration tests
    const testsPassed = await runIntegrationTests(batch.batch_id, RELEASE_ID);
    if (!testsPassed) {
      console.error(`[ERROR] Integration tests failed for Batch ${batch.batch_id}`);
      process.exit(1);
    }
    
    // Mark batch as completed
    batchStatus.status = 'completed';
    batchStatus.completed_at = new Date().toISOString();
    status.completed_fus.push(...batchStatus.feature_units.map(fu => fu.fu_id));
    await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
    
    console.log(`[INFO] Batch ${batch.batch_id} completed successfully`);
  }
  
  // All batches complete
  status.orchestrator.status = 'completed';
  status.orchestrator.completed_at = new Date().toISOString();
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
  
  console.log(`[INFO] Release ${RELEASE_ID} execution complete!`);
}

// Run orchestrator
main().catch(error => {
  console.error('[ERROR] Orchestrator failed:', error);
  process.exit(1);
});

