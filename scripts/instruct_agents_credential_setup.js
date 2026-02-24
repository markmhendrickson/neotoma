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

// Generate base64-encoded credentials (local-only: OpenAI and other vars)
const creds = [];
if (process.env.DEV_OPENAI_API_KEY) creds.push(`DEV_OPENAI_API_KEY=${process.env.DEV_OPENAI_API_KEY}`);
if (process.env.PROD_OPENAI_API_KEY) creds.push(`PROD_OPENAI_API_KEY=${process.env.PROD_OPENAI_API_KEY}`);
if (process.env.OPENAI_API_KEY) creds.push(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`);

if (creds.length === 0) {
  console.error('[ERROR] No credentials available in orchestrator environment');
  process.exit(1);
}

const credsString = creds.join('\n');
const encodedCreds = Buffer.from(credsString).toString('base64');

const message = `**CRITICAL: Setup Credentials to Run Tests**

You MUST set up credentials to run tests and validate your implementation work.

**Step 1: Pull latest code (if not already done)**
\`\`\`bash
git pull origin dev
\`\`\`

**Step 2: Set up credentials using the encoded credentials below**

Run this command to set up your environment variables:
\`\`\`bash
echo "${encodedCreds}" | base64 -d > .env.agent
source .env.agent
export \$(cat .env.agent | grep -v '^#' | xargs)
\`\`\`

**Step 3: Verify credentials are set**
\`\`\`bash
env | grep -E "OPENAI" | head -5
\`\`\`

**Step 4: Run migrations (if needed)**
\`\`\`bash
npm run migrate
\`\`\`

**Step 5: Run tests**
\`\`\`bash
npm run test
npm run test:integration
npm run test:e2e
\`\`\`

**Step 6: Update status file with test results**
\`\`\`json
{
  "fu_id": "FU-XXX",
  "status": "completed",
  "progress": 1.0,
  "completed_at": "2025-12-18T...",
  "last_update": "2025-12-18T...",
  "tests": {
    "unit": { "passed": true/false, "command": "npm run test" },
    "integration": { "passed": true/false, "command": "npm run test:integration" },
    "e2e": { "passed": true/false, "command": "npm run test:e2e" }
  }
}
\`\`\`

**Important:** 
- Tests MUST be run to validate your implementation
- Use the base64-encoded credentials above to set up your environment
- Update the status file with actual test results (passed/failed)
- Clean up: \`rm .env.agent\` after tests complete (optional)`;

async function sendMessage(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/followup`;
  console.log(`\n[INFO] Sending credential setup instructions to ${agent.fu} (${agent.id})...`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          text: message
        }
      })
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Credential setup instructions sent to ${agent.fu}`);
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send instructions to ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error sending instructions to ${agent.fu}: ${error.message}`);
  }
}

console.log('[INFO] Preparing to send credential setup instructions to agents...');
console.log(`[INFO] Credentials available: ${creds.length} variables`);
console.log('[INFO] Credentials will be provided as base64-encoded string');

for (const agent of agentIds) {
  await sendMessage(agent);
}

console.log('\n[INFO] All agents notified with credential setup instructions');
