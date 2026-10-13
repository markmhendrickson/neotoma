import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { config } from "../../src/config.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
vi.mock("../../src/embeddings.js", () => ({
  generateEmbedding: async () => Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)),
}));

it("actual missing vector backend propagates uncertainty while native lexical positive remains usable", async () => {
  const owner = randomUUID(),
    id = "ent_backend_contract_" + randomUUID(),
    type = "synthetic_backend_contract";
  const before = config.openaiApiKey;
  config.openaiApiKey = "synthetic-not-a-credential";
  try {
    expect(
      (
        await db.from("entities").insert({
          id,
          user_id: owner,
          entity_type: type,
          canonical_name: "Synthetic amber marker",
        })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("entity_snapshots").insert({
          entity_id: id,
          user_id: owner,
          entity_type: type,
          schema_version: "1.0",
          snapshot: { name: "Synthetic amber marker" },
          observation_count: 0,
          provenance: {},
        })
      ).error
    ).toBeNull();
    const result = await queryEntitiesWithCount({
      userId: owner,
      entityType: type,
      search: "amber marker",
      limit: 10,
    });
    expect(result.entities.map((x) => x.entity_id)).toContain(id);
    expect(result.search_mode).toBe("lexical_fallback");
    expect(result.read_contract.mode.fallback_reason).toBe("unknown");
    expect(result.read_contract.coverage.reasons).toContain("semantic_backend_unavailable");
    expect(result.read_contract.coverage.scope_exhausted).toBeNull();
    expect(result.read_contract.coverage.total.relation).toBe("candidate_count");
  } finally {
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
    config.openaiApiKey = before;
  }
});
