/**
 * FU-2026-05-003: GET /conversations/:conversation_id/turn-index
 *
 * Verifies the per-turn index endpoint. End-to-end: stores a conversation +
 * user/assistant message pair + extracted entity, then calls the endpoint
 * and checks turn ordering, stored/retrieved partition, and issue surfacing.
 */

import { describe, expect, it, beforeAll } from "vitest";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

type StoreResponse = {
  entities?: Array<{ entity_id?: string; entity_type?: string }>;
};

type TurnIndexResponse = {
  conversation_id: string;
  conversation_entity_id: string;
  turns: Array<{
    turn_number: number;
    message_entity_id: string;
    role: string;
    turn_key: string;
    content_preview: string | null;
    stored: Array<{ entity_id: string; entity_type: string }>;
    retrieved: Array<{ entity_id: string; entity_type: string }>;
    issues: Array<{ entity_id: string; entity_type: string }>;
  }>;
};

describe("GET /conversations/:conversation_id/turn-index", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns one turn per conversation_message with stored entities partitioned", async () => {
    const convId = `conv-tidx-stored-${Date.now()}`;

    // Turn 1: user message + assistant message that refers to a new task.
    const userRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tidx-stored-user-${Date.now()}`,
        commit: true,
        entities: [
          { entity_type: "conversation", conversation_id: convId, title: "tidx stored" },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "remind me to buy bread",
            turn_key: `${convId}:1`,
            turn_number: 1,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(userRes.status).toBe(200);
    const conversationEntityId = ((await userRes.json()) as StoreResponse).entities?.find(
      (e) => e.entity_type === "conversation"
    )?.entity_id;
    expect(conversationEntityId).toBeTruthy();

    const asstRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tidx-stored-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "Created task: buy bread",
            turn_key: `${convId}:1:assistant`,
            turn_number: 2,
          },
          {
            entity_type: "task",
            title: `buy bread tidx ${Date.now()}`,
            status: "pending",
          },
        ],
        relationships: [
          {
            relationship_type: "PART_OF",
            source_index: 0,
            target_entity_id: conversationEntityId,
          },
          { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
        ],
      }),
    });
    expect(asstRes.status).toBe(200);

    // Fetch by conversation_id.
    const byConvId = await fetch(
      `${apiBase}/conversations/${encodeURIComponent(convId)}/turn-index?user_id=${TEST_USER_ID}`
    );
    expect(byConvId.status).toBe(200);
    const index = (await byConvId.json()) as TurnIndexResponse;
    expect(index.conversation_id).toBe(convId);
    expect(index.conversation_entity_id).toBe(conversationEntityId);
    expect(index.turns.length).toBe(2);

    const [t1, t2] = index.turns;
    expect(t1.turn_number).toBe(1);
    expect(t1.role).toBe("user");
    expect(t1.turn_key).toBe(`${convId}:1`);
    expect(t2.turn_number).toBe(2);
    expect(t2.role).toBe("assistant");
    expect(t2.stored.length).toBe(1);
    expect(t2.stored[0].entity_type).toBe("task");

    // Fetch by entity_id also works.
    const byEntity = await fetch(
      `${apiBase}/conversations/${conversationEntityId}/turn-index?user_id=${TEST_USER_ID}`
    );
    expect(byEntity.status).toBe(200);
    const index2 = (await byEntity.json()) as TurnIndexResponse;
    expect(index2.conversation_entity_id).toBe(conversationEntityId);
  });

  it("partitions user-message references into retrieved when not also stored by assistant", async () => {
    const convId = `conv-tidx-retrieved-${Date.now()}`;

    // First store a standalone task so we have a pre-existing entity to retrieve.
    const preexistingRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tidx-retrieved-pre-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "task",
            title: `pre-existing task tidx ${Date.now()}`,
            status: "pending",
          },
        ],
      }),
    });
    expect(preexistingRes.status).toBe(200);
    const taskEntityId = ((await preexistingRes.json()) as StoreResponse).entities?.[0].entity_id;
    expect(taskEntityId).toBeTruthy();

    // User message REFERS_TO that task. Assistant does NOT.
    const userRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tidx-retrieved-user-${Date.now()}`,
        commit: true,
        entities: [
          { entity_type: "conversation", conversation_id: convId, title: "tidx retrieved" },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "what's pending?",
            turn_key: `${convId}:1`,
            turn_number: 1,
          },
        ],
        relationships: [
          { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
          {
            relationship_type: "REFERS_TO",
            source_index: 1,
            target_entity_id: taskEntityId,
          },
        ],
      }),
    });
    expect(userRes.status).toBe(200);
    const conversationEntityId = ((await userRes.json()) as StoreResponse).entities?.find(
      (e) => e.entity_type === "conversation"
    )?.entity_id;

    const asstRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tidx-retrieved-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "You have one task pending.",
            turn_key: `${convId}:1:assistant`,
            turn_number: 2,
          },
        ],
        relationships: [
          {
            relationship_type: "PART_OF",
            source_index: 0,
            target_entity_id: conversationEntityId,
          },
        ],
      }),
    });
    expect(asstRes.status).toBe(200);

    const res = await fetch(
      `${apiBase}/conversations/${encodeURIComponent(convId)}/turn-index?user_id=${TEST_USER_ID}`
    );
    expect(res.status).toBe(200);
    const index = (await res.json()) as TurnIndexResponse;
    expect(index.turns.length).toBe(2);
    const userTurn = index.turns.find((t) => t.role === "user");
    expect(userTurn).toBeDefined();
    expect(userTurn!.retrieved.length).toBe(1);
    expect(userTurn!.retrieved[0].entity_id).toBe(taskEntityId);
    expect(userTurn!.stored.length).toBe(0);
  });

  it("returns 404 when the conversation is not found", async () => {
    const res = await fetch(
      `${apiBase}/conversations/nonexistent-conv-${Date.now()}/turn-index?user_id=${TEST_USER_ID}`
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("ERR_TURN_INDEX_CONVERSATION_NOT_FOUND");
  });
});
