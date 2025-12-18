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

// Collect environment variables for agents
const envVars = [];
if (process.env.DEV_SUPABASE_URL) {
  envVars.push(`DEV_SUPABASE_URL=${process.env.DEV_SUPABASE_URL}`);
  envVars.push(`SUPABASE_URL=${process.env.DEV_SUPABASE_URL}`);
}
if (process.env.DEV_SUPABASE_SERVICE_KEY) {
  envVars.push(`DEV_SUPABASE_SERVICE_KEY=${process.env.DEV_SUPABASE_SERVICE_KEY}`);
  envVars.push(`SUPABASE_SERVICE_KEY=${process.env.DEV_SUPABASE_SERVICE_KEY}`);
}

const followupInstructions = `**FOLLOW-UP: Blockers Resolved - Re-run Tests and Update Status**

Good news! The blockers have been resolved:

1. **CSV Fixture Loader**: Fixed - CSV content now available as TypeScript constant (\`frontend/src/sample-data/sets-medium.ts\`)
2. **Supabase Credentials**: Available - Export these environment variables before running tests:

\`\`\`bash
${envVars.length > 0 ? envVars.join('\nexport ') : '# No Supabase credentials configured in orchestrator'}
\`\`\`

**Required Actions:**

1. **Export environment variables** (if provided above) before running any tests
2. **Re-run test suites** now that blockers are resolved:
   - Unit tests: \`npm run test\`
   - Integration tests: \`npm run test:integration\` (requires Supabase credentials)
   - E2E tests: \`npm run test:e2e\` (should now work with CSV fix)
3. **Update status file**: \`docs/releases/in_progress/v0.2.0/agent_status.json\`
   - Set \`status: "completed"\`
   - Set \`progress: 1.0\`
   - Update \`tests.unit.passed\`, \`tests.integration.passed\`, \`tests.e2e.passed\` based on results
   - Set \`completed_at\` timestamp
   - Update \`last_update\` timestamp

**Status File Format:**
\`\`\`json
{
  "fu_id": "FU-XXX",
  "status": "completed",
  "progress": 1.0,
  "completed_at": "2025-12-18T...",
  "last_update": "2025-12-18T...",
  "tests": {
    "unit": { "passed": true, "command": "npm run test" },
    "integration": { "passed": true, "command": "npm run test:integration" },
    "e2e": { "passed": true, "command": "npm run test:e2e" }
  }
}
\`\`\`

**Important**: Update the status file atomically (read-modify-write) to avoid conflicts with other agents.`;

async function sendFollowup(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/followup`;
  console.log(`\n[INFO] Sending follow-up to ${agent.fu} (${agent.id})...`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          text: followupInstructions
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[INFO] ✅ Follow-up sent successfully to ${agent.fu}`);
      if (data.id || data.message_id) {
        console.log(`[INFO]   Follow-up ID: ${data.id || data.message_id}`);
      }
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send follow-up to ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error sending follow-up to ${agent.fu}: ${error.message}`);
  }
}

console.log('[INFO] Sending follow-up instructions to agents about resolved blockers...');
console.log('[INFO] Blockers resolved: CSV fixture loader, Supabase credentials documented');

for (const agent of agentIds) {
  await sendFollowup(agent);
}

console.log('\n[INFO] Follow-up instructions sent to all agents');

