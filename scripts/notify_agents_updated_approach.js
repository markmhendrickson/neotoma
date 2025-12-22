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

const message = `**Updated Approach: Environment Variables and Testing**

**Key Changes:**
1. Credentials are NO LONGER provided in conversation text (security policy compliance)
2. Environment variables may be available if set when agent was spawned (check first)
3. Use Supabase CLI to link project if credentials needed but not available
4. Mark tests as skipped (don't block) if credentials cannot be obtained

**Action Plan:**

**Step 1: Check for existing environment variables**
\`\`\`bash
env | grep -E "SUPABASE|OPENAI"
\`\`\`

**Step 2: If credentials NOT in environment, use Supabase CLI**
\`\`\`bash
# Install Supabase CLI if needed
which supabase || npm install -g supabase

# Link to the project (project ref: htczllkfgrqjyqxygymh)
supabase link --project-ref htczllkfgrqjyqxygymh

# Run migrations
npx supabase db push
\`\`\`

**Step 3: Run tests based on credential availability**

If credentials available (from env or CLI):
\`\`\`bash
npm run test
npm run test:integration
npm run test:e2e
\`\`\`

If credentials NOT available:
\`\`\`bash
npm run test  # Unit tests may work without Supabase
# Mark integration/E2E as skipped in status file
\`\`\`

**Step 4: Update status file**

\`\`\`json
{
  "fu_id": "FU-XXX",
  "status": "completed",
  "progress": 1.0,
  "tests": {
    "unit": { "passed": true, "command": "npm run test" },
    "integration": { 
      "passed": true,  // or null if skipped
      "skipped": false,  // or true
      "reason": "..."  // if skipped, explain why
    },
    "e2e": {
      "passed": true,  // or null if skipped
      "skipped": false,  // or true
      "reason": "..."  // if skipped, explain why
    }
  }
}
\`\`\`

**Important:**
- DO NOT export credentials from conversation text (security violation)
- Check environment variables first
- Use Supabase CLI as fallback
- Proceed with tests that can run (don't block on missing credentials)
- Update status file with actual results (passed/skipped/failed)

**Current Status:**
- Your implementation work is complete
- Focus on running tests and updating status file
- Use the approaches above to handle credential availability`;

async function sendMessage(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/followup`;
  console.log(`\n[INFO] Sending updated approach to ${agent.fu} (${agent.id})...`);
  
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
      console.log(`[INFO] ✅ Message sent to ${agent.fu}`);
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to send message to ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error sending message to ${agent.fu}: ${error.message}`);
  }
}

console.log('[INFO] Notifying agents about updated approach for credentials and testing...');

for (const agent of agentIds) {
  await sendMessage(agent);
}

console.log('\n[INFO] All agents notified');




