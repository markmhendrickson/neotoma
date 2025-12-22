#!/usr/bin/env node

/**
 * Notify running agents that setup script is now available
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const notificationMessage = `
**UPDATE: Setup Script Now Available**

The setup script has been committed and pushed to the \`dev\` branch. Please pull the latest changes and run it:

\`\`\`bash
# Pull latest changes
git pull origin dev

# Run the setup script (now available in the repo)
chmod +x scripts/setup_agent_environment.sh
./scripts/setup_agent_environment.sh
\`\`\`

This script will:
- Link Supabase project
- Apply database migrations
- Install Playwright browsers
- Verify npm dependencies

After running the setup script, proceed with your tests.
`;

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
          text: notificationMessage,
        },
      }),
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Notification sent to ${fuId} (${agentId})`);
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
  console.log(`[INFO] Notifying running agents about setup script availability...\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  const runningAgents = [];

  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (fu.worker_agent_id) {
        // Check if agent is still active
        try {
          const statusResponse = await fetch(`${apiUrl}/v0/agents/${fu.worker_agent_id}`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });

          if (statusResponse.ok) {
            const agentData = await statusResponse.json();
            const agentStatus = agentData.status || agentData.state || "unknown";
            if (agentStatus !== "FINISHED" && agentStatus !== "FAILED" && agentStatus !== "DELETED") {
              runningAgents.push({ agentId: fu.worker_agent_id, fuId: fu.fu_id });
            }
          }
        } catch (error) {
          // Assume agent is still active if we can't check
          runningAgents.push({ agentId: fu.worker_agent_id, fuId: fu.fu_id });
        }
      }
    }
  }

  if (runningAgents.length === 0) {
    console.log("[INFO] No running agents found.");
    return;
  }

  console.log(`[INFO] Found ${runningAgents.length} running agent(s):\n`);
  runningAgents.forEach((agent) => {
    console.log(`  - ${agent.fuId}: ${agent.agentId}`);
  });
  console.log("");

  let notifiedCount = 0;
  for (const agent of runningAgents) {
    const success = await notifyAgent(agent.agentId, agent.fuId);
    if (success) notifiedCount++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`\n[INFO] Notification complete: ${notifiedCount}/${runningAgents.length} agents notified`);
}

main().catch((error) => {
  console.error("[ERROR] Failed to notify agents:", error);
  process.exit(1);
});




