/**
 * Integration tests for retrieve_entities search ranking (issue: no recency
 * term anywhere in the ranking chain — a stale entity can permanently outrank
 * a live one purely because its canonical_name sorts earlier alphabetically).
 *
 * These exercise the real SQLite-backed `lexical_typed` search path via
 * `queryEntitiesWithCount`, seeding two entities whose lexical relevance score
 * is identical (same canonical_name shape, same snapshot content) but whose
 * `last_observation_at` differs — so the only thing that can break the tie is
 * the tie-break rule itself.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../../db.js";
import { queryEntitiesWithCount } from "../entity_handlers.js";
import { generateEntityId } from "../../../services/entity_resolution.js";

const userId = "test-user-ranking-tiebreak";
const entityType = "contact";

async function cleanup(): Promise<void> {
  await db.from("entities").delete().eq("user_id", userId);
  await db.from("entity_snapshots").delete().eq("user_id", userId);
  await db.from("schema_registry").delete().eq("user_id", userId);
}

/**
 * `last_observation_at` lives on `entity_snapshots`, not `entities` (the
 * `entities` table only carries `first_seen_at`/`last_seen_at`). Lexical
 * search reads canonical_name from `entities` but reads recency from the
 * joined `entity_snapshots` row — so the fixture must seed both.
 */
async function seedEntityWithObservationTime(
  entityId: string,
  canonicalName: string,
  lastObservationAt: string
): Promise<void> {
  await db.from("entities").insert({
    id: entityId,
    entity_type: entityType,
    canonical_name: canonicalName,
    user_id: userId,
  });
  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    entity_type: entityType,
    schema_version: "1",
    canonical_name: canonicalName,
    snapshot: "{}",
    computed_at: lastObservationAt,
    observation_count: 1,
    last_observation_at: lastObservationAt,
    provenance: "{}",
    user_id: userId,
  });
}

describe("search ranking tie-break (recency, not alphabetical)", () => {
  beforeEach(async () => {
    await cleanup();
    // Register `contact` as an active schema type so the search text "contact"
    // routes through the lexical_typed path (lexicalSearchEntityIds), which is
    // where the alphabetical tie-break lives.
    await db.from("schema_registry").insert({
      id: `schema_${userId}`,
      entity_type: entityType,
      schema_version: "1",
      schema_definition: "{}",
      reducer_config: "{}",
      active: 1,
      created_at: new Date().toISOString(),
      user_id: userId,
      scope: "test",
    });
  });

  afterEach(cleanup);

  it("prefers the recently-observed entity over the alphabetically-earlier one when lexical scores tie", async () => {
    // "Aaron Widgetco" sorts before "Zach Widgetco" alphabetically, but is
    // stale (observed a year ago). "Zach Widgetco" is live (observed today).
    // Both are `contact` entities and both canonical_names contain the search
    // term "widgetco" as a substring in the same position (single-token
    // match, no snapshot content), so their strict lexical scores are exactly
    // equal — the only thing that can differ is the tie-break.
    const staleName = "Aaron Widgetco";
    const liveName = "Zach Widgetco";
    const staleId = generateEntityId(entityType, staleName);
    const liveId = generateEntityId(entityType, liveName);

    const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const now = new Date().toISOString();

    await seedEntityWithObservationTime(staleId, staleName, oneYearAgo);
    await seedEntityWithObservationTime(liveId, liveName, now);

    const result = await queryEntitiesWithCount({
      userId,
      search: "contact widgetco",
      includeSnapshots: false,
      limit: 10,
      offset: 0,
    });

    expect(result.search_mode).toBe("lexical_typed");
    const ids = result.entities.map((e) => e.entity_id);
    expect(ids).toEqual(expect.arrayContaining([staleId, liveId]));

    const liveRank = ids.indexOf(liveId);
    const staleRank = ids.indexOf(staleId);
    // The live (recently-observed) entity must outrank the stale one. Before
    // the fix, this failed: alphabetical tie-break put "Aaron Contact"
    // (stale) ahead of "Zach Contact" (live) even though it is a year old.
    expect(liveRank).toBeLessThan(staleRank);
  });
});
