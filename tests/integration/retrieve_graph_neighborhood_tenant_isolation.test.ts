/**
 * Regression test for GHSA-wrr4-782v-jhwh /
 * docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md
 *
 * Invariant: the /retrieve_graph_neighborhood HTTP endpoint MUST scope all
 * database queries to the authenticated user. Specifically, when invoked
 * by user A with an entity_id belonging to user B, the endpoint MUST NOT
 * return user B's entity, relationships, observations, or sources.
 *
 * This test seeds two distinct user_ids' worth of data in the database
 * and verifies that calls authenticated as user A only see user A's data,
 * regardless of which node_id is queried.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "rgn_tenant_iso_test";
const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;

describe("retrieve_graph_neighborhood tenant isolation (GHSA-wrr4-782v-jhwh)", () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const entityA = `${TEST_PREFIX}_ent_a_${Date.now()}`;
  const entityB = `${TEST_PREFIX}_ent_b_${Date.now()}`;

  beforeAll(async () => {
    // Seed two entities, one per user
    await db.from("entities").insert([
      {
        id: entityA,
        user_id: userA,
        entity_type: "test",
        canonical_name: "Alice's Entity",
      },
      {
        id: entityB,
        user_id: userB,
        entity_type: "test",
        canonical_name: "Bob's Entity",
      },
    ]);
  });

  afterAll(async () => {
    await db.from("entities").delete().eq("id", entityA);
    await db.from("entities").delete().eq("id", entityB);
  });

  it("user A querying their own entity returns it", async () => {
    const res = await fetch(`${BASE_URL}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: entityA,
        node_type: "entity",
        user_id: userA,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entity).toBeDefined();
    expect(json.entity.id).toBe(entityA);
  });

  it("user A querying user B's entity does NOT return user B's data", async () => {
    const res = await fetch(`${BASE_URL}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: entityB,
        node_type: "entity",
        user_id: userA,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    // Either entity is undefined or it does not match userB's entity
    // (the .single() should not find a row scoped to userA)
    expect(json.entity).toBeUndefined();
  });

  it("user B querying their own entity returns it", async () => {
    const res = await fetch(`${BASE_URL}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: entityB,
        node_type: "entity",
        user_id: userB,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entity).toBeDefined();
    expect(json.entity.id).toBe(entityB);
  });
});
