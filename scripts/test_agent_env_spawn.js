#!/usr/bin/env node

import { config } from "dotenv";

// Load environment variables
config({ override: true });

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || 'https://api.cursor.com').replace(/\/$/, '').replace(/\/v1$/, '');
const apiKey = process.env.CURSOR_CLOUD_API_KEY;
const endpoint = `${apiUrl}/v0/agents`;

if (!apiKey) {
  console.error('[ERROR] CURSOR_CLOUD_API_KEY not set');
  process.exit(1);
}

// Test if environment field is accepted
const envVars = {};
if (process.env.SUPABASE_URL) envVars.SUPABASE_URL = process.env.SUPABASE_URL;
if (process.env.SUPABASE_SERVICE_KEY) envVars.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (process.env.DEV_SUPABASE_URL) envVars.DEV_SUPABASE_URL = process.env.DEV_SUPABASE_URL;
if (process.env.DEV_SUPABASE_SERVICE_KEY) envVars.DEV_SUPABASE_SERVICE_KEY = process.env.DEV_SUPABASE_SERVICE_KEY;

const testRequest = {
  prompt: {
    text: `Test agent to verify environment variable passing.

Check if these environment variables are available:
\`\`\`bash
env | grep -E "SUPABASE" || echo "No Supabase vars found"
\`\`\`

Report back what you find.`
  },
  source: {
    repository: process.env.REPO_URL || "https://github.com/markmhendrickson/neotoma",
    ref: process.env.RELEASE_BRANCH || "dev"
  }
};

if (Object.keys(envVars).length > 0) {
  testRequest.environment = envVars;
  console.log('[INFO] Testing agent spawn with environment variables:');
  console.log('  Variables:', Object.keys(envVars).join(', '));
}

console.log('\n[INFO] Attempting to spawn test agent...');
console.log('[INFO] This will test if the API accepts the environment field\n');

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ERROR] Failed to spawn agent: ${response.status}`);
    console.error(`[ERROR] Response: ${errorText}`);
    
    if (response.status === 400 && errorText.includes('environment')) {
      console.log('\n[INFO] API rejected environment field - this confirms env vars cannot be passed via API');
    }
    process.exit(1);
  }

  const data = await response.json();
  const agentId = data.id || data.agent_id;
  console.log(`[INFO] ✅ Test agent spawned successfully: ${agentId}`);
  console.log(`[INFO] Environment variables ${testRequest.environment ? 'were included' : 'were NOT included'} in the request`);
  console.log(`[INFO] Check agent ${agentId} in Cursor Cloud to see if env vars are available`);
  
} catch (error) {
  console.error(`[ERROR] Error: ${error.message}`);
  process.exit(1);
}




