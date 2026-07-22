/**
 * #1967: batch identifier resolution.
 *
 * The requirement under test is that an agent can tell exactly which inputs
 * failed. So the mixed-batch test asserts per-input status for a found,
 * not-found and ambiguous identifier in a SINGLE call, and the backward-compat
 * test pins that the pre-existing single-identifier path is unchanged.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../db.js";
import {
  retrieveEntitiesByIdentifiers,
  retrieveEntityByIdentifierWithFallback,
  MAX_BATCH_IDENTIFIERS,
} from "./entity_identifier_handler.js";

const userId = "batch-ident-test-user";
const entityType = "batch_company";

/**
 * "Ambiguous Holdings" is stored twice under distinct ids so a single
 * identifier resolves to >1 entity — the case an agent must not mistake for a
 * clean hit.
 */
const FIXTURES: Array<{ id: string; canonical_name: string; snapshot: Record<string, unknown> }> = [
  {
    id: "ent_batch_acme",
    canonical_name: "Acme Corporation",
    snapshot: { name: "Acme Corporation", domain: "acme.test" },
  },
  {
    id: "ent_batch_globex",
    canonical_name: "Globex Industries",
    snapshot: { name: "Globex Industries", domain: "globex.test" },
  },
  {
    id: "ent_batch_ambig_1",
    canonical_name: "Ambiguous Holdings",
    snapshot: { name: "Ambiguous Holdings", domain: "ambig1.test" },
  },
  {
    id: "ent_batch_ambig_2",
    canonical_name: "Ambiguous Holdings",
    snapshot: { name: "Ambiguous Holdings", domain: "ambig2.test" },
  },
];

async function cleanup(): Promise<void> {
  await db.from("entity_snapshots").delete().eq("user_id", userId);
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("entities").delete().eq("user_id", userId);
}

describe("retrieveEntitiesByIdentifiers (#1967)", () => {
  beforeAll(async () => {
    await cleanup();
    for (const fixture of FIXTURES) {
      await db.from("entities").insert({
        id: fixture.id,
        entity_type: entityType,
        canonical_name: fixture.canonical_name,
        user_id: userId,
      });
      await db.from("entity_snapshots").insert({
        entity_id: fixture.id,
        entity_type: entityType,
        schema_version: "1.0.0",
        canonical_name: fixture.canonical_name,
        snapshot: fixture.snapshot,
        user_id: userId,
        observation_count: 1,
      });
    }
  });

  afterAll(cleanup);

  it("reports per-input outcomes for a mixed found / not-found / ambiguous batch", async () => {
    const identifiers = [
      "Acme Corporation",
      "No Such Company At All",
      "Ambiguous Holdings",
      "Globex Industries",
    ];

    const { results, summary } = await retrieveEntitiesByIdentifiers({
      identifiers,
      entityType,
      userId,
    });

    // Order and length mirror the input exactly, so callers can zip.
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.identifier)).toEqual(identifiers);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3]);

    const [acme, missing, ambiguous, globex] = results;

    expect(acme.status).toBe("resolved");
    expect(acme.entity?.id).toBe("ent_batch_acme");
    expect(acme.match_count).toBe(1);

    expect(missing.status).toBe("not_found");
    expect(missing.entity).toBeNull();
    expect(missing.match_count).toBe(0);

    // The critical distinction: multiple matches must NOT read as resolved.
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.entity).toBeNull();
    expect(ambiguous.match_count).toBeGreaterThan(1);
    expect(ambiguous.candidates?.map((c) => c.id).sort()).toEqual([
      "ent_batch_ambig_1",
      "ent_batch_ambig_2",
    ]);

    expect(globex.status).toBe("resolved");
    expect(globex.entity?.id).toBe("ent_batch_globex");

    expect(summary).toEqual({
      requested: 4,
      resolved: 2,
      ambiguous: 1,
      not_found: 1,
      errors: 0,
    });
  }, 30000);

  it("resolves a duplicated identifier once and reports it at every position", async () => {
    const { results, summary } = await retrieveEntitiesByIdentifiers({
      identifiers: ["Acme Corporation", "Acme Corporation"],
      entityType,
      userId,
    });

    expect(results).toHaveLength(2);
    expect(results[0].entity?.id).toBe("ent_batch_acme");
    expect(results[1].entity?.id).toBe("ent_batch_acme");
    expect(summary.resolved).toBe(2);
  }, 30000);

  it("supports the `by` field restriction across the batch", async () => {
    const { results } = await retrieveEntitiesByIdentifiers({
      identifiers: ["acme.test", "globex.test"],
      entityType,
      userId,
      by: "domain",
    });

    expect(results[0].status).toBe("resolved");
    expect(results[0].entity?.id).toBe("ent_batch_acme");
    expect(results[0].match_mode).toBe("snapshot_field");
    expect(results[1].entity?.id).toBe("ent_batch_globex");
  }, 30000);

  describe("input bounds", () => {
    it("rejects an empty array", async () => {
      await expect(
        retrieveEntitiesByIdentifiers({ identifiers: [], entityType, userId })
      ).rejects.toThrow(/non-empty array/);
    });

    it(`rejects more than ${MAX_BATCH_IDENTIFIERS} identifiers rather than truncating`, async () => {
      const tooMany = Array.from({ length: MAX_BATCH_IDENTIFIERS + 1 }, (_, i) => `name-${i}`);
      await expect(
        retrieveEntitiesByIdentifiers({ identifiers: tooMany, entityType, userId })
      ).rejects.toThrow(/exceeds the 100 cap/);
    });
  });

  describe("backward compatibility", () => {
    it("single-identifier resolution is unchanged and agrees with the batch form", async () => {
      const single = await retrieveEntityByIdentifierWithFallback({
        identifier: "Acme Corporation",
        entityType,
        userId,
      });

      // The pre-existing shape is intact: entities/total/match_mode.
      expect(single.total).toBe(1);
      expect(single.match_mode).toBe("direct");
      expect((single.entities[0] as { id: string }).id).toBe("ent_batch_acme");

      const batch = await retrieveEntitiesByIdentifiers({
        identifiers: ["Acme Corporation"],
        entityType,
        userId,
      });

      // The batch form is a strict fan-out over the same path.
      expect(batch.results[0].entity?.id).toBe((single.entities[0] as { id: string }).id);
      expect(batch.results[0].match_mode).toBe(single.match_mode);
    }, 30000);

    it("propagates the entity_id-shaped not-found hint per input", async () => {
      const { results } = await retrieveEntitiesByIdentifiers({
        identifiers: ["ent_deadbeefdeadbeefdeadbeef"],
        userId,
      });

      expect(results[0].status).toBe("not_found");
      expect(results[0].hint).toMatch(/retrieve_entity_snapshot/);
    }, 30000);
  });
});
