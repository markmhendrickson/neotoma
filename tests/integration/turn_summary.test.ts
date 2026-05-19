/**
 * FU-2026-05-002: POST /turn_summary
 *
 * Computes the per-turn status line and widget URI from the assistant
 * conversation_message's REFERS_TO edges. End-to-end: stores a conversation +
 * user message + extracted entity + assistant message, then calls
 * /turn_summary and checks the response shape.
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

type TurnSummaryResponse = {
  status_line: string;
  widget_uri: string | null;
  turn_number: number;
  conversation_message_count: number;
  stored: Array<{ entity_id: string; entity_type: string }>;
  retrieved: Array<{ entity_id: string; entity_type: string }>;
  issues: Array<{ entity_id: string; entity_type: string }>;
};

describe("POST /turn_summary", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns status_line with stored count for a turn that created an entity", async () => {
    const convId = `conv-tsummary-stored-${Date.now()}`;
    const userTurnKey = `${convId}:1`;
    const asstTurnKey = `${convId}:1:assistant`;

    const userRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tsummary-stored-user-${Date.now()}`,
        commit: true,
        entities: [
          { entity_type: "conversation", conversation_id: convId, title: "tsummary stored" },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "buy bread tomorrow",
            turn_key: userTurnKey,
            turn_number: 1,
          },
        ],
        relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      }),
    });
    expect(userRes.status).toBe(200);
    const userBody = (await userRes.json()) as StoreResponse;
    const conversationEntityId = userBody.entities?.find(
      (e) => e.entity_type === "conversation"
    )?.entity_id;
    expect(conversationEntityId).toBeTruthy();

    const asstRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tsummary-stored-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "Created task: buy bread",
            turn_key: asstTurnKey,
            turn_number: 2,
          },
          {
            entity_type: "task",
            title: `buy bread tsummary ${Date.now()}`,
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

    const sumRes = await fetch(`${apiBase}/turn_summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        conversation_id: convId,
        turn_key: asstTurnKey,
      }),
    });
    expect(sumRes.status).toBe(200);
    const summary = (await sumRes.json()) as TurnSummaryResponse;
    expect(summary.turn_number).toBe(2);
    expect(summary.conversation_message_count).toBe(2);
    expect(summary.stored.length).toBe(1);
    expect(summary.stored[0].entity_type).toBe("task");
    expect(summary.retrieved.length).toBe(0);
    expect(summary.issues.length).toBe(0);
    expect(summary.status_line).toBe("msg 2/2, stored 1, retrieved 0");
    expect(summary.widget_uri).toMatch(/^ui:\/\/neotoma\/turn-summary\?/);
  });

  it("appends issues suffix to status_line when issues > 0", async () => {
    const convId = `conv-tsummary-issues-${Date.now()}`;
    const userTurnKey = `${convId}:1`;
    const asstTurnKey = `${convId}:1:assistant`;

    const userRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tsummary-issues-user-${Date.now()}`,
        commit: true,
        entities: [
          { entity_type: "conversation", conversation_id: convId, title: "tsummary issues" },
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: "report a problem",
            turn_key: userTurnKey,
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

    const issueTitle = `tsummary issue ${Date.now()}`;
    const asstRes = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `tsummary-issues-asst-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: "Filed issue",
            turn_key: asstTurnKey,
            turn_number: 2,
          },
          {
            entity_type: "issue",
            title: issueTitle,
            body: "an issue body",
            visibility: "private",
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

    const sumRes = await fetch(`${apiBase}/turn_summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        conversation_id: convId,
        turn_key: asstTurnKey,
      }),
    });
    expect(sumRes.status).toBe(200);
    const summary = (await sumRes.json()) as TurnSummaryResponse;
    expect(summary.issues.length).toBe(1);
    expect(summary.status_line).toMatch(/, issues 1$/);
  });

  it("returns 404 when the turn_key has no matching message", async () => {
    const res = await fetch(`${apiBase}/turn_summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        conversation_id: "conv-tsummary-missing",
        turn_key: `conv-tsummary-missing:999:assistant`,
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("ERR_TURN_SUMMARY_MESSAGE_NOT_FOUND");
  });

  it("rejects requests missing conversation_id or turn_key with 400", async () => {
    const res = await fetch(`${apiBase}/turn_summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error_code?: string };
    expect(body.error_code).toBe("ERR_TURN_SUMMARY_BAD_REQUEST");
  });
});
