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

// Collect environment variables (local-only mode: OpenAI and other non-remote vars)
const envVars = [];
const env = process.env.NEOTOMA_ENV || "development";
if (env === "production") {
  if (process.env.PROD_OPENAI_API_KEY) {
    envVars.push(`PROD_OPENAI_API_KEY=${process.env.PROD_OPENAI_API_KEY}`);
  }
} else {
  if (process.env.DEV_OPENAI_API_KEY) {
    envVars.push(`DEV_OPENAI_API_KEY=${process.env.DEV_OPENAI_API_KEY}`);
  }
}
if (process.env.ACTIONS_BEARER_TOKEN) {
  envVars.push(`ACTIONS_BEARER_TOKEN=${process.env.ACTIONS_BEARER_TOKEN}`);
}

const envVarMessage = envVars.length > 0
  ? `**Environment Variables Available**

The following environment variables are available and should be exported before running tests:

\`\`\`bash
export ${envVars.join('\nexport ')}
\`\`\`

**Usage:**
1. Copy the export commands above
2. Run them in your shell before executing test commands
3. These variables are used for:
   - Integration tests (local SQLite)
   - E2E tests (local mode)
   - Embedding generation (OpenAI API key, if needed)

**Verification:**
After exporting, verify with:
\`\`\`bash
echo "OPENAI_API_KEY: \${OPENAI_API_KEY:+set}"
\`\`\`
`
  : `**WARNING: Environment Variables Not Configured**

No credentials available in the orchestrator environment. Tests use local SQLite by default.

To configure, set in orchestrator's .env file:
- OPENAI_API_KEY (for embedding generation, if needed)
`;

async function sendFollowup(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/followup`;
  console.log(`\n[INFO] Notifying ${agent.fu} (${agent.id}) about environment variables...`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          text: envVarMessage
        }
      })
    });

    if (response.ok) {
      console.log(`[INFO] ✅ Environment variables notification sent to ${agent.fu}`);
    } else {
      const errorText = await response.text();
      console.error(`[ERROR] Failed to notify ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error notifying ${agent.fu}: ${error.message}`);
  }
}

console.log('[INFO] Notifying agents about available environment variables...');
console.log(`[INFO] ${envVars.length} environment variable(s) available`);

for (const agent of agentIds) {
  await sendFollowup(agent);
}

console.log('\n[INFO] Environment variables notification sent to all agents');




