/**
 * Integration test: prefix_duplicate_candidates surfaced in store API response.
 *
 * Verifies that when a single-token name (e.g. "Simon") is stored after an
 * existing same-type entity with a multi-token canonical name (e.g.
 * "Simon Bergeron") already exists, the MCP store response includes
 * `prefix_duplicate_candidates` on the entity's result object.
 *
 * Covers both the MCP path (storeStructuredInternal via NeotomaServer.store)
 * and verifies the response shape matches the OpenAPI contract.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000099";

type EntityResult = {
  entity_id?: string;
  entity_type?: string;
  canonical_name?: string;
  action?: string;
  prefix_duplicate_candidates?: Array<{
    code: string;
    entity_type: string;
    candidate_entity_id: string;
    candidate_canonical_name: string;
    truncated?: boolean;
    matched_count?: number;
  }>;
};

type StoreResponse = {
  entities?: EntityResult[];
  source_id?: string;
  error?: unknown;
};

describe("store response: prefix_duplicate_candidates", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanupEntityType("contact", TEST_USER_ID);
  });

  it("surfaces prefix_duplicate_candidates when a single-token name prefixes an existing multi-token contact", async () => {
    const storeAs = server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    };

    // Step 1: Store the multi-token contact so it exists in the DB.
    const multiTokenResult = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `prefix-dup-multi-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Simon Bergeron",
          schema_version: "1.0",
        },
      ],
    });
    const multiTokenBody = JSON.parse(
      multiTokenResult.content[0].text
    ) as StoreResponse;
    expect(multiTokenBody.error).toBeUndefined();
    expect(multiTokenBody.entities).toHaveLength(1);
    const multiTokenEntityId = multiTokenBody.entities![0].entity_id;
    expect(typeof multiTokenEntityId).toBe("string");

    // Step 2: Store a single-token contact whose name is the first token of
    // the existing entity. The resolver must mint a new entity (no auto-merge)
    // and surface the existing one as a prefix duplicate candidate.
    const singleTokenResult = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `prefix-dup-single-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Simon",
          schema_version: "1.0",
        },
      ],
    });
    const body = JSON.parse(singleTokenResult.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(body.entities).toHaveLength(1);

    const entity = body.entities![0];

    // A new entity must be created (not merged into the existing one).
    expect(entity.action).toBe("created");
    expect(entity.entity_id).not.toBe(multiTokenEntityId);

    // The existing multi-token entity must be surfaced as a candidate.
    expect(Array.isArray(entity.prefix_duplicate_candidates)).toBe(true);
    expect(entity.prefix_duplicate_candidates!.length).toBeGreaterThanOrEqual(1);

    const candidate = entity.prefix_duplicate_candidates!.find(
      (c) => c.candidate_entity_id === multiTokenEntityId
    );
    expect(candidate).toBeDefined();
    expect(candidate!.code).toBe("PREFIX_DUPLICATE_CANDIDATE");
    expect(candidate!.entity_type).toBe("contact");
    expect(candidate!.candidate_canonical_name).toBe("Simon Bergeron");
  });

  it("sets truncated and matched_count on candidates when the 25-item cap fires", async () => {
    const storeAs = server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    };

    // Store 26 distinct multi-token contacts all sharing "Yuki" as the first token.
    // MAX_PREFIX_DUPLICATE_CANDIDATES = 25, so a 27th single-token "Yuki" triggers truncation.
    const multiTokenNames = Array.from(
      { length: 26 },
      (_, i) => `Yuki Person${String(i).padStart(2, "0")}`
    );
    for (const name of multiTokenNames) {
      const r = await storeAs.store({
        user_id: TEST_USER_ID,
        idempotency_key: `prefix-trunc-seed-${name.replace(/ /g, "-")}-${Date.now()}`,
        commit: true,
        entities: [{ entity_type: "contact", name, schema_version: "1.0" }],
      });
      const b = JSON.parse(r.content[0].text) as StoreResponse;
      expect(b.error).toBeUndefined();
    }

    // Now store single-token "Yuki" — should trigger truncation.
    const result = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `prefix-trunc-single-yuki-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: "contact", name: "Yuki", schema_version: "1.0" }],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(body.entities).toHaveLength(1);

    const entity = body.entities![0];
    expect(entity.action).toBe("created");

    const candidates = entity.prefix_duplicate_candidates ?? [];
    // Capped at 25.
    expect(candidates).toHaveLength(25);
    // Every returned candidate must carry the truncation signal.
    for (const c of candidates) {
      expect(c.truncated).toBe(true);
      expect(c.matched_count).toBe(26);
    }
  });

  it("does not include prefix_duplicate_candidates when no multi-token entities share the first token", async () => {
    const storeAs = server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    };

    // Store a contact with a unique name that shares no first token with existing contacts.
    const result = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `prefix-dup-no-match-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Zelda Zephyr",
          schema_version: "1.0",
        },
      ],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(body.entities).toHaveLength(1);

    // No candidates: no existing contact has "Zelda" as a first token prefix.
    const entity = body.entities![0];
    // prefix_duplicate_candidates should be absent or empty.
    const candidates = entity.prefix_duplicate_candidates;
    expect(!candidates || candidates.length === 0).toBe(true);
  });
});
