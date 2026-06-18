/**
 * FU-2026-05-001: StoreStructuredResponse.conversation_message_count
 *
 * When a store call creates or updates a `conversation_message` entity linked
 * `PART_OF` a conversation, the response includes a post-commit count of all
 * sibling `conversation_message` entities `PART_OF` that conversation. The
 * field is omitted when no conversation context can be resolved.
 */

import { describe, expect, it, beforeAll } from "vitest";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

type StoreResponse = {
  conversation_message_count?: number;
  entities?: Array<{ entity_id?: string; entity_type?: string }>;
};

describe("POST /store conversation_message_count", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns 1 on the first user message of a fresh conversation", async () => {
    const convId = `conv-msgcount-fresh-${Date.now()}`;
    const turnKey = `${convId}:1`;

    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `msgcount-fresh-user-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation",
            conversation_id: convId,
            title: "msgcount fresh conversation",
          },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "first user message",
            turn_key: turnKey,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as StoreResponse;
    expect(body.conversation_message_count).toBe(1);
  });

  it("increments across user and assistant messages in the same conversation", async () => {
    const convId = `conv-msgcount-incr-${Date.now()}`;

    const userRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `msgcount-incr-user-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation",
            conversation_id: convId,
            title: "msgcount incrementing conversation",
          },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "user 1",
            turn_key: `${convId}:1`,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(userRes.status).toBe(200);
    const userBody = (await userRes.json()) as StoreResponse;
    expect(userBody.conversation_message_count).toBe(1);

    const conversationEntityId = userBody.entities?.find(
      (e) => e.entity_type === "conversation"
    )?.entity_id;
    expect(conversationEntityId).toBeTruthy();

    const asstRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `msgcount-incr-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "assistant 1",
            turn_key: `${convId}:1:assistant`,
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
    const asstBody = (await asstRes.json()) as StoreResponse;
    expect(asstBody.conversation_message_count).toBe(2);
  });

  it("omits the field when no conversation_message is stored", async () => {
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `msgcount-no-conv-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "note",
            title: `msgcount unrelated note ${Date.now()}`,
            content: "no conversation context",
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as StoreResponse;
    expect(body.conversation_message_count).toBeUndefined();
  });
});
