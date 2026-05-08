/**
 * Reject closing assistant `conversation_message` rows that reuse the
 * user-phase `turn_key`, which would resolve to the same entity and corrupt
 * the transcript (ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT).
 */

import { describe, expect, it, beforeAll } from "vitest";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

describe("POST /store conversation_message role conflict", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT when assistant reuses user turn_key", async () => {
    const convId = `conv-role-guard-${Date.now()}`;
    const turnKey = `${convId}:99`;

    const first = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `role-guard-user-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation",
            conversation_id: convId,
            title: "Role guard conversation",
          },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "user line",
            turn_key: turnKey,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `role-guard-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "assistant line",
            turn_key: turnKey,
          },
        ],
      }),
    });

    expect(second.status).toBe(400);
    const body = (await second.json()) as {
      error?: {
        code?: string;
        issues?: Array<{ code?: string; hint?: string }>;
      };
    };
    expect(body.error?.code).toBe("ERR_STORE_RESOLUTION_FAILED");
    const issue = body.error?.issues?.find(
      (i) => i.code === "ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT",
    );
    expect(issue).toBeDefined();
    expect(typeof issue?.hint).toBe("string");
    expect(issue?.hint).toMatch(/:assistant/);
  });

  it("allows assistant message when turn_key uses :assistant suffix", async () => {
    const convId = `conv-role-ok-${Date.now()}`;
    const userTurn = `${convId}:100`;

    const first = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `role-ok-user-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation",
            conversation_id: convId,
            title: "Role ok conversation",
          },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "user line",
            turn_key: userTurn,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `role-ok-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "assistant line",
            turn_key: `${userTurn}:assistant`,
          },
        ],
      }),
    });

    expect(second.status).toBe(200);
  });
});
