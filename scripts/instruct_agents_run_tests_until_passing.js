#!/usr/bin/env node

/**
 * Send instructions to agents to run tests until all pass
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RELEASE_ID = process.argv[2] || "v0.2.0";
const STATUS_FILE = join(__dirname, "..", "docs", "releases", "in_progress", RELEASE_ID, "agent_status.json");

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com").replace(/\/$/, "").replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));

const message = `**CRITICAL UPDATE: Run Tests Until ALL Pass**

You must run all tests and ensure they pass before marking your Feature Unit as complete.

**Required Steps:**

1. **Pull latest code** (includes updated setup script with auto-migration):
   \`\`\`bash
   git pull origin dev
   \`\`\`

2. **Run setup script** (now auto-applies migrations):
   \`\`\`bash
   chmod +x scripts/setup_agent_environment.sh
   ./scripts/setup_agent_environment.sh
   \`\`\`

3. **Run all test suites**:
   \`\`\`bash
   npm run test
   npm run test:integration
   npm run test:e2e
   \`\`\`

4. **If tests fail:**
   - Fix the issues causing failures
   - Re-run tests until ALL tests pass
   - Do NOT mark as complete until all tests pass

5. **Update status file** (ONLY when all tests pass):
   \`\`\`json
   {
     "fu_id": "FU-XXX",
     "status": "completed",
     "progress": 1.0,
     "tests": {
       "unit": { "passed": true, "command": "npm run test" },
       "integration": { "passed": true, "command": "npm run test:integration" },
       "e2e": { "passed": true, "command": "npm run test:e2e" }
     }
   }
   \`\`\`

**Important:** 
- The setup script now automatically applies migrations via Management API
- ALL tests must pass before marking as complete
- Fix any failing tests and re-run until they pass
- Update status file with actual test results showing all tests passed`;

// Find agents for FU-110, FU-112, FU-113
const agentsToNotify = [];
for (const batch of status.batches || []) {
  for (const fu of batch.feature_units || []) {
    if (["FU-110", "FU-112", "FU-113"].includes(fu.fu_id) && fu.worker_agent_id) {
      agentsToNotify.push({
        agentId: fu.worker_agent_id,
        fuId: fu.fu_id,
      });
    }
  }
}

if (agentsToNotify.length === 0) {
  console.log("[INFO] No agents found to notify");
  process.exit(0);
}

console.log(`[INFO] Sending test instructions to ${agentsToNotify.length} agent(s)...\n`);

for (const agent of agentsToNotify) {
  try {
    const endpoint = `${apiUrl}/v0/agents/${agent.agentId}/followup`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send message to ${agent.fuId} (${agent.agentId}): ${response.status} - ${errorText}`);
    } else {
      console.log(`[INFO] ✅ Sent instructions to ${agent.fuId} (${agent.agentId})`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to send message to ${agent.fuId}: ${error.message}`);
  }
}

console.log(`\n[INFO] Notification complete`);

