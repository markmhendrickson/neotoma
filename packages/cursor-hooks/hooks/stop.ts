/**
 * stop hook.
 *
 * Three responsibilities, in order:
 *
 *   1. Persist the assistant final message as a `conversation_message`
 *      so the turn is preserved even if the agent skipped the closing
 *      MCP store. (Idempotent with the agent's own write.)
 *
 *   2. Compliance backfill: when the per-turn state shows the agent never
 *      called `store_structured` this turn, emit a `turn_compliance`
 *      observation summarising what was missed, and ensure the
 *      conversation entity exists with PART_OF links from both the user
 *      message and the assistant message. This makes the turn graph
 *      survive small-model regimes that ignore the MCP instructions.
 *
 *   3. Optional auto follow-up: when `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP` is
 *      enabled (default `auto` — on for small-model regimes, off for
 *      strong models) and the agent skipped writes, return
 *      `followup_message` so Cursor re-prompts the agent for one
 *      compliance pass. We rely on the hook's `loop_limit: 1` to cap
 *      this at a single retry per turn.
 */

import {
  buildCompactReminder,
  diagnoseSkippedStore,
  getClient,
  harnessProvenance,
  isExpectedNetworkError,
  isSmallModel,
  log,
  makeIdempotencyKey,
  readTurnState,
  recordConversationTurn,
  runHook,
  writeTurnState,
  type SkippedStoreDiagnosis,
} from "./_common.js";

function pickEntityId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as { structured?: { entities?: Array<{ entity_id?: string }> } };
  const first = r.structured?.entities?.[0];
  if (first && typeof first.entity_id === "string") return first.entity_id;
  return undefined;
}

function complianceFollowupEnabled(model: string): boolean {
  const raw = (
    process.env.NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP ?? "auto"
  ).toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  if (raw === "on" || raw === "true" || raw === "1") return true;
  return (
    isSmallModel(model) ||
    process.env.NEOTOMA_HOOK_SMALL_MODEL_DETECTED === "1"
  );
}

function followupMessage(
  diagnosis: SkippedStoreDiagnosis | undefined
): string {
  const base = [
    "Neotoma compliance pass: the previous turn skipped the required Neotoma writes.",
    "Please re-run this turn now using one batched store_structured call:",
    "(1) bounded retrieval if the user message implied known entities,",
    "(2) user-phase store with conversation + user conversation_message + extracted entities + PART_OF/REFERS_TO links,",
    "(3) closing assistant store with the exact reply text.",
    "Reply with a one-line summary noting the entity_ids stored.",
  ].join(" ");
  if (
    diagnosis &&
    (diagnosis.confidence === "high" || diagnosis.confidence === "medium") &&
    diagnosis.classification !== "false_positive_or_no_material_content"
  ) {
    return `${base} Likely cause: ${diagnosis.classification.replace(
      /_/g,
      " "
    )} — ${diagnosis.reason}`;
  }
  return base;
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload = input as Record<string, unknown>;
  const sessionId =
    (payload.sessionId as string) ??
    (payload.conversation_id as string) ??
    (payload.conversationId as string) ??
    "cursor-unknown";
  const turnId =
    (payload.turnId as string) ??
    (payload.generation_id as string) ??
    String(Date.now());
  const finalText =
    (payload.text as string) ??
    (payload.response as string) ??
    (payload.assistantResponse as string) ??
    "";
  const status = (payload.status as string) ?? "completed";
  const loopCount =
    typeof payload.loop_count === "number" ? (payload.loop_count as number) : 0;

  const state = readTurnState(sessionId, turnId);
  const model = (payload.model as string) ?? state.model ?? "";

  const client = getClient();
  if (!client) return {};

  let assistantEntityId = state.assistant_message_entity_id;
  if (finalText && !assistantEntityId) {
    try {
      const result = await client.store({
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: finalText,
            turn_key: `${sessionId}:${turnId}:assistant`,
            observed_at: new Date().toISOString(),
            ...harnessProvenance({ hook_event: "stop" }),
          },
        ],
        idempotency_key: makeIdempotencyKey(sessionId, turnId, "assistant"),
      });
      assistantEntityId = pickEntityId(result);
    } catch (err) {
      const level = isExpectedNetworkError(err) ? "debug" : "warn";
      log(level, `stop store failed: ${(err as Error).message}`);
    }
  }

  const skippedStore = state.store_structured_calls === 0;
  const hadFinalText = Boolean(finalText && finalText.trim().length > 0);
  const hadMaterialContent = hadFinalText || state.tool_invocation_count > 0;
  let backfilled = false;
  let conversationEntityId = state.conversation_entity_id;
  let diagnosis: SkippedStoreDiagnosis | undefined;
  if (skippedStore && hadMaterialContent) {
    diagnosis = diagnoseSkippedStore({ state, hadFinalText });
    const missedSteps: string[] = [];
    if (!state.user_message_stored) missedSteps.push("user_message_store");
    missedSteps.push("user_phase_store_structured");
    if (!finalText) missedSteps.push("assistant_message_store");

    if (!conversationEntityId) {
      try {
        const convResult = await client.store({
          entities: [
            {
              entity_type: "conversation",
              canonical_name: `Cursor session ${sessionId}`,
              turn_key: `${sessionId}`,
              ...harnessProvenance({ hook_event: "stop_backfill" }),
            },
          ],
          idempotency_key: `conversation-${sessionId}-root`,
        });
        conversationEntityId = pickEntityId(convResult);
      } catch (err) {
        log(
          "debug",
          `stop backfill conversation store failed: ${(err as Error).message}`
        );
      }
    }

    if (conversationEntityId) {
      if (state.user_message_entity_id) {
        try {
          await client.createRelationship({
            relationship_type: "PART_OF",
            source_entity_id: state.user_message_entity_id,
            target_entity_id: conversationEntityId,
          });
        } catch (err) {
          log(
            "debug",
            `stop backfill PART_OF (user) failed: ${(err as Error).message}`
          );
        }
      }
      if (assistantEntityId) {
        try {
          await client.createRelationship({
            relationship_type: "PART_OF",
            source_entity_id: assistantEntityId,
            target_entity_id: conversationEntityId,
          });
        } catch (err) {
          log(
            "debug",
            `stop backfill PART_OF (assistant) failed: ${
              (err as Error).message
            }`
          );
        }
      }
    }

    const turnRecord = await recordConversationTurn(client, {
      sessionId,
      turnId,
      hookEvent: "stop",
      harness: "cursor",
      model: model || undefined,
      status: "backfilled_by_hook",
      missedSteps,
      toolInvocationCount: state.tool_invocation_count,
      storeStructuredCalls: state.store_structured_calls,
      retrieveCalls: state.retrieve_calls,
      neotomaToolFailures: state.neotoma_tool_failures,
      harnessLoopCount: loopCount,
      conversationEntityId: conversationEntityId ?? sessionId,
      safetyNetUsed: true,
      reminderInjected: state.reminder_injected === true,
      instructionDiagnostics: {
        classification: diagnosis.classification,
        reason: diagnosis.reason,
        signals: diagnosis.signals,
        local_build: diagnosis.local_build,
      },
      recommendedRepairs: diagnosis.recommended_repairs,
      diagnosisConfidence: diagnosis.confidence,
      endedAt: new Date().toISOString(),
    });
    if (turnRecord) {
      backfilled = true;
      if (turnRecord.entityId && conversationEntityId) {
        try {
          await client.createRelationship({
            relationship_type: "PART_OF",
            source_entity_id: turnRecord.entityId,
            target_entity_id: conversationEntityId,
          });
        } catch (err) {
          log(
            "debug",
            `stop conversation_turn PART_OF failed: ${(err as Error).message}`
          );
        }
      }
    }
  } else {
    await recordConversationTurn(client, {
      sessionId,
      turnId,
      hookEvent: "stop",
      harness: "cursor",
      model: model || undefined,
      status,
      toolInvocationCount: state.tool_invocation_count,
      storeStructuredCalls: state.store_structured_calls,
      retrieveCalls: state.retrieve_calls,
      neotomaToolFailures: state.neotoma_tool_failures,
      harnessLoopCount: loopCount,
      conversationEntityId: conversationEntityId ?? sessionId,
      safetyNetUsed: false,
      reminderInjected: state.reminder_injected === true,
      endedAt: new Date().toISOString(),
    });
  }

  writeTurnState({
    ...state,
    conversation_id: sessionId,
    generation_id: turnId,
    model: model || state.model,
    assistant_message_stored:
      state.assistant_message_stored || Boolean(assistantEntityId),
    assistant_message_entity_id:
      assistantEntityId ?? state.assistant_message_entity_id,
    conversation_entity_id:
      conversationEntityId ?? state.conversation_entity_id,
    reminder_injected: state.reminder_injected === true,
    reminder_hooks: state.reminder_hooks ?? [],
    neotoma_connection_failure: state.neotoma_connection_failure === true,
  });

  const followupAllowed =
    skippedStore &&
    hadMaterialContent &&
    loopCount === 0 &&
    status === "completed" &&
    complianceFollowupEnabled(model);
  if (!followupAllowed) {
    return backfilled ? {} : {};
  }

  const reminder = buildCompactReminder(model);
  return {
    followup_message: `${followupMessage(diagnosis)}\n\n${reminder}`,
  };
}

void runHook("stop", handle);
