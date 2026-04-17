/**
 * Example: wire Neotoma hooks into a Claude Agent SDK query.
 *
 * Run with: tsx examples/basic.ts
 *
 * Requires the Claude Agent SDK and @neotoma/client peer dependencies.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createNeotomaAgentHooks } from "@neotoma/claude-agent-sdk-adapter";

async function main() {
  const hooks = createNeotomaAgentHooks({
    baseUrl: process.env.NEOTOMA_BASE_URL,
    token: process.env.NEOTOMA_TOKEN,
    logLevel: "info",
  });

  const result = query({
    prompt: "What entities do I have about @acme-corp?",
    options: {
      hooks: {
        UserPromptSubmit: [
          { matcher: "*", hooks: [hooks.UserPromptSubmit] },
        ],
        PostToolUse: [{ matcher: "*", hooks: [hooks.PostToolUse] }],
        PreCompact: [{ matcher: "*", hooks: [hooks.PreCompact] }],
        Stop: [{ matcher: "*", hooks: [hooks.Stop] }],
      },
    },
  });

  for await (const message of result) {
    console.log(message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
