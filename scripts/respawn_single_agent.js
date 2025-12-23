#!/usr/bin/env node

/**
 * Respawn a single agent by FU ID
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";

config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RELEASE_ID = process.argv[2];
const FU_ID = process.argv[3];

if (!RELEASE_ID || !FU_ID) {
  console.error("Usage: node scripts/respawn_single_agent.js <release_id> <fu_id>");
  console.error("Example: node scripts/respawn_single_agent.js v0.2.0 FU-110");
  process.exit(1);
}

const STATUS_FILE = join(
  __dirname,
  "..",
  "docs",
  "releases",
  "in_progress",
  RELEASE_ID,
  "agent_status.json"
);
const MANIFEST_PATH = join(
  __dirname,
  "..",
  "docs",
  "releases",
  "in_progress",
  RELEASE_ID,
  "manifest.yaml"
);

if (!existsSync(STATUS_FILE)) {
  console.error(`[ERROR] Status file not found: ${STATUS_FILE}`);
  process.exit(1);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[ERROR] Manifest file not found: ${MANIFEST_PATH}`);
  process.exit(1);
}

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com")
  .replace(/\/$/, "")
  .replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

function loadCredentials() {
  const creds = [];
  if (process.env.SUPABASE_URL) creds.push(`SUPABASE_URL=${process.env.SUPABASE_URL}`);
  if (process.env.SUPABASE_SERVICE_KEY)
    creds.push(`SUPABASE_SERVICE_KEY=${process.env.SUPABASE_SERVICE_KEY}`);
  if (process.env.DEV_SUPABASE_URL) creds.push(`DEV_SUPABASE_URL=${process.env.DEV_SUPABASE_URL}`);
  if (process.env.DEV_SUPABASE_SERVICE_KEY)
    creds.push(`DEV_SUPABASE_SERVICE_KEY=${process.env.DEV_SUPABASE_SERVICE_KEY}`);
  if (process.env.DEV_OPENAI_API_KEY)
    creds.push(`DEV_OPENAI_API_KEY=${process.env.DEV_OPENAI_API_KEY}`);
  if (process.env.PROD_OPENAI_API_KEY)
    creds.push(`PROD_OPENAI_API_KEY=${process.env.PROD_OPENAI_API_KEY}`);
  if (process.env.ACTIONS_BEARER_TOKEN)
    creds.push(`ACTIONS_BEARER_TOKEN=${process.env.ACTIONS_BEARER_TOKEN}`);
  return creds;
}

async function terminateAgent(agentId) {
  const deleteEndpoint = `${apiUrl}/v0/agents/${agentId}`;
  try {
    const response = await fetch(deleteEndpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (response.ok || response.status === 404) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function spawnWorkerAgent(fuId, batchId, releaseId, manifest) {
  const repoUrl = process.env.REPO_URL || "https://github.com/markmhendrickson/neotoma";
  const branch = process.env.RELEASE_BRANCH || "dev";
  const cleanRepoUrl = repoUrl.replace(/^["']|["']$/g, "");

  const creds = loadCredentials();
  const STATUS_FILE_REF = `docs/releases/in_progress/${releaseId}/agent_status.json`;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.DEV_SUPABASE_URL || "";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";

  const envSetup = `\n**Environment Variables and Testing:**

**Step 1: Verify environment variables are available**

Environment variables should be automatically injected via Cursor Cloud Agents Secrets. Verify they're set:
\`\`\`bash
env | grep -E "SUPABASE.*=" || echo "No Supabase credentials found"
env | grep -E "OPENAI_API_KEY|DEV_OPENAI_API_KEY|PROD_OPENAI_API_KEY" || echo "No OpenAI API key found"
\`\`\`

If environment variables are missing, they need to be configured in Cursor Settings → Cloud Agents → Secrets.

**Step 2: Set up infrastructure (automated)**

Run the setup script to handle all infrastructure setup:
\`\`\`bash
chmod +x scripts/setup_agent_environment.sh
./scripts/setup_agent_environment.sh
\`\`\`

This script will:
- Link Supabase project (if not already linked)
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
- Run the setup script to configure infrastructure (Supabase linking, migrations, Playwright)
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
   - Run setup script: \`./scripts/setup_agent_environment.sh\` (applies migrations automatically)
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
- **Integration tests require Supabase credentials** - they should be injected via Cursor Secrets

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

  // Note: Environment variables are injected via Cursor Secrets, not passed via API environment field

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
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
    throw new Error(
      `Failed to spawn agent: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  const agentId = data.id || data.agent_id;

  if (!agentId) {
    throw new Error(`API response missing agent ID: ${JSON.stringify(data)}`);
  }

  return agentId;
}

async function main() {
  console.log(`[INFO] Respawning ${FU_ID} for ${RELEASE_ID}...\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  const manifestContent = readFileSync(MANIFEST_PATH, "utf-8");
  const manifest = yaml.load(manifestContent);

  // Find the FU in status
  let fuStatus = null;
  let batchId = null;

  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (fu.fu_id === FU_ID) {
        fuStatus = fu;
        batchId = batch.batch_id;
        break;
      }
    }
    if (fuStatus) break;
  }

  if (!fuStatus) {
    console.error(`[ERROR] FU ${FU_ID} not found in status file`);
    process.exit(1);
  }

  console.log(`[INFO] Found ${FU_ID} in Batch ${batchId}`);
  console.log(`[INFO] Current agent ID: ${fuStatus.worker_agent_id || "none"}`);
  console.log(`[INFO] Current status: ${fuStatus.status}\n`);

  // Terminate existing agent if present
  if (fuStatus.worker_agent_id) {
    console.log(`[INFO] Terminating existing agent ${fuStatus.worker_agent_id}...`);
    await terminateAgent(fuStatus.worker_agent_id);
  }

  // Spawn new agent
  console.log(`[INFO] Spawning new agent for ${FU_ID}...\n`);
  try {
    const newAgentId = await spawnWorkerAgent(FU_ID, batchId, RELEASE_ID, manifest);

    // Update status file
    const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
    for (const batch of status.batches || []) {
      for (const fu of batch.feature_units || []) {
        if (fu.fu_id === FU_ID) {
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

    console.log(`[INFO] ✅ Respawned ${FU_ID} with new agent ID: ${newAgentId}`);
    console.log(`[INFO] Agent will receive credentials and setup script instructions`);
  } catch (error) {
    console.error(`[ERROR] Failed to respawn ${FU_ID}: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[ERROR] Failed to respawn agent:", error);
  process.exit(1);
});

