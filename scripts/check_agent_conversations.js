#!/usr/bin/env node

import { config } from "dotenv";

// Load environment variables
config({ override: true });

// Get agent IDs from status file
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATUS_FILE = join(__dirname, '..', 'docs', 'releases', 'in_progress', 'v0.2.0', 'agent_status.json');
const status = JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));

const agentIds = [];
for (const batch of status.batches || []) {
  for (const fu of batch.feature_units || []) {
    if (fu.worker_agent_id && (fu.status === 'running' || fu.status === 'completed')) {
      agentIds.push({ id: fu.worker_agent_id, fu: fu.fu_id });
    }
  }
}

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

