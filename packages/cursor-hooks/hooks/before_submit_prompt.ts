/**
 * beforeSubmitPrompt hook.
 *
 * Cursor's `beforeSubmitPrompt` output schema is `{ continue, user_message
 * }` only — see https://cursor.com/docs/agent/hooks. Earlier versions of
 * this hook returned `additionalContext`, which Cursor silently dropped.
 *
 * What we still do here (the parts Cursor honors or that are useful as a
 * passive floor regardless):
 *
 *   1. Persist the conversation + user `conversation_message` so the turn is
 *      recorded with bounded workspace context even if the agent forgets the
 *      user-phase store. This is idempotent with the agent's own MCP write
 *      via the shared idempotency key.
 *   2. Track the conversation/user entity ids + extracted-identifier list in
 *      per-turn state so `stop.ts` can decide whether to backfill.
 *   3. Bump the failure-hint counter so the next `postToolUse`
 *      `additional_context` injection (the real surface Cursor honors) can
 *      surface a one-shot hint about repeated tool failures.
 *
 * Retrieval injection moved to `sessionStart.additional_context` (initial
 * system context) and `postToolUse.additional_context` (per-tool nudges).
 */

import {
  collectHookWorkspaceContext,
  conversationContextFields,
  getClient,
  harnessProvenance,
  isExpectedNetworkError,
  log,
  makeIdempotencyKey,
  recordConversationTurn,
  runHook,
  turnContextFields,
  updateTurnState,
} from "./_common.js";

const IDENTIFIER_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_.\-]{2,})/g;

function extractIdentifiers(prompt: string): string[] {
  if (!prompt) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = IDENTIFIER_PATTERN.exec(prompt)) !== null) {
    found.add(match[1]);
    if (found.size >= 5) break;
  }
  return [...found];
}

function extractEntityId(result: unknown, index = 0): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as { structured?: { entities?: Array<{ entity_id?: string }> } };
  const entity = r.structured?.entities?.[index];
  if (entity && typeof entity.entity_id === "string") return entity.entity_id;
  return undefined;
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const prompt = (input.prompt as string) ?? (input.userPrompt as string) ?? "";
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
  const model = (input.model as string) ?? "";
  const context = collectHookWorkspaceContext(input);

  const identifiers = extractIdentifiers(prompt);

  const client = getClient();
  if (!client) {
    updateTurnState(sessionId, turnId, (s) => ({
      ...s,
      conversation_id: sessionId,
      generation_id: turnId,
      model,
    }));
    return {};
  }

  let conversationEntityId: string | undefined;
  let userEntityId: string | undefined;
  try {
    const result = await client.store({
      entities: [
        {
          entity_type: "conversation",
          conversation_id: sessionId,
          title: `Cursor session ${context.repositoryName ?? sessionId}`,
          thread_kind: "human_agent",
          ...harnessProvenance({ hook_event: "beforeSubmitPrompt" }),
          ...conversationContextFields(context),
        },
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "user",
          content: prompt,
          turn_key: `${sessionId}:${turnId}`,
          ...harnessProvenance({ hook_event: "beforeSubmitPrompt" }),
        },
      ],
      relationships: [
        {
          relationship_type: "PART_OF",
          source_index: 1,
          target_index: 0,
        },
      ],
      idempotency_key: makeIdempotencyKey(sessionId, turnId, "user"),
    });
    conversationEntityId = extractEntityId(result, 0);
    userEntityId = extractEntityId(result, 1);
  } catch (err) {
    const level = isExpectedNetworkError(err) ? "debug" : "warn";
    log(level, `beforeSubmitPrompt store failed: ${(err as Error).message}`);
  }

  updateTurnState(sessionId, turnId, (s) => ({
    ...s,
    conversation_id: sessionId,
    generation_id: turnId,
    model: model || s.model,
    user_message_stored: s.user_message_stored || Boolean(userEntityId),
    user_message_entity_id: userEntityId ?? s.user_message_entity_id,
    conversation_entity_id: conversationEntityId ?? s.conversation_entity_id,
  }));

  // Best-effort: warm up @-identifier retrievals into the in-process Neotoma
  // server so subsequent agent retrieval calls hit hot data. Results are
  // intentionally NOT returned here — Cursor drops `additional_context` from
  // beforeSubmitPrompt, and retrieval surfaces are sessionStart + postToolUse.
  const retrievedEntityIds: string[] = [];
  if (identifiers.length > 0) {
    for (const identifier of identifiers) {
      try {
        const match = (await client.retrieveEntityByIdentifier({
          identifier,
        })) as
          | {
              entity_id?: string;
              entity?: { entity_id?: string };
            }
          | null;
        const id =
          (typeof match?.entity_id === "string" && match.entity_id) ||
          (typeof match?.entity?.entity_id === "string" &&
            match.entity.entity_id) ||
          undefined;
        if (id) retrievedEntityIds.push(id);
      } catch (err) {
        log(
          "debug",
          `retrieveEntityByIdentifier(${identifier}) failed: ${
            (err as Error).message
          }`
        );
      }
    }
  }

  await recordConversationTurn(client, {
    sessionId,
    turnId,
    hookEvent: "before_submit_prompt",
    harness: "cursor",
    model: model || undefined,
    conversationEntityId: conversationEntityId ?? sessionId,
    storedEntityIds: userEntityId ? [userEntityId] : undefined,
    retrievedEntityIds:
      retrievedEntityIds.length > 0 ? retrievedEntityIds : undefined,
    startedAt: new Date().toISOString(),
    ...turnContextFields(context),
  });

  return {};
}

void runHook("beforeSubmitPrompt", handle);
