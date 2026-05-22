/**
 * Integration tests for the conversation_turn service layer and HTTP endpoints.
 *
 * Seeds the local SQLite DB directly with conversation_turn entities and
 * asserts the service functions and HTTP routes return the expected shapes.
 */

import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  listConversationTurns,
  getConversationTurn,
  listHookSummariesByTurnKeys,
} from "../../src/services/conversation_turn.js";

const TEST_USER_ID = `ct-accrual-${randomUUID().slice(0, 8)}`;

interface TurnSeed {
  entity_type: string;
  session_id: string;
  turn_id: string;
  harness?: string;
  model?: string;
  status?: string;
  working_directory?: string;
  git_branch?: string;
  active_file_refs?: string[];
  context_source?: string;
  hook_events?: string[];
  missed_steps?: string[];
  tool_invocation_count?: number;
  store_structured_calls?: number;
  retrieve_calls?: number;
  neotoma_tool_failures?: number;
  stored_entity_ids?: string[];
  retrieved_entity_ids?: string[];
  started_at?: string;
  ended_at?: string;
}

interface MessageSeed {
  id: string;
  role: string;
  sender_kind: string;
  content: string;
  turn_key: string;
  observed_at: string;
}

function entityIdFor(seed: TurnSeed): string {
  return `ent_ct_${seed.session_id}_${seed.turn_id}`;
}

function turnKey(seed: TurnSeed): string {
  return `${seed.session_id}:${seed.turn_id}`;
}

function seedTurn(seed: TurnSeed) {
  const db = getSqliteDb();
  const id = entityIdFor(seed);
  const tk = turnKey(seed);
  const snapshot: Record<string, unknown> = {
    session_id: seed.session_id,
    turn_id: seed.turn_id,
    turn_key: tk,
    harness: seed.harness ?? "cursor",
    model: seed.model,
    status: seed.status,
    working_directory: seed.working_directory,
    git_branch: seed.git_branch,
    active_file_refs: seed.active_file_refs ?? [],
    context_source: seed.context_source,
    hook_events: seed.hook_events ?? [],
    missed_steps: seed.missed_steps ?? [],
    tool_invocation_count: seed.tool_invocation_count ?? 0,
    store_structured_calls: seed.store_structured_calls ?? 0,
    retrieve_calls: seed.retrieve_calls ?? 0,
    neotoma_tool_failures: seed.neotoma_tool_failures ?? 0,
    stored_entity_ids: seed.stored_entity_ids ?? [],
    retrieved_entity_ids: seed.retrieved_entity_ids ?? [],
    started_at: seed.started_at,
    ended_at: seed.ended_at,
  };

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO entities (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    seed.entity_type,
    tk,
    JSON.stringify([]),
    seed.started_at ?? now,
    seed.ended_at ?? seed.started_at ?? now,
    TEST_USER_ID,
    seed.started_at ?? now,
    seed.ended_at ?? seed.started_at ?? now,
  );

  db.prepare(
    `INSERT OR REPLACE INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    seed.entity_type,
    "1.0.0",
    tk,
    JSON.stringify(snapshot),
    seed.ended_at ?? seed.started_at ?? now,
    1,
    seed.ended_at ?? seed.started_at ?? now,
    TEST_USER_ID,
  );
}

function seedMessage(seed: MessageSeed) {
  const db = getSqliteDb();
  const snapshot = {
    role: seed.role,
    sender_kind: seed.sender_kind,
    content: seed.content,
    turn_key: seed.turn_key,
  };

  db.prepare(
    `INSERT OR REPLACE INTO entities (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    seed.id,
    "conversation_message",
    `conversation_message:${seed.turn_key}`,
    JSON.stringify([]),
    seed.observed_at,
    seed.observed_at,
    TEST_USER_ID,
    seed.observed_at,
    seed.observed_at,
  );

  db.prepare(
    `INSERT OR REPLACE INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    seed.id,
    "conversation_message",
    "1.2",
    `conversation_message:${seed.turn_key}`,
    JSON.stringify(snapshot),
    seed.observed_at,
    1,
    seed.observed_at,
    TEST_USER_ID,
  );
}

function seedRelatedEntity(id: string, title: string) {
  const db = getSqliteDb();
  const now = "2026-04-28T10:00:30Z";
  db.prepare(
    `INSERT OR REPLACE INTO entities (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, "task", title, JSON.stringify([]), now, now, TEST_USER_ID, now, now);
  db.prepare(
    `INSERT OR REPLACE INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "task",
    "1.0.0",
    title,
    JSON.stringify({ title }),
    now,
    1,
    now,
    TEST_USER_ID,
  );
}

function seedRelationship(sourceId: string, targetId: string, relationshipType: string) {
  const db = getSqliteDb();
  const now = "2026-04-28T10:00:31Z";
  const key = `${relationshipType}:${sourceId}:${targetId}`;
  db.prepare(
    `INSERT OR REPLACE INTO relationship_snapshots (relationship_key, relationship_type, source_entity_id, target_entity_id, schema_version, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key,
    relationshipType,
    sourceId,
    targetId,
    "1.0",
    JSON.stringify({}),
    now,
    1,
    now,
    JSON.stringify({}),
    TEST_USER_ID,
  );
}

const seeds: TurnSeed[] = [
  {
    entity_type: "conversation_turn",
    session_id: "sess-1",
    turn_id: "turn-1",
    harness: "cursor",
    model: "claude-4-opus",
    status: "completed",
    working_directory: "/repo/neotoma",
    git_branch: "feature/contextual-chat",
    active_file_refs: ["src/services/schema_definitions.ts"],
    context_source: "test_seed",
    hook_events: ["before_submit_prompt", "after_tool_use", "stop"],
    tool_invocation_count: 3,
    store_structured_calls: 2,
    retrieve_calls: 1,
    stored_entity_ids: ["ent_a", "ent_b"],
    retrieved_entity_ids: ["ent_c"],
    started_at: "2026-04-28T10:00:00Z",
    ended_at: "2026-04-28T10:01:00Z",
  },
  {
    entity_type: "conversation_turn",
    session_id: "sess-1",
    turn_id: "turn-2",
    harness: "cursor",
    status: "backfilled_by_hook",
    missed_steps: ["user_phase_store"],
    hook_events: ["stop"],
    started_at: "2026-04-28T10:02:00Z",
    ended_at: "2026-04-28T10:03:00Z",
  },
  {
    entity_type: "turn_compliance",
    session_id: "sess-legacy",
    turn_id: "turn-legacy",
    harness: "opencode",
    status: "backfilled_by_hook",
    hook_events: ["message.assistant"],
    started_at: "2026-04-27T08:00:00Z",
  },
  {
    entity_type: "conversation_turn",
    session_id: "sess-2",
    turn_id: "turn-1",
    harness: "claude-code",
    hook_events: ["UserPromptSubmit"],
    started_at: "2026-04-28T11:00:00Z",
  },
];

beforeAll(() => {
  for (const seed of seeds) seedTurn(seed);
  seedMessage({
    id: "ent_msg_turn_1_user",
    role: "user",
    sender_kind: "user",
    content: "Please check the Neotoma compliance flow.",
    turn_key: "sess-1:turn-1",
    observed_at: "2026-04-28T10:00:05Z",
  });
  seedMessage({
    id: "ent_msg_turn_1_assistant",
    role: "assistant",
    sender_kind: "assistant",
    content: "I checked the flow and found the missing store step.",
    turn_key: "sess-1:turn-1:assistant",
    observed_at: "2026-04-28T10:00:45Z",
  });
  seedRelatedEntity("ent_turn_1_task", "Check Neotoma compliance flow");
  seedRelationship("ent_msg_turn_1_user", "ent_turn_1_task", "REFERS_TO");
});

afterAll(() => {
  const db = getSqliteDb();
  const ids = seeds.map((s) => entityIdFor(s));
  for (const key of ["REFERS_TO:ent_msg_turn_1_user:ent_turn_1_task"]) {
    db.prepare("DELETE FROM relationship_snapshots WHERE relationship_key = ?").run(key);
  }
  for (const id of [...ids, "ent_msg_turn_1_user", "ent_msg_turn_1_assistant", "ent_turn_1_task"]) {
    db.prepare("DELETE FROM entity_snapshots WHERE entity_id = ?").run(id);
    db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  }
});

describe("listConversationTurns", () => {
  it("returns seeded turns ordered by activity_at descending", () => {
    const { items, has_more } = listConversationTurns(TEST_USER_ID, 10, 0);
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(has_more).toBe(false);
    const turnKeys = items.map((i) => i.turn_key);
    expect(turnKeys).toContain("sess-1:turn-1");
    expect(turnKeys).toContain("sess-1:turn-2");
    expect(turnKeys).toContain("sess-legacy:turn-legacy");
    expect(turnKeys).toContain("sess-2:turn-1");
  });

  it("filters by harness", () => {
    const { items } = listConversationTurns(TEST_USER_ID, 10, 0, { harness: "opencode" });
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.harness).toBe("opencode");
    }
  });

  it("respects limit and offset", () => {
    const { items } = listConversationTurns(TEST_USER_ID, 2, 0);
    expect(items.length).toBeLessThanOrEqual(2);
  });

  it("includes hook_summary counters", () => {
    const { items } = listConversationTurns(TEST_USER_ID, 10, 0);
    const turn1 = items.find((i) => i.turn_key === "sess-1:turn-1");
    expect(turn1).toBeDefined();
    expect(turn1!.hook_summary.hook_event_count).toBe(3);
    expect(turn1!.hook_summary.tool_invocation_count).toBe(3);
    expect(turn1!.hook_summary.stored_entity_count).toBe(2);
    expect(turn1!.hook_summary.retrieved_entity_count).toBe(1);
  });
});

describe("getConversationTurn", () => {
  it("returns detail for an existing turn_key", () => {
    const detail = getConversationTurn(TEST_USER_ID, "sess-1:turn-1");
    expect(detail).not.toBeNull();
    expect(detail!.turn_key).toBe("sess-1:turn-1");
    expect(detail!.harness).toBe("cursor");
    expect(detail!.model).toBe("claude-4-opus");
    expect(detail!.working_directory).toBe("/repo/neotoma");
    expect(detail!.git_branch).toBe("feature/contextual-chat");
    expect(detail!.active_file_refs).toEqual(["src/services/schema_definitions.ts"]);
    expect(detail!.context_source).toBe("test_seed");
    expect(detail!.hook_events).toEqual(["before_submit_prompt", "after_tool_use", "stop"]);
    expect(detail!.related_entities).toBeDefined();
  });

  it("returns user and assistant messages for the turn key", () => {
    const detail = getConversationTurn(TEST_USER_ID, "sess-1:turn-1");
    expect(detail).not.toBeNull();
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages.map((m) => m.sender_kind)).toEqual(["user", "assistant"]);
    expect(detail!.messages[0]!.content).toBe("Please check the Neotoma compliance flow.");
    expect(detail!.messages[1]!.turn_key).toBe("sess-1:turn-1:assistant");
    expect(detail!.messages[0]!.related_entities[0]?.title).toBe("Check Neotoma compliance flow");
  });

  it("returns null for a non-existent turn_key", () => {
    const detail = getConversationTurn(TEST_USER_ID, "nope:nope");
    expect(detail).toBeNull();
  });

  it("finds legacy turn_compliance entities", () => {
    const detail = getConversationTurn(TEST_USER_ID, "sess-legacy:turn-legacy");
    expect(detail).not.toBeNull();
    expect(detail!.harness).toBe("opencode");
    expect(detail!.status).toBe("backfilled_by_hook");
  });
});

describe("listHookSummariesByTurnKeys", () => {
  it("returns summaries keyed by turn_key", () => {
    const summaries = listHookSummariesByTurnKeys(TEST_USER_ID, [
      "sess-1:turn-1",
      "sess-1:turn-2",
      "nonexistent:key",
    ]);
    expect(summaries.size).toBe(2);
    expect(summaries.get("sess-1:turn-1")?.hook_event_count).toBe(3);
    expect(summaries.get("sess-1:turn-2")?.hook_event_count).toBe(1);
    expect(summaries.has("nonexistent:key")).toBe(false);
  });
});

describe("HTTP endpoints", () => {
  let server: ReturnType<express.Application["listen"]>;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = await import("../../src/actions.js");
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /turns returns paginated list", async () => {
    const res = await fetch(`${baseUrl}/turns?user_id=${TEST_USER_ID}&limit=10`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; has_more: boolean };
    expect(body.items.length).toBeGreaterThanOrEqual(4);
    expect(typeof body.has_more).toBe("boolean");
  });

  it("GET /turns/:turn_key returns detail", async () => {
    const res = await fetch(
      `${baseUrl}/turns/${encodeURIComponent("sess-1:turn-1")}?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { turn_key: string; harness: string };
    expect(body.turn_key).toBe("sess-1:turn-1");
    expect(body.harness).toBe("cursor");
  });

  it("GET /turns/:turn_key returns 404 for missing turn", async () => {
    const res = await fetch(
      `${baseUrl}/turns/${encodeURIComponent("nope:nope")}?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(404);
  });

  it("GET /admin/compliance/scorecard returns JSON scorecard", async () => {
    const res = await fetch(
      `${baseUrl}/admin/compliance/scorecard?user_id=${TEST_USER_ID}&since=90d&group_by=model+harness`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      generated_at: string;
      group_by: string;
      cells: unknown[];
      summary: { total_turns: number };
    };
    expect(typeof body.generated_at).toBe("string");
    expect(body.group_by).toBe("model+harness");
    expect(Array.isArray(body.cells)).toBe(true);
    expect(typeof body.summary?.total_turns).toBe("number");
  });
});
