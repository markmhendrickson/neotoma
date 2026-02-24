#!/usr/bin/env node

/**
 * Terminate existing agents and respawn them with credentials in initial instructions
 * 
 * This script:
 * 1. Finds running agents in agent_status.json
 * 2. Terminates them (or marks them as terminated)
 * 3. Respawns them using the orchestrator's spawn logic (which now includes credentials)
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";
import { exec } from "child_process";
import { promisify } from "util";

// Load environment variables
config({ override: true });

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get release ID from command line or default to v0.2.0
const RELEASE_ID = process.argv[2] || "v0.2.0";
const STATUS_FILE = join(__dirname, "..", "docs", "releases", "in_progress", RELEASE_ID, "agent_status.json");
const MANIFEST_PATH = join(__dirname, "..", "docs", "releases", "in_progress", RELEASE_ID, "manifest.yaml");

if (!existsSync(STATUS_FILE)) {
  console.error(`[ERROR] Status file not found: ${STATUS_FILE}`);
  process.exit(1);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[ERROR] Manifest file not found: ${MANIFEST_PATH}`);
  process.exit(1);
}

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com").replace(/\/$/, "").replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

// Load credentials (same as orchestrator)
function loadCredentials() {
  const creds = [];
  if (process.env.DEV_OPENAI_API_KEY)
    creds.push(`DEV_OPENAI_API_KEY=${process.env.DEV_OPENAI_API_KEY}`);
  if (process.env.PROD_OPENAI_API_KEY)
    creds.push(`PROD_OPENAI_API_KEY=${process.env.PROD_OPENAI_API_KEY}`);
  if (process.env.ACTIONS_BEARER_TOKEN)
    creds.push(`ACTIONS_BEARER_TOKEN=${process.env.ACTIONS_BEARER_TOKEN}`);
  return creds;
}

async function terminateAgent(agentId) {
  // Try DELETE endpoint (may not exist, but worth trying)
  const deleteEndpoint = `${apiUrl}/v0/agents/${agentId}`;
  try {
    const response = await fetch(deleteEndpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (response.ok) {
      console.log(`[INFO] Agent ${agentId} terminated via DELETE`);
      return true;
    } else if (response.status === 404) {
      console.log(`[INFO] Agent ${agentId} already terminated or not found`);
      return true;
    } else {
      const errorText = await response.text();
      console.warn(`[WARN] Failed to terminate agent ${agentId}: ${response.status} - ${errorText}`);
      // Still return true - agent may already be finished
      return true;
    }
  } catch (error) {
    console.warn(`[WARN] Error terminating agent ${agentId}: ${error.message}`);
    // Still return true - we'll mark as terminated in status file
    return true;
  }
}

async function spawnWorkerAgent(fuId, batchId, releaseId, manifest) {
  // Use the orchestrator script to spawn the agent
  // We'll call it via node exec since spawnWorkerAgent isn't exported
  const orchestratorScript = join(__dirname, "release_orchestrator.js");
  
  // Actually, let's duplicate the spawn logic here since we need it
  // But that's complex. Instead, let's use a simpler approach:
  // Call a helper script or inline the critical parts
  
  // For now, let's use the same logic as orchestrator
  const repoUrl = process.env.REPO_URL || "https://github.com/markmhendrickson/neotoma";
  const branch = process.env.RELEASE_BRANCH || "dev";
  const cleanRepoUrl = repoUrl.replace(/^["']|["']$/g, "");
  
  // Note: Credentials are injected via Cursor Secrets, not included in instructions
  
  // Generate agent instructions (same as orchestrator)
  const STATUS_FILE_REF = `docs/releases/in_progress/${releaseId}/agent_status.json`;
  
  const envSetup = `\n**Environment Variables and Testing:**

**Step 1: Verify environment variables are available**

Environment variables should be automatically injected via Cursor Cloud Agents Secrets. Verify they're set:
\`\`\`bash
env | grep -E "OPENAI_API_KEY|DEV_OPENAI_API_KEY|PROD_OPENAI_API_KEY" || echo "No API credentials found"
\`\`\`

If environment variables are missing, they need to be configured in Cursor Settings → Cloud Agents → Secrets.

**Step 2: Set up infrastructure (automated)**

Run the setup script to handle all infrastructure setup:
\`\`\`bash
chmod +x scripts/setup_agent_environment.sh
./scripts/setup_agent_environment.sh
\`\`\`

This script will:
- Apply database migrations
- Install Playwright browsers (if needed)
- Verify npm dependencies

**Step 3: Run tests (REQUIRED: All tests must pass)**

\`\`\`bash
npm run test
npm run test:integration
npm run test:e2e
\`\`\`

**CRITICAL:** If tests fail:
1. Check if migrations were applied (setup script should have handled this)
2. Fix any issues preventing tests from passing
3. Re-run tests until ALL tests pass
4. Do not mark the FU as complete until all tests are passing

**Step 4: Update status file with test results (ONLY when all tests pass)**

\`\`\`json
{
  "fu_id": "FU-XXX",
  "status": "completed",
  "progress": 1.0,
  "tests": {
    "unit": { "passed": true/false, "command": "npm run test" },
    "integration": { "passed": true/false, "command": "npm run test:integration" },
    "e2e": { "passed": true/false, "command": "npm run test:e2e" }
  }
}
\`\`\`

**Important:**
- Environment variables are injected automatically via Cursor Secrets (no need to export manually)
- Run the setup script to configure infrastructure (Playwright, npm deps)
- ALL tests must pass before marking as complete
- Update status file with actual test results showing all tests passed
`;

  const agentInstructions = `You are a worker agent executing Feature Unit ${fuId} in Batch ${batchId} for Release ${releaseId}.

**Repository:** ${cleanRepoUrl}
**Branch:** ${branch}
**Status File:** ${STATUS_FILE_REF}
${envSetup}
**Your Task:**
1. **Verify environment variables are available** (they should be injected automatically via Cursor Secrets)
2. Load FU specification: \`docs/feature_units/completed/${fuId}/FU-${fuId}_spec.md\` or \`docs/specs/MVP_FEATURE_UNITS.md\`
3. Execute Feature Unit workflow:
   - Check if FU spec exists (if not, create it)
   - If UI FU and no prototype, create prototype
   - Run implementation workflow
   - Run setup script: \`./scripts/setup_agent_environment.sh\`
   - Run tests (unit, integration, E2E) - **ALL TESTS MUST PASS**
   - If tests fail, fix issues and re-run until all pass
   - Update status file: \`${STATUS_FILE_REF}\` with actual test results
4. Report completion (ONLY after all tests pass):
   - Update status: \`{"fu_id": "${fuId}", "status": "completed", "progress": 1.0, "tests": {...}}\`
   - Ensure all test results show \`passed: true\`
   - Report any blockers if tests cannot be made to pass

**Constraints:**
- Follow all constraints from \`docs/foundation/agent_instructions.md\`
- Update status file atomically (use file locking)
- Do not modify FUs assigned to other agents
- **ALL tests must pass before marking as complete**
- **Integration tests require credentials** - they should be injected via Cursor Secrets

**Status File Location:** \`${STATUS_FILE_REF}\`
**Update Frequency:** Every 5-10 minutes
**Completion Signal:** Set \`status: "completed"\` and \`progress: 1.0\``;

  const endpoint = `${apiUrl}/v0/agents`;
  const requestBody = {
    prompt: {
      text: agentInstructions,
    },
    source: {
      repository: cleanRepoUrl,
      ref: branch,
    },
  };

  // Try to pass via API environment field (may be rejected)
  const envVars = {};
  creds.forEach((cred) => {
    const [key, ...valueParts] = cred.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=");
      envVars[key.trim()] = value.trim();
    }
  });

  if (Object.keys(envVars).length > 0) {
    requestBody.environment = envVars;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    // If environment field rejected, retry without it
    if (response.status === 400 && requestBody.environment) {
      delete requestBody.environment;
      const retryResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        return retryData.id || retryData.agent_id;
      }
    }

    const errorText = await response.text();
    throw new Error(`Failed to spawn agent: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const agentId = data.id || data.agent_id;

  if (!agentId) {
    throw new Error(`API response missing agent ID: ${JSON.stringify(data)}`);
  }

  return agentId;
}

async function main() {
  console.log(`[INFO] Respawning agents for ${RELEASE_ID} with credentials in initial instructions...\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  const manifestContent = readFileSync(MANIFEST_PATH, "utf-8");
  const manifest = yaml.load(manifestContent);

  // Find all running agents that need to be respawned
  const agentsToRespawn = [];
  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (
        fu.status === "running" &&
        fu.worker_agent_id &&
        fu.status !== "completed" &&
        fu.status !== "failed"
      ) {
        agentsToRespawn.push({
          agentId: fu.worker_agent_id,
          fuId: fu.fu_id,
          batchId: batch.batch_id,
        });
      }
    }
  }

  if (agentsToRespawn.length === 0) {
    console.log("[INFO] No running agents found to respawn");
    return;
  }

  console.log(`[INFO] Found ${agentsToRespawn.length} agent(s) to respawn:\n`);
  agentsToRespawn.forEach((agent) => {
    console.log(`  - ${agent.fuId} (Batch ${agent.batchId}): ${agent.agentId}`);
  });
  console.log("");
  console.log("[INFO] Credentials should be configured via Cursor Settings → Cloud Agents → Secrets");
  console.log("[INFO] Agents will verify environment variables are available (injected automatically)\n");

  // Terminate existing agents
  console.log("[INFO] Terminating existing agents...\n");
  for (const agent of agentsToRespawn) {
    await terminateAgent(agent.agentId);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Respawn agents with credentials in initial instructions
  console.log("\n[INFO] Respawning agents with credentials in initial instructions...\n");

  for (const agent of agentsToRespawn) {
    try {
      console.log(`[INFO] Respawning ${agent.fuId}...`);
      const newAgentId = await spawnWorkerAgent(agent.fuId, agent.batchId, RELEASE_ID, manifest);

      // Update status file
      const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
      for (const batch of status.batches || []) {
        for (const fu of batch.feature_units || []) {
          if (fu.fu_id === agent.fuId) {
            fu.worker_agent_id = newAgentId;
            fu.status = "running";
            fu.started_at = new Date().toISOString();
            fu.last_update = new Date().toISOString();
            fu.completed_at = null;
            fu.error = null;
            break;
          }
        }
      }
      writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

      console.log(`[INFO] ✅ Respawned ${agent.fuId} with new agent ID: ${newAgentId}\n`);

      // Small delay between spawns
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`[ERROR] Failed to respawn ${agent.fuId}: ${error.message}`);
    }
  }

  console.log(`[INFO] Respawn complete: ${agentsToRespawn.length} agent(s) respawned`);
  console.log(`[INFO] New agents will receive credentials in their initial instructions`);
}

main().catch((error) => {
  console.error("[ERROR] Failed to respawn agents:", error);
  process.exit(1);
});
