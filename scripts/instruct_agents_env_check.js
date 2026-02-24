#!/usr/bin/env node

import { config } from "dotenv";

// Load environment variables
config({ override: true });

const agentIds = [
  { id: 'bc-395bcfb0-5279-4c07-85c2-ebb2f0a102b2', fu: 'FU-110' },
  { id: 'bc-ff034820-0d20-4230-988e-f9627a70ca62', fu: 'FU-112' },
  { id: 'bc-36035315-07e5-477b-a762-1e86f8ff3ab3', fu: 'FU-113' }
];

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || 'https://api.cursor.com').replace(/\/$/, '').replace(/\/v1$/, '');
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error('[ERROR] CURSOR_CLOUD_API_KEY not set');
  process.exit(1);
}

const instructionMessage = `**Environment Variables and Database Setup (Local-Only Mode)**

**Step 1: Check if environment variables are already set**

Run this command to check if credentials are available:
\`\`\`bash
env | grep -E "OPENAI|NEOTOMA" || echo "No env vars found"
\`\`\`

**Step 2: If environment variables are NOT set, you have options:**

**Option A: Use local SQLite (default)**

Tests use local SQLite by default. No remote credentials needed.

**Option B: Skip integration/E2E tests if needed**

If tests cannot be run, update the status file with:
\`\`\`json
{
  "tests": {
    "unit": { "passed": true, "command": "npm run test" },
    "integration": { "passed": null, "skipped": true, "reason": "Skipped" },
    "e2e": { "passed": null, "skipped": true, "reason": "Skipped" }
  }
}
\`\`\`

**Step 3: Running tests**

\`\`\`bash
npm run test
npm run test:integration  # Uses local SQLite
npm run test:e2e
\`\`\`

**Important Notes:**
- DO NOT export credentials from conversation text if they contain actual secrets
- Tests use local SQLite by default
- Update status file with actual test results (passed/skipped/failed)`;

async function sendInstruction(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/followup`;
  console.log(`\n[INFO] Sending environment check instructions to ${agent.fu} (${agent.id})...`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          text: instructionMessage
        }
      })
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Instructions sent to ${agent.fu}`);
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send instructions to ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error sending instructions to ${agent.fu}: ${error.message}`);
  }
}

console.log('[INFO] Sending environment check instructions to agents...');
console.log('[INFO] Instructions include: check env vars, local mode setup');

for (const agent of agentIds) {
  await sendInstruction(agent);
}

console.log('\n[INFO] Instructions sent to all agents');
