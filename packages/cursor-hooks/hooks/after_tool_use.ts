/**
 * postToolUse hook.
 *
 * Two responsibilities:
 *
 * 1. Passive observability: log a `tool_invocation` observation so the
 *    timeline reflects the agent's work even if the agent never writes a
 *    structured memory via MCP.
 *
 * 2. Prompt-local reinforcement: when the agent has not yet emitted a
 *    `store_structured` call this turn, return `additional_context`
 *    reminding it of the Neotoma must-do list. Cursor honors
 *    `additional_context` on
 *    `postToolUse` (verified against the documented contract). This is
 *    the surface the previous `beforeSubmitPrompt.additionalContext` was
 *    trying to fill — Cursor drops it there but accepts it here.
 *
 * Per Option C we still do not parse tool output into entities; that is
 * the agent's job via MCP.
 */

import { type StoreEntityInput } from "@neotoma/client";

import {
  buildCompactReminder,
  collectHookWorkspaceContext,
  formatFailureHint,
  getClient,
  harnessProvenance,
  log,
  looksLikeExternalDataTool,
  looksLikeRetrieveInvocation,
  looksLikeStoreStructured,
  makeIdempotencyKey,
  readFailureHint,
  recordConversationTurn,
  runHook,
  turnContextFields,
  updateTurnState,
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

function shouldNudgeForReply(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower === "read" ||
    lower === "grep" ||
    lower === "glob" ||
    lower === "write" ||
    lower === "edit" ||
    lower === "search" ||
    lower === "shell" ||
    lower === "semanticsearch" ||
    lower === "callmcptool" ||
    lower === "call_mcp_tool" ||
    lower.includes("callmcptool") ||
    lower.startsWith("mcp_") ||
    lower.includes("read_file") ||
    lower.includes("list_dir")
  );
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
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
  const model =
    (input.model as string) ??
    process.env.NEOTOMA_HOOK_DETECTED_MODEL ??
    "";
  const context = collectHookWorkspaceContext(input);

  const wasStore = looksLikeStoreStructured(toolName, toolInput);
  const wasRetrieve = looksLikeRetrieveInvocation(toolName, toolInput);
  const wasExternalData = looksLikeExternalDataTool(toolName, toolInput, toolResult);
  const nextState = updateTurnState(sessionId, turnId, (s) => ({
    ...s,
    conversation_id: sessionId,
    generation_id: turnId,
    model: model || s.model,
    store_structured_calls: s.store_structured_calls + (wasStore ? 1 : 0),
    retrieve_calls: s.retrieve_calls + (wasRetrieve ? 1 : 0),
    external_data_tool_calls: s.external_data_tool_calls + (wasExternalData ? 1 : 0),
    tool_invocation_count: s.tool_invocation_count + 1,
  }));

  const client = getClient();
  let toolEntityId: string | undefined;
  if (client) {
    const invokedAt = new Date().toISOString();
    const entity: StoreEntityInput = {
      entity_type: "tool_invocation",
      tool_name: toolName,
      turn_key: `${sessionId}:${turnId}`,
      invoked_at: invokedAt,
      status: (toolResult as { status?: unknown }).status ?? null,
      has_error: Boolean((toolResult as { error?: unknown }).error),
      input_summary: summarize(toolInput),
      output_summary: summarize(toolResult),
      ...harnessProvenance({ hook_event: hookEventName }),
    };
    try {
      const result = (await client.store({
        entities: [entity],
        idempotency_key: makeIdempotencyKey(
          sessionId,
          turnId,
          `tool-${toolName}-${Date.now()}`
        ),
      })) as { structured?: { entities?: Array<{ entity_id?: string }> } };
      const id = result.structured?.entities?.[0]?.entity_id;
      if (typeof id === "string") toolEntityId = id;
    } catch (err) {
      log("debug", `${hookEventName} store failed: ${(err as Error).message}`);
    }

    const turnRecord = await recordConversationTurn(client, {
      sessionId,
      turnId,
      hookEvent: "post_tool_use",
      harness: "cursor",
      model: model || undefined,
      toolInvocationCount: nextState.tool_invocation_count,
      storeStructuredCalls: nextState.store_structured_calls,
      retrieveCalls: nextState.retrieve_calls,
      neotomaToolFailures: nextState.neotoma_tool_failures,
      storedEntityIds: toolEntityId ? [toolEntityId] : undefined,
      ...turnContextFields(context),
    });

    if (toolEntityId && turnRecord?.entityId) {
      try {
        await client.createRelationship({
          relationship_type: "REFERS_TO",
          source_entity_id: turnRecord.entityId,
          target_entity_id: toolEntityId,
        });
      } catch (err) {
        log(
          "debug",
          `conversation_turn REFERS_TO failed: ${(err as Error).message}`
        );
      }
    }
  }

  const parts: string[] = [];
  const noStoreYet = nextState.store_structured_calls === 0;
  if (
    noStoreYet &&
    !wasStore &&
    shouldNudgeForReply(toolName)
  ) {
    parts.push(buildCompactReminder(model));
  }

  if (wasExternalData) {
    parts.push(
      "[External tool returned data] Per store-first rule: extract and store entities from this tool's output " +
      "as structured Neotoma entities (with data_source and api_response_data) before composing your reply. " +
      "Conversation bookkeeping alone is not sufficient."
    );
  }

  const hint = readFailureHint(sessionId);
  if (hint) parts.push(formatFailureHint(hint));

  if (parts.length === 0) return {};

  updateTurnState(sessionId, turnId, (s) => ({
    ...s,
    reminder_injected: true,
    reminder_hooks: Array.from(
      new Set([...(s.reminder_hooks ?? []), "post_tool_use"])
    ),
  }));
  return { additional_context: parts.join("\n\n") };
}

void runHook("postToolUse", handle);
