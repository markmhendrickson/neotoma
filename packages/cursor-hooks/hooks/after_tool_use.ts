/**
 * afterToolUse hook.
 *
 * Fires after each tool call Cursor runs. Logs a tool_invocation
 * observation so the timeline reflects the work the agent did, even
 * if the agent never writes a structured memory via MCP.
 *
 * Per Option C we do not parse tool output into entities — that is the
 * agent's job via MCP. This is passive observability only.
 */

import {
  getClient,
  harnessProvenance,
  log,
  makeIdempotencyKey,
  runHook,
} from "./_common.js";

function summarize(value: unknown, maxLen = 400): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "<unserializable>";
  }
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getClient();
  if (!client) return {};

  const sessionId =
    (input.sessionId as string) ??
    (input.session_id as string) ??
    (input.conversationId as string) ??
    (input.conversation_id as string) ??
    "cursor-unknown";
  const turnId =
    (input.turnId as string) ??
    (input.turn_id as string) ??
    (input.generationId as string) ??
    (input.generation_id as string) ??
    String(Date.now());
  const toolName =
    (input.toolName as string) ??
    (input.tool_name as string) ??
    (input.tool as string) ??
    "unknown";
  const toolInput =
    (input.toolInput as Record<string, unknown>) ??
    (input.tool_input as Record<string, unknown>) ??
    {};
  const toolResult =
    (input.toolResult as Record<string, unknown>) ??
    (input.tool_output as Record<string, unknown>) ??
    (input.toolOutput as Record<string, unknown>) ??
    (input.tool_result as Record<string, unknown>) ??
    (input.toolResponse as Record<string, unknown>) ??
    {};
  const hookEventName =
    (input.hook_event_name as string) ??
    (input.hookEventName as string) ??
    "postToolUse";

  const entity = {
    entity_type: "tool_invocation",
    tool_name: toolName,
    turn_key: `${sessionId}:${turnId}`,
    status: (toolResult as { status?: unknown }).status ?? null,
    has_error: Boolean((toolResult as { error?: unknown }).error),
    input_summary: summarize(toolInput),
    output_summary: summarize(toolResult),
    ...harnessProvenance({ hook_event: hookEventName }),
  };

  try {
    await client.store({
      entities: [entity],
      idempotency_key: makeIdempotencyKey(
        sessionId,
        turnId,
        `tool-${toolName}-${Date.now()}`
      ),
    });
  } catch (err) {
    log("debug", `${hookEventName} store failed: ${(err as Error).message}`);
  }
  return {};
}

void runHook("postToolUse", handle);
