/**
 * FU-2026-05-002: POST /turn_summary
 *
 * Computes the per-turn status line and widget URI from the assistant
 * conversation_message's REFERS_TO edges. End-to-end: stores a conversation +
 * user message + extracted entity + assistant message, then calls
 * /turn_summary and checks the response shape.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";

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
  groups: Record<
    "created" | "updated" | "retrieved" | "ambiguous",
    Array<{ entity_id: string; entity_type: string; label?: string | null }>
  >;
  card: { groups: Array<{ key: string; count: number }> };
  fallback_text: string;
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
    // Observation-grounded groups, card and server-rendered text.
    expect(summary.groups.created.map((e) => e.entity_type)).toEqual(["task"]);
    expect(summary.groups.created[0].label).toMatch(/^buy bread tsummary /);
    expect(summary.card.groups.map((g) => [g.key, g.count])).toEqual([["created", 1]]);
    const lines = summary.fallback_text.split("\n");
    expect(lines[0]).toMatch(/^🧠 Neotoma/);
    expect(lines[0]).toContain("tsummary stored");
    expect(lines[1]).toBe("**Created (1)**");
    expect(lines[2]).toMatch(
      /^- ✅ buy bread tsummary \d+ \(\[task\]\(https?:\/\/[^)]+\/entities\/ent_/
    );
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
            // #1778 made `title` deliberately non-identifying for issues: a
            // write carrying neither the (github_number, repo) composite nor
            // local_issue_id now fails loudly instead of minting a title-keyed
            // duplicate. This test is about the issues suffix on the status
            // line, not issue identity, so give the fixture a local identity.
            local_issue_id: `tsummary-${Date.now()}`,
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

  async function storeJson(body: Record<string, unknown>): Promise<StoreResponse> {
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID, commit: true, ...body }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as StoreResponse;
  }

  async function summarize(convId: string, turnKey: string): Promise<TurnSummaryResponse> {
    const res = await fetch(`${apiBase}/turn_summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID, conversation_id: convId, turn_key: turnKey }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as TurnSummaryResponse;
  }

  /** Store a user message for `turn`, returning the conversation entity id. */
  async function userTurn(convId: string, turn: number, title: string): Promise<string> {
    const body = await storeJson({
      idempotency_key: `${convId}-user-${turn}`,
      entities: [
        { entity_type: "conversation", conversation_id: convId, title },
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "user",
          content: `user turn ${turn}`,
          turn_key: `${convId}:${turn}`,
          turn_number: turn * 2 - 1,
        },
      ],
      relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
    });
    const id = body.entities?.find((e) => e.entity_type === "conversation")?.entity_id;
    expect(id).toBeTruthy();
    return id as string;
  }

  function assistantMessage(convId: string, turn: number) {
    return {
      entity_type: "conversation_message",
      role: "assistant",
      sender_kind: "assistant",
      content: `assistant turn ${turn}`,
      turn_key: `${convId}:${turn}:assistant`,
      turn_number: turn * 2,
    };
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

  it("classifies a pre-existing entity observed this turn as Updated and a cited one as Retrieved", async () => {
    const convId = `conv-tsummary-groups-${Date.now()}`;

    // Turn 1 creates two tasks.
    const conv = await userTurn(convId, 1, "tsummary groups");
    const turn1 = await storeJson({
      idempotency_key: `${convId}-asst-1`,
      entities: [
        assistantMessage(convId, 1),
        { entity_type: "task", title: `tsummary updated ${Date.now()}`, status: "pending" },
        { entity_type: "task", title: `tsummary cited ${Date.now()}`, status: "pending" },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 0, target_entity_id: conv },
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 2 },
      ],
    });
    const taskIds = (turn1.entities ?? [])
      .filter((e) => e.entity_type === "task")
      .map((e) => e.entity_id as string);
    expect(taskIds).toHaveLength(2);
    const [updatedId, citedId] = taskIds;

    await tick();

    // Turn 2 writes a new observation on one task (by target_id) and only
    // cites the other.
    await userTurn(convId, 2, "tsummary groups");
    await storeJson({
      idempotency_key: `${convId}-asst-2`,
      entities: [
        assistantMessage(convId, 2),
        { entity_type: "task", target_id: updatedId, status: "done" },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 0, target_entity_id: conv },
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
        { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: citedId },
      ],
    });

    const summary = await summarize(convId, `${convId}:2:assistant`);
    expect(summary.groups.created).toEqual([]);
    expect(summary.groups.updated.map((e) => e.entity_id)).toEqual([updatedId]);
    expect(summary.groups.retrieved.map((e) => e.entity_id)).toEqual([citedId]);
    expect(summary.card.groups.map((g) => g.key)).toEqual(["updated", "retrieved"]);
    expect(summary.fallback_text).toContain("**Updated (1)**");
    expect(summary.fallback_text).toContain("**Retrieved (1)**");
    expect(summary.fallback_text).not.toContain("Created");

    // MCP: structuredContent for MCP Apps hosts, the same object as JSON text,
    // and fallback_text as its own text block for clients without MCP Apps.
    const mcp = (await new NeotomaServer().executeToolForCli(
      "neotoma_turn_summary",
      { conversation_id: convId, turn_key: `${convId}:2:assistant` },
      TEST_USER_ID
    )) as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: TurnSummaryResponse;
    };
    expect(mcp.structuredContent).toEqual(JSON.parse(mcp.content[0].text));
    expect(mcp.structuredContent?.groups.updated.map((e) => e.entity_id)).toEqual([updatedId]);
    expect(mcp.content[1]).toEqual({ type: "text", text: mcp.structuredContent?.fallback_text });
  });

  it("lists a heuristic merge under a warn-policy schema as Ambiguous, not Updated", async () => {
    const stamp = Date.now();
    const entityType = `tsummary_gadget_${stamp}`;
    const reg = await fetch(`${apiBase}/register_schema`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        entity_type: entityType,
        schema_definition: {
          fields: {
            name: { type: "string" },
            sku: { type: "string" },
            color: { type: "string" },
          },
          // "warn" requires declared identity, but the writes below omit
          // `sku`, so resolution falls through to the heuristic name match;
          // landing on the existing row then raises HEURISTIC_MERGE instead
          // of merging silently.
          canonical_name_fields: ["sku"],
          name_collision_policy: "warn",
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      }),
    });
    expect(reg.status).toBe(200);

    const convId = `conv-tsummary-ambiguous-${stamp}`;
    const gadgetName = `Gadget ${stamp}`;
    const conv = await userTurn(convId, 1, "tsummary ambiguous");
    await storeJson({
      idempotency_key: `${convId}-asst-1`,
      entities: [
        assistantMessage(convId, 1),
        { entity_type: entityType, name: gadgetName, color: "red" },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 0, target_entity_id: conv },
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
      ],
    });

    await tick();

    await userTurn(convId, 2, "tsummary ambiguous");
    const turn2 = (await storeJson({
      idempotency_key: `${convId}-asst-2`,
      entities: [
        assistantMessage(convId, 2),
        { entity_type: entityType, name: gadgetName, color: "blue" },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 0, target_entity_id: conv },
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
      ],
    })) as StoreResponse & { warnings?: Array<{ code?: string }> };
    // Precondition: the store itself reported the heuristic merge.
    expect(JSON.stringify(turn2)).toContain("HEURISTIC_MERGE");
    const gadgetId = turn2.entities?.find((e) => e.entity_type === entityType)?.entity_id;
    expect(gadgetId).toBeTruthy();

    const summary = await summarize(convId, `${convId}:2:assistant`);
    expect(summary.groups.updated).toEqual([]);
    expect(summary.groups.ambiguous.map((e) => e.entity_id)).toEqual([gadgetId]);
    expect(summary.card.groups.map((g) => g.key)).toEqual(["ambiguous"]);
    const lines = summary.fallback_text.split("\n");
    expect(lines[1]).toBe("**Ambiguous (1)**");
    expect(lines[2]).toContain(gadgetName);
    expect(lines[2]).toMatch(/ — heuristic match via identity_rule "name_key:name"$/);
  });

  it("returns empty fallback_text for a turn that touched only chat bookkeeping", async () => {
    const convId = `conv-tsummary-empty-${Date.now()}`;
    const conv = await userTurn(convId, 1, "tsummary empty");
    await storeJson({
      idempotency_key: `${convId}-asst-1`,
      entities: [assistantMessage(convId, 1)],
      relationships: [{ relationship_type: "PART_OF", source_index: 0, target_entity_id: conv }],
    });
    const summary = await summarize(convId, `${convId}:1:assistant`);
    expect(summary.fallback_text).toBe("");
    expect(summary.card.groups).toEqual([]);
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
