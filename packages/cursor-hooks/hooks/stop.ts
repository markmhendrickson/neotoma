/**
 * stop hook.
 *
 * Runs when the agent finishes its reply. Captures the assistant's
 * final message as an agent_message so the turn is preserved even if
 * the agent did not explicitly store it via MCP.
 */

import {
  getClient,
  harnessProvenance,
  log,
  makeIdempotencyKey,
  runHook,
} from "./_common.js";

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getClient();
  if (!client) return {};

  const sessionId =
    (input.sessionId as string) ??
    (input.conversationId as string) ??
    "cursor-unknown";
  const turnId = (input.turnId as string) ?? String(Date.now());
  const finalText =
    (input.response as string) ??
    (input.assistantResponse as string) ??
    "";

  if (!finalText) return {};

  const entity = {
    entity_type: "conversation_message",
    role: "assistant",
    sender_kind: "assistant",
    content: finalText,
    turn_key: `${sessionId}:${turnId}:assistant`,
    observed_at: new Date().toISOString(),
    ...harnessProvenance({ hook_event: "stop" }),
  };

  try {
    await client.store({
      entities: [entity],
      idempotency_key: makeIdempotencyKey(sessionId, turnId, "assistant"),
    });
  } catch (err) {
    log("debug", `stop store failed: ${(err as Error).message}`);
  }
  return {};
}

void runHook("stop", handle);
