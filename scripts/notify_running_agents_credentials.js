#!/usr/bin/env node

/**
 * Notify running agents about credentials
 * 
 * Reads agent_status.json to find active agents and sends them credentials
 * via follow-up messages.
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get release ID from command line or default to v0.2.0
const RELEASE_ID = process.argv[2] || "v0.2.0";
const STATUS_FILE = join(__dirname, "..", "docs", "releases", "in_progress", RELEASE_ID, "agent_status.json");

if (!existsSync(STATUS_FILE)) {
  console.error(`[ERROR] Status file not found: ${STATUS_FILE}`);
  console.error(`[ERROR] Please specify a valid release ID or ensure the status file exists`);
  process.exit(1);
}

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com").replace(/\/$/, "").replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

// Load credentials
function loadCredentials() {
  const creds = [];
  if (process.env.SUPABASE_URL) creds.push(`SUPABASE_URL=${process.env.SUPABASE_URL}`);
  if (process.env.SUPABASE_SERVICE_KEY)
    creds.push(`SUPABASE_SERVICE_KEY=${process.env.SUPABASE_SERVICE_KEY}`);
  if (process.env.DEV_SUPABASE_URL) creds.push(`DEV_SUPABASE_URL=${process.env.DEV_SUPABASE_URL}`);
  if (process.env.DEV_SUPABASE_SERVICE_KEY)
    creds.push(`DEV_SUPABASE_SERVICE_KEY=${process.env.DEV_SUPABASE_SERVICE_KEY}`);
  if (process.env.OPENAI_API_KEY) creds.push(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`);
  if (process.env.ACTIONS_BEARER_TOKEN)
    creds.push(`ACTIONS_BEARER_TOKEN=${process.env.ACTIONS_BEARER_TOKEN}`);
  return creds;
}

// Note: Credentials are injected via Cursor Secrets, not sent in messages

const followupMessage = `**UPDATE: Environment Variables Available**

Environment variables should be automatically injected via Cursor Cloud Agents Secrets.

**Action Required:**

1. **Verify environment variables are available:**
   \`\`\`bash
   env | grep -E "SUPABASE.*=" || echo "No Supabase credentials found"
   env | grep -E "OPENAI_API_KEY" || echo "No OpenAI API key found"
   \`\`\`

2. **If environment variables are missing**, they need to be configured in Cursor Settings → Cloud Agents → Secrets.

3. **Re-run tests** with credentials available:
   \`\`\`bash
   npm run test
   npm run test:integration
   npm run test:e2e
   \`\`\`

4. **Update status file** with test results (all tests should now run with credentials)

**Important:**
- Environment variables are injected automatically via Cursor Secrets (no need to export manually)
- Update the status file with actual test results`;

async function notifyAgent(agentId, fuId) {
  const endpoint = `${apiUrl}/v0/agents/${agentId}/followup`;
  console.log(`[INFO] Notifying agent ${agentId} (${fuId})...`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: followupMessage,
        },
      }),
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Credentials sent to ${fuId} (${agentId})`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to notify ${fuId}: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Error notifying ${fuId}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`[INFO] Checking for running agents in ${RELEASE_ID}...`);
  console.log(`[INFO] Status file: ${STATUS_FILE}\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));

  // Find all running agents
  const runningAgents = [];
  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (
        fu.status === "running" &&
        fu.worker_agent_id &&
        (fu.status !== "completed" && fu.status !== "failed")
      ) {
        runningAgents.push({
          agentId: fu.worker_agent_id,
          fuId: fu.fu_id,
          batchId: batch.batch_id,
        });
      }
    }
  }

  if (runningAgents.length === 0) {
    console.log("[INFO] No running agents found");
    console.log("[INFO] Credentials will be included automatically for newly spawned agents");
    return;
  }

  console.log(`[INFO] Found ${runningAgents.length} running agent(s):\n`);
  runningAgents.forEach((agent) => {
    console.log(`  - ${agent.fuId} (Batch ${agent.batchId}): ${agent.agentId}`);
  });
  console.log("");

  if (creds.length === 0) {
    console.warn("[WARN] No credentials found in environment variables");
    console.warn("[WARN] Agents will be notified but no credentials will be provided");
  } else {
    console.log(`[INFO] Credentials to send: ${creds.length} variable(s)`);
    creds.forEach((cred) => {
      const [key] = cred.split("=");
      console.log(`  - ${key}`);
    });
    console.log("");
  }

  // Notify all running agents
  let successCount = 0;
  for (const agent of runningAgents) {
    const success = await notifyAgent(agent.agentId, agent.fuId);
    if (success) successCount++;
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n[INFO] Notification complete: ${successCount}/${runningAgents.length} agents notified successfully`);
}

main().catch((error) => {
  console.error("[ERROR] Failed to notify agents:", error);
  process.exit(1);
});


