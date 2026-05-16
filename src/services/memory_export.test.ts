import { describe, it, expect } from "vitest";
import { importanceScore, sortEntities, BOOKKEEPING_ENTITY_TYPES } from "./memory_export.js";

describe("memory_export.sortEntities", () => {
  // All same entity_type so type weight does not disambiguate — the test
  // isolates recency and observation_count behavior.
  const sameTypeRows: Array<Record<string, unknown>> = [
    {
      entity_id: "ent_b",
      entity_type: "note",
      last_observation_at: "2025-01-02T00:00:00Z",
      observation_count: 2,
    },
    {
      entity_id: "ent_a",
      entity_type: "note",
      last_observation_at: "2025-01-02T00:00:00Z",
      observation_count: 5,
    },
    {
      entity_id: "ent_c",
      entity_type: "note",
      last_observation_at: "2025-01-03T00:00:00Z",
      observation_count: 5,
    },
    {
      entity_id: "ent_d",
      entity_type: "note",
      last_observation_at: null,
      observation_count: 0,
    },
  ];

  const fixedNow = Date.parse("2025-01-10T00:00:00Z");

  it("recency: orders by last_observation_at desc, ties broken by entity_id asc", () => {
    const result = sortEntities(sameTypeRows, "recency", fixedNow).map((r) => r.entity_id);
    expect(result).toEqual(["ent_c", "ent_a", "ent_b", "ent_d"]);
  });

  it("importance (same type): more observations + more recent wins; ties by entity_id asc", () => {
    // At fixed_now (2025-01-10) both ent_a and ent_c have obs=5, but ent_c is
    // more recent so its decay factor is larger. ent_b (obs=2, same date as
    // ent_a) ranks below. ent_d (no last_observation_at) ranks last.
    const result = sortEntities(sameTypeRows, "importance", fixedNow).map((r) => r.entity_id);
    expect(result).toEqual(["ent_c", "ent_a", "ent_b", "ent_d"]);
  });

  it("importance: up-ranks signal types over bookkeeping types even when bookkeeping is newer", () => {
    const rows: Array<Record<string, unknown>> = [
      {
        entity_id: "ent_msg",
        entity_type: "agent_message",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      {
        entity_id: "ent_task",
        entity_type: "task",
        last_observation_at: "2025-01-01T00:00:00Z",
        observation_count: 1,
      },
    ];
    const result = sortEntities(rows, "importance", fixedNow).map((r) => r.entity_id);
    // typeWeight for agent_message is 0, so task wins even though it is older.
    expect(result[0]).toBe("ent_task");
  });

  it("importance: up-ranks Tier-1 over Tier-2 at the same recency/obs", () => {
    const rows: Array<Record<string, unknown>> = [
      {
        entity_id: "ent_note",
        entity_type: "note",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      {
        entity_id: "ent_task",
        entity_type: "task",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
    ];
    const result = sortEntities(rows, "importance", fixedNow).map((r) => r.entity_id);
    expect(result[0]).toBe("ent_task");
  });

  it("is deterministic across repeated calls", () => {
    const a = sortEntities(sameTypeRows, "importance", fixedNow).map((r) => r.entity_id);
    const b = sortEntities(sameTypeRows, "importance", fixedNow).map((r) => r.entity_id);
    expect(a).toEqual(b);
  });

  it("does not mutate the input array", () => {
    const copy = sameTypeRows.slice();
    sortEntities(sameTypeRows, "importance", fixedNow);
    expect(sameTypeRows).toEqual(copy);
  });
});

describe("memory_export.importanceScore", () => {
  const fixedNow = Date.parse("2025-01-10T00:00:00Z");

  it("returns 0 for chat bookkeeping types regardless of recency/obs", () => {
    const conv = importanceScore(
      {
        entity_type: "conversation",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 100,
      },
      fixedNow
    );
    const msg = importanceScore(
      {
        entity_type: "agent_message",
        last_observation_at: "2025-01-10T00:00:00Z",
        observation_count: 10,
      },
      fixedNow
    );
    expect(conv).toBe(0);
    expect(msg).toBe(0);
  });

  it("gives Tier-1 types higher scores than Tier-2 at same inputs", () => {
    const task = importanceScore(
      {
        entity_type: "task",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    const note = importanceScore(
      {
        entity_type: "note",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    expect(task).toBeGreaterThan(note);
  });

  it("decays older entries below newer entries of same type", () => {
    const recent = importanceScore(
      {
        entity_type: "task",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    const old = importanceScore(
      {
        entity_type: "task",
        last_observation_at: "2024-07-10T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    expect(recent).toBeGreaterThan(old);
  });

  it("unknown types get Tier-3 weight (nonzero, below Tier-2)", () => {
    const unknown = importanceScore(
      {
        entity_type: "widget_thingy",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    const note = importanceScore(
      {
        entity_type: "note",
        last_observation_at: "2025-01-09T00:00:00Z",
        observation_count: 1,
      },
      fixedNow
    );
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBeLessThan(note);
  });
});

describe("memory_export bookkeeping constant", () => {
  it("contains conversation, conversation_message, and legacy agent_message alias", () => {
    expect(BOOKKEEPING_ENTITY_TYPES.has("conversation")).toBe(true);
    expect(BOOKKEEPING_ENTITY_TYPES.has("conversation_message")).toBe(true);
    expect(BOOKKEEPING_ENTITY_TYPES.has("agent_message")).toBe(true);
  });
});
