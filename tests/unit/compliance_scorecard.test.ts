import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSqliteDb } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  buildComplianceScorecard,
  resolveScorecardWindow,
} from "../../src/services/compliance/scorecard.js";

const TEST_USER_ID = `compliance-sc-${randomUUID().slice(0, 8)}`;

function seedTurn(input: {
  session_id: string;
  turn_id: string;
  harness: string;
  model?: string;
  status?: string;
  missed_steps?: string[];
  started_at: string;
  ended_at: string;
}) {
  const db = getSqliteDb();
  const turnKey = `${input.session_id}:${input.turn_id}`;
  const id = `ent_comp_${input.session_id}_${input.turn_id}`;
  const snapshot = {
    session_id: input.session_id,
    turn_id: input.turn_id,
    turn_key: turnKey,
    harness: input.harness,
    model: input.model,
    status: input.status,
    missed_steps: input.missed_steps ?? [],
    hook_events: ["stop"],
    started_at: input.started_at,
    ended_at: input.ended_at,
  };
  db.prepare(
    `INSERT OR REPLACE INTO entities (id, entity_type, canonical_name, aliases, created_at, updated_at, user_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "conversation_turn",
    turnKey,
    JSON.stringify([]),
    input.started_at,
    input.ended_at,
    TEST_USER_ID,
    input.started_at,
    input.ended_at,
  );
  db.prepare(
    `INSERT OR REPLACE INTO entity_snapshots (entity_id, entity_type, schema_version, canonical_name, snapshot, computed_at, observation_count, last_observation_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "conversation_turn",
    "1.0.0",
    turnKey,
    JSON.stringify(snapshot),
    input.ended_at,
    1,
    input.ended_at,
    TEST_USER_ID,
  );
}

describe("compliance scorecard", () => {
  const refMs = Date.parse("2026-04-28T15:00:00.000Z");

  beforeAll(() => {
    seedTurn({
      session_id: "s1",
      turn_id: "t1",
      harness: "cursor",
      model: "model-a",
      status: "completed",
      started_at: "2026-04-27T10:00:00.000Z",
      ended_at: "2026-04-27T10:05:00.000Z",
    });
    seedTurn({
      session_id: "s1",
      turn_id: "t2",
      harness: "cursor",
      model: "model-a",
      status: "backfilled_by_hook",
      missed_steps: ["user_phase_store_structured"],
      started_at: "2026-04-27T11:00:00.000Z",
      ended_at: "2026-04-27T11:05:00.000Z",
    });
    seedTurn({
      session_id: "s2",
      turn_id: "t1",
      harness: "claude-code",
      model: "model-b",
      status: "completed",
      started_at: "2026-04-28T09:00:00.000Z",
      ended_at: "2026-04-28T09:01:00.000Z",
    });
  });

  afterAll(() => {
    const db = getSqliteDb();
    const ids = ["ent_comp_s1_t1", "ent_comp_s1_t2", "ent_comp_s2_t1"];
    for (const id of ids) {
      db.prepare(`DELETE FROM entity_snapshots WHERE entity_id = ?`).run(id);
      db.prepare(`DELETE FROM entities WHERE id = ?`).run(id);
    }
  });

  it("resolveScorecardWindow handles relative since against until", () => {
    const w = resolveScorecardWindow("7d", undefined, refMs);
    expect(w.untilIso).toBe(new Date(refMs).toISOString());
    const sinceT = Date.parse(w.sinceIso);
    expect(refMs - sinceT).toBe(7 * 86400000);
  });

  it("aggregates model+harness cells and summary", () => {
    const card = buildComplianceScorecard(TEST_USER_ID, {
      since: "7d",
      until: "2026-04-28T23:59:59.999Z",
      group_by: "model+harness",
      min_turns: 1,
      top_missed_steps: 5,
      ref_ms: refMs,
    });
    expect(card.group_by).toBe("model+harness");
    expect(card.summary.total_turns).toBe(3);
    expect(card.summary.backfilled_turns).toBe(1);
    expect(card.summary.backfill_rate).toBeCloseTo(1 / 3, 5);
    const cursorA = card.cells.find((c) => c.harness === "cursor" && c.model === "model-a");
    expect(cursorA).toBeDefined();
    expect(cursorA!.total_turns).toBe(2);
    expect(cursorA!.backfilled_turns).toBe(1);
    expect(cursorA!.backfill_rate).toBeCloseTo(0.5, 5);
    expect(cursorA!.top_missed_steps[0]?.step).toBe("user_phase_store_structured");
  });

  it("respects min_turns filter", () => {
    const card = buildComplianceScorecard(TEST_USER_ID, {
      since: "7d",
      until: "2026-04-28T23:59:59.999Z",
      group_by: "model+harness",
      min_turns: 5,
      ref_ms: refMs,
    });
    expect(card.cells.length).toBe(0);
    expect(card.summary.total_turns).toBe(0);
  });
});
