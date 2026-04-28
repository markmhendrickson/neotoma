/**
 * postToolUseFailure hook.
 *
 * Fires after a tool call fails. For Neotoma-relevant tools only, we
 * persist a structured `tool_invocation_failure` entity and bump a
 * session-local counter. When the counter crosses a threshold, the
 * `beforeSubmitPrompt` hook surfaces a one-shot hint suggesting the
 * agent consider submitting feedback via `submit_feedback`.
 *
 * Design constraints:
 *   - This hook MUST NOT call `submit_feedback` itself. PII redaction
 *     and `metadata.environment` assembly are the agent's job.
 *   - Filters to Neotoma-relevant tools so generic editor/shell noise
 *     does not drown out real signal.
 */

import { type StoreEntityInput } from "@neotoma/client";

import {
  classifyErrorMessage,
  getClient,
  harnessProvenance,
  incrementFailureCounter,
  isNeotomaRelevantTool,
  log,
  makeIdempotencyKey,
  recordConversationTurn,
  runHook,
  scrubErrorMessage,
  updateTurnState,
} from "./_common.js";

function extractInvocationShape(toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  return Object.keys(toolInput as Record<string, unknown>).slice(0, 32);
}

function extractErrorMessage(toolResult: Record<string, unknown>): string {
  const error = toolResult.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  const message = toolResult.message;
  if (typeof message === "string") return message;
  const status = toolResult.status;
  if (typeof status === "string") return status;
  return "";
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
    "postToolUseFailure";

  if (!isNeotomaRelevantTool(toolName, toolInput)) {
    return {};
  }

  const rawError = extractErrorMessage(toolResult);
  const errorClass = classifyErrorMessage(rawError);
  const scrubbed = scrubErrorMessage(rawError);
  const counter = incrementFailureCounter(sessionId, toolName, errorClass);
  const isTransportFailure =
    errorClass === "fetch_failed" ||
    errorClass === "ECONNREFUSED" ||
    errorClass === "ENOTFOUND" ||
    errorClass === "ECONNRESET" ||
    errorClass === "ETIMEDOUT" ||
    errorClass === "timeout";
  const model = (input.model as string) ?? "";
  const nextState = updateTurnState(sessionId, turnId, (s) => ({
    ...s,
    conversation_id: sessionId,
    generation_id: turnId,
    model: model || s.model,
    neotoma_tool_failures: s.neotoma_tool_failures + 1,
    neotoma_connection_failure:
      s.neotoma_connection_failure === true || isTransportFailure,
  }));

  const client = getClient();
  if (!client) return {};

  const observedAt = new Date().toISOString();
  const entity: StoreEntityInput = {
    entity_type: "tool_invocation_failure",
    tool_name: toolName,
    error_class: errorClass,
    error_message_redacted: scrubbed,
    invocation_shape: extractInvocationShape(toolInput),
    turn_key: `${sessionId}:${turnId}`,
    observed_at: observedAt,
    hit_count_session: counter.count,
    ...harnessProvenance({ hook_event: hookEventName }),
  };
  let failureEntityId: string | undefined;
  try {
    const result = (await client.store({
      entities: [entity],
      idempotency_key: makeIdempotencyKey(
        sessionId,
        turnId,
        `tool-failure-${toolName}-${errorClass}-${Date.now()}`
      ),
    })) as { structured?: { entities?: Array<{ entity_id?: string }> } };
    const id = result.structured?.entities?.[0]?.entity_id;
    if (typeof id === "string") failureEntityId = id;
  } catch (err) {
    log("debug", `${hookEventName} store failed: ${(err as Error).message}`);
  }

  const turnRecord = await recordConversationTurn(client, {
    sessionId,
    turnId,
    hookEvent: "post_tool_use_failure",
    harness: "cursor",
    model: model || undefined,
    neotomaToolFailures: nextState.neotoma_tool_failures,
    storedEntityIds: failureEntityId ? [failureEntityId] : undefined,
  });
  if (failureEntityId && turnRecord?.entityId) {
    try {
      await client.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: turnRecord.entityId,
        target_entity_id: failureEntityId,
      });
    } catch (err) {
      log(
        "debug",
        `conversation_turn REFERS_TO failed: ${(err as Error).message}`
      );
    }
  }
  return {};
}

void runHook("postToolUseFailure", handle);
