#!/usr/bin/env node

/**
 * Unblock running agents by notifying them that infrastructure issues are resolved
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
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
  process.exit(1);
}

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com").replace(/\/$/, "").replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

const unblockInstructions = `
**UPDATE: Infrastructure Issues Resolved**

All infrastructure blockers have been resolved! You can now proceed with tests.

**What was fixed:**
1. ✅ Supabase CLI is now linked to the project
2. ✅ Database migrations have been applied (schema is up to date)
3. ✅ Playwright browsers are installed
4. ✅ Automated setup script created: \`scripts/setup_agent_environment.sh\`

**Action Required:**

1. **Run the setup script to verify everything is ready:**
   \`\`\`bash
   chmod +x scripts/setup_agent_environment.sh
   ./scripts/setup_agent_environment.sh
   \`\`\`

2. **Re-run your tests** now that infrastructure is ready:
   \`\`\`bash
   npm run test
   npm run test:integration
   npm run test:e2e
   \`\`\`

3. **Update status file** with actual test results:
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
- Infrastructure is now ready - tests should pass
- Update the status file with actual test results
- If tests still fail, report the specific error messages
`;

async function unblockAgent(agentId, fuId) {
  const endpoint = `${apiUrl}/v0/agents/${agentId}/followup`;
  console.log(`[INFO] Notifying agent ${agentId} (${fuId}) about infrastructure fixes...`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: unblockInstructions,
        },
      }),
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Unblock message sent to ${fuId} (${agentId})`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send unblock message to ${fuId} (${agentId}): ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Error sending unblock message to ${fuId} (${agentId}): ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`[INFO] Unblocking agents for ${RELEASE_ID}...\n`);
  console.log(`[INFO] Status file: ${STATUS_FILE}\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  const runningAgents = [];

  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (fu.worker_agent_id && (fu.status === "running" || fu.status === "completed")) {
        // Check if agent is still active via API
        runningAgents.push({ fuId: fu.fu_id, agentId: fu.worker_agent_id, batchId: batch.batch_id });
      }
    }
  }

  if (runningAgents.length === 0) {
    console.log("[INFO] No running agents found to unblock.");
    return;
  }

  console.log(`[INFO] Found ${runningAgents.length} agent(s) to notify:\n`);
  runningAgents.forEach((agent) => {
    console.log(`  - ${agent.fuId} (Batch ${agent.batchId}): ${agent.agentId}`);
  });
  console.log("");

  // Check agent status via API to see if they're still active
  console.log("[INFO] Checking agent status via API...\n");
  const activeAgents = [];
  
  for (const agent of runningAgents) {
    try {
      const statusResponse = await fetch(`${apiUrl}/v0/agents/${agent.agentId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (statusResponse.ok) {
        const agentData = await statusResponse.json();
        const agentStatus = agentData.status || agentData.state || "unknown";
        console.log(`[INFO] ${agent.fuId}: ${agentStatus}`);
        
        if (agentStatus !== "FINISHED" && agentStatus !== "FAILED" && agentStatus !== "DELETED") {
          activeAgents.push(agent);
        } else {
          console.log(`[INFO]   Agent ${agent.fuId} is ${agentStatus}, skipping unblock message`);
        }
      } else {
        // If 404 or 409, agent is deleted/finished
        const errorText = await statusResponse.text();
        console.log(`[INFO] ${agent.fuId}: Agent no longer active (${statusResponse.status})`);
      }
    } catch (error) {
      console.warn(`[WARN] Could not check status for ${agent.fuId}: ${error.message}`);
      // Assume agent is still active if we can't check
      activeAgents.push(agent);
    }
  }

  if (activeAgents.length === 0) {
    console.log("\n[INFO] No active agents found. All agents have finished.");
    console.log("[INFO] If tests failed due to infrastructure issues, you may need to respawn agents.");
    return;
  }

  console.log(`\n[INFO] Sending unblock messages to ${activeAgents.length} active agent(s)...\n`);

  let notifiedCount = 0;
  for (const agent of activeAgents) {
    const success = await unblockAgent(agent.agentId, agent.fuId);
    if (success) {
      notifiedCount++;
    }
    // Small delay between messages
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`\n[INFO] Unblock complete: ${notifiedCount}/${activeAgents.length} agents notified`);
  
  if (notifiedCount < runningAgents.length) {
    console.log(`\n[INFO] Note: Some agents were not active (finished/deleted).`);
    console.log(`[INFO] If they completed with test failures, you may want to respawn them.`);
  }
}

main().catch((error) => {
  console.error("[ERROR] Failed to unblock agents:", error);
  process.exit(1);
});




