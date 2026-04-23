/**
 * beforeSubmitPrompt hook.
 *
 * Runs immediately before Cursor sends the user prompt to the agent.
 * Does two things:
 *
 * 1. Retrieval injection — runs a bounded retrieval against Neotoma
 *    and returns it as `additionalContext` (Cursor prepends it to the
 *    system prompt). This is the reliability floor for recall.
 * 2. Persistence safety net — captures the user message as an
 *    agent_message entity linked to the current Cursor session.
 *
 * Deep entity extraction is the agent's job via MCP, not this hook's.
 */

import {
  getClient,
  harnessProvenance,
  log,
  makeIdempotencyKey,
  runHook,
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

function formatContext(
  sections: Array<{ heading: string; body: unknown }>
): string {
  const lines: string[] = [];
  for (const { heading, body } of sections) {
    if (!body) continue;
    lines.push(`## ${heading}`);
    if (Array.isArray(body)) {
      for (const item of body.slice(0, 10)) {
        lines.push(`- ${JSON.stringify(item)}`);
      }
    } else {
      lines.push(JSON.stringify(body));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function handle(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const prompt = (input.prompt as string) ?? (input.userPrompt as string) ?? "";
  const sessionId =
    (input.sessionId as string) ?? (input.conversationId as string) ?? "cursor-unknown";
  const turnId = (input.turnId as string) ?? String(Date.now());

  const client = getClient();
  if (!client) return {};

  const sections: Array<{ heading: string; body: unknown }> = [];
  try {
    for (const identifier of extractIdentifiers(prompt)) {
      try {
        const match = await client.retrieveEntityByIdentifier({ identifier });
        if (match) sections.push({ heading: `Entity: ${identifier}`, body: match });
      } catch (err) {
        log("debug", `retrieveEntityByIdentifier(${identifier}) failed: ${(err as Error).message}`);
      }
    }
    try {
      const timeline = await client.listTimelineEvents({ limit: 5 });
      if (timeline) sections.push({ heading: "Recent timeline", body: timeline });
    } catch (err) {
      log("debug", `listTimelineEvents failed: ${(err as Error).message}`);
    }
  } catch (err) {
    log("warn", `retrieval pass failed: ${(err as Error).message}`);
  }

  try {
    await client.store({
      entities: [
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "user",
          content: prompt,
          turn_key: `${sessionId}:${turnId}`,
          ...harnessProvenance({ hook_event: "beforeSubmitPrompt" }),
        },
      ],
      idempotency_key: makeIdempotencyKey(sessionId, turnId, "user"),
    });
  } catch (err) {
    log("warn", `beforeSubmitPrompt store failed: ${(err as Error).message}`);
  }

  if (sections.length === 0) return {};
  return { additionalContext: formatContext(sections) };
}

void runHook("beforeSubmitPrompt", handle);
