#!/usr/bin/env node

/**
 * Check status of running agents
 * 
 * Reads agent_status.json and checks agent conversation history to see what they're doing
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get release ID from command line or default to v0.2.0
const RELEASE_ID = process.argv[2] || "v0.2.0";
const STATUS_FILE = join(__dirname, "..", "docs", "releases", "in_progress", RELEASE_ID, "agent_status.json");

if (!existsSync(STATUS_FILE)) {
  console.error(`[ERROR] Status file not found: ${STATUS_FILE}`);
  process.exit(1);
}

const apiUrl = (process.env.CURSOR_CLOUD_API_URL || "https://api.cursor.com").replace(/\/$/, "").replace(/\/v1$/, "");
const apiKey = process.env.CURSOR_CLOUD_API_KEY;

if (!apiKey) {
  console.error("[ERROR] CURSOR_CLOUD_API_KEY not set");
  process.exit(1);
}

async function checkAgentStatus(agentId, fuId) {
  const endpoint = `${apiUrl}/v0/agents/${agentId}`;
  const conversationEndpoint = `${apiUrl}/v0/agents/${agentId}/conversation`;

  try {
    // Check agent status
    const statusResponse = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    let agentStatus = "unknown";
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      agentStatus = statusData.status || statusData.state || "unknown";
    }

    // Get conversation history
    const conversationResponse = await fetch(conversationEndpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    let messages = [];
    if (conversationResponse.ok) {
      const conversationData = await conversationResponse.json();
      messages = conversationData.messages || [];
    }

    return { agentStatus, messages };
  } catch (error) {
    return { agentStatus: "error", error: error.message, messages: [] };
  }
}

async function main() {
  console.log(`[INFO] Checking status of agents in ${RELEASE_ID}...\n`);

  const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));

  // Find all running agents
  const runningAgents = [];
  for (const batch of status.batches || []) {
    for (const fu of batch.feature_units || []) {
      if (fu.status === "running" && fu.worker_agent_id) {
        runningAgents.push({
          agentId: fu.worker_agent_id,
          fuId: fu.fu_id,
          batchId: batch.batch_id,
          progress: fu.progress || 0,
          startedAt: fu.started_at,
          lastUpdate: fu.last_update,
        });
      }
    }
  }

  if (runningAgents.length === 0) {
    console.log("[INFO] No running agents found");
    return;
  }

  console.log(`[INFO] Found ${runningAgents.length} running agent(s):\n`);

  for (const agent of runningAgents) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`${agent.fuId} (Batch ${agent.batchId})`);
    console.log(`Agent ID: ${agent.agentId}`);
    console.log(`Progress: ${agent.progress}%`);
    console.log(`Started: ${agent.startedAt}`);
    console.log(`Last Update: ${agent.lastUpdate || "Never"}`);
    console.log(`${"-".repeat(80)}`);

    const { agentStatus, messages, error } = await checkAgentStatus(agent.agentId, agent.fuId);

    if (error) {
      console.log(`[ERROR] Failed to check status: ${error}`);
      continue;
    }

    console.log(`API Status: ${agentStatus}`);

    if (messages.length > 0) {
      console.log(`\nRecent Activity (${messages.length} total messages):`);
      console.log(`${"-".repeat(80)}`);

      // Show last 10 messages
      const recentMessages = messages.slice(-10);
      recentMessages.forEach((msg, idx) => {
        const prefix = msg.type === "user_message" ? "[USER]" : "[AGENT]";
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "";
        const text = msg.text.substring(0, 300);
        const ellipsis = msg.text.length > 300 ? "..." : "";
        console.log(`\n[${idx + 1}] ${prefix} ${timestamp}`);
        console.log(text + ellipsis);
      });
    } else {
      console.log(`\n[INFO] No conversation messages yet`);
    }

    // Small delay between agents
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`[INFO] Status check complete for ${runningAgents.length} agent(s)`);
}

main().catch((error) => {
  console.error("[ERROR] Failed to check agent status:", error);
  process.exit(1);
});




