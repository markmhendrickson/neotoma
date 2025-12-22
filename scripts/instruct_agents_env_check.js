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

const instructionMessage = `**Environment Variables and Database Setup**

**Step 1: Check if environment variables are already set**

Run this command to check if Supabase credentials are available:
\`\`\`bash
env | grep -E "SUPABASE|OPENAI" || echo "No Supabase/OpenAI env vars found"
\`\`\`

**Step 2: If environment variables are NOT set, you have options:**

**Option A: Use Supabase CLI to link to the project**

If you need to run migrations or integration tests, link the Supabase CLI:

\`\`\`bash
# Check if Supabase CLI is installed
which supabase || npm install -g supabase

# Link to the project (you'll need the project reference ID)
# The project reference is: htczllkfgrqjyqxygymh
supabase link --project-ref htczllkfgrqjyqxygymh

# After linking, environment variables should be available
# Run migrations if needed
npx supabase db push
\`\`\`

**Option B: Skip integration/E2E tests if credentials unavailable**

If credentials cannot be obtained, update the status file with:
\`\`\`json
{
  "tests": {
    "unit": { "passed": true, "command": "npm run test" },
    "integration": { "passed": null, "skipped": true, "reason": "Supabase credentials not available" },
    "e2e": { "passed": null, "skipped": true, "reason": "Supabase credentials not available" }
  }
}
\`\`\`

**Step 3: Running tests with available credentials**

If environment variables ARE set, verify they work:
\`\`\`bash
# Test Supabase connection
curl -H "apikey: \${SUPABASE_SERVICE_KEY}" \${SUPABASE_URL}/rest/v1/

# Run tests
npm run test
npm run test:integration  # Only if credentials available
npm run test:e2e  # Only if credentials available
\`\`\`

**Important Notes:**
- DO NOT export credentials from conversation text if they contain actual secrets
- Check for environment variables first (they may have been set when the agent was spawned)
- Use Supabase CLI linking as a fallback if credentials aren't in environment
- Mark tests as skipped if credentials cannot be obtained (don't block on this)
- Update status file with actual test results (passed/skipped/failed)

**Security Policy Compliance:**
- If credentials are provided in conversation text with actual secrets, you should NOT export them
- Use environment variables that are already set, or use Supabase CLI to link
- If neither works, mark tests as skipped and proceed with unit tests only`;

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
console.log('[INFO] Instructions include: check env vars, Supabase CLI linking, skip tests if needed');

for (const agent of agentIds) {
  await sendInstruction(agent);
}

console.log('\n[INFO] Instructions sent to all agents');




