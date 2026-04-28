/**
 * sessionStart hook.
 *
 * Fires when a fresh Cursor composer conversation is created. Cursor
 * supports `additional_context` on this hook (verified against the
 * documented contract in https://cursor.com/docs/agent/hooks). We use it
 * to plant a compact, prompt-local "must-do" block right next to the
 * model's working context — the only way small models (Auto / Composer 2,
 * gpt-5.5-fast, claude-haiku, etc.) reliably keep the Neotoma turn rules
 * in attention budget.
 *
 * Behavior:
 *   1. Build a compact reminder via `buildCompactReminder(model)`.
 *   2. Pull a small recent-timeline retrieval seed so the model has at
 *      least one anchor into existing Neotoma state.
 *   3. Concatenate and return as `additional_context`. Failure is silent.
 *
 * This is the layer the previous `beforeSubmitPrompt.additionalContext`
 * code tried to fill — but Cursor's beforeSubmitPrompt does NOT support
 * injection. sessionStart and postToolUse do.
 */

import {
  buildCompactReminder,
  getClient,
  isExpectedNetworkError,
  isSmallModel,
  log,
  pruneStaleTurnState,
  runHook,
  setProfileDebounced,
  updateTurnState,
} from "./_common.js";

function formatTimelineSeed(rawTimeline: unknown): string {
  if (!rawTimeline) return "";
  const events: unknown[] = Array.isArray(rawTimeline)
    ? rawTimeline
    : Array.isArray((rawTimeline as { events?: unknown[] })?.events)
      ? ((rawTimeline as { events: unknown[] }).events)
      : [];
  if (!events || events.length === 0) return "";
  const lines = [
    "",
    "Recent Neotoma timeline (seed; bounded retrieval will return more):",
  ];
  for (const event of events.slice(0, 5)) {
    try {
      lines.push(`- ${JSON.stringify(event)}`);
    } catch {
      lines.push("- <unserializable timeline event>");
    }
  }
  return lines.join("\n");
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload = input as Record<string, unknown>;
  const sessionId =
    (payload.session_id as string) ??
    (payload.conversation_id as string) ??
    "cursor-unknown";
  const generationId =
    (payload.generation_id as string) ?? String(Date.now());
  const model = (payload.model as string) ?? "";

  pruneStaleTurnState();
  updateTurnState(sessionId, generationId, (state) => ({
    ...state,
    conversation_id: sessionId,
    generation_id: generationId,
    model,
  }));

  const compact = buildCompactReminder(model);
  void setProfileDebounced(sessionId, model).catch(() => {
    // best-effort
  });

  let timelineSeed = "";
  const client = getClient();
  if (client) {
    try {
      const timeline = await client.listTimelineEvents({ limit: 5 });
      timelineSeed = formatTimelineSeed(timeline);
    } catch (err) {
      const level = isExpectedNetworkError(err) ? "debug" : "warn";
      log(level, `sessionStart timeline seed failed: ${(err as Error).message}`);
    }
  }

  const env: Record<string, string> = {};
  if (isSmallModel(model)) {
    env.NEOTOMA_HOOK_SMALL_MODEL_DETECTED = "1";
  }

  const additionalContext = `${compact}${timelineSeed}`.trim();
  if (additionalContext) {
    updateTurnState(sessionId, generationId, (s) => ({
      ...s,
      reminder_injected: true,
      reminder_hooks: Array.from(
        new Set([...(s.reminder_hooks ?? []), "session_start"])
      ),
    }));
  }

  const out: Record<string, unknown> = {};
  if (additionalContext) out.additional_context = additionalContext;
  if (Object.keys(env).length > 0) out.env = env;
  return out;
}

void runHook("sessionStart", handle);
