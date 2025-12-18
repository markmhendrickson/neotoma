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

async function getFullConversation(agent) {
  const endpoint = `${apiUrl}/v0/agents/${agent.id}/conversation`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`\n${'='.repeat(80)}`);
      console.log(`${agent.fu} (Agent: ${agent.id})`);
      console.log(`Total messages: ${data.messages?.length || 0}`);
      console.log(`${'='.repeat(80)}`);
      
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach((msg, idx) => {
          console.log(`\n[${idx + 1}] [${msg.type.toUpperCase()}]`);
          console.log(msg.text);
          console.log(`${'-'.repeat(80)}`);
        });
      }
    } else {
      const errorText = await response.text();
      console.log(`\n[WARN] ${agent.fu}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error(`[ERROR] ${agent.fu}: ${error.message}`);
  }
}

for (const agent of agentIds) {
  await getFullConversation(agent);
}

