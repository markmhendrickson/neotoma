/**
 * filterOwnedEntityIds filters the owner in code (so the id lookup uses the
 * primary key). The owner semantics must not change: only ids owned by the
 * caller come back; another user's ids and unknown ids are excluded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { filterOwnedEntityIds } from "../../src/services/scoped_reads.js";

const suffix = `${process.pid}_${Math.floor(performance.now())}`;
const owner = `user_owned_filter_a_${suffix}`;
const other = `user_owned_filter_b_${suffix}`;
const ownedA = `ent_owned_filter_a1_${suffix}`;
const ownedB = `ent_owned_filter_a2_${suffix}`;
const foreign = `ent_owned_filter_b1_${suffix}`;
const unknown = `ent_owned_filter_missing_${suffix}`;

beforeAll(async () => {
  for (const [id, user_id] of [
    [ownedA, owner],
    [ownedB, owner],
    [foreign, other],
  ]) {
    const { error } = await db
      .from("entities")
      .insert({ id, user_id, entity_type: "note", canonical_name: `synthetic ${id}` });
    if (error) throw new Error(error.message);
  }
});

afterAll(async () => {
  await db.from("entities").delete().in("id", [ownedA, ownedB, foreign]);
});

describe("filterOwnedEntityIds", () => {
  it("returns the caller's ids and excludes another user's ids and unknown ids", async () => {
    const owned = await filterOwnedEntityIds([ownedA, foreign, unknown, ownedB, ownedA], owner);
    expect([...owned].sort()).toEqual([ownedA, ownedB].sort());
  });

  it("returns the other user's id only to that user", async () => {
    const owned = await filterOwnedEntityIds([ownedA, foreign], other);
    expect([...owned]).toEqual([foreign]);
  });

  it("returns an empty set for an empty list", async () => {
    expect((await filterOwnedEntityIds([], owner)).size).toBe(0);
    expect((await filterOwnedEntityIds(["", ""], owner)).size).toBe(0);
  });
});
