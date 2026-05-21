/**
 * Tenant isolation matrix.
 *
 * Companion to (and conceptually parallel with) any future
 * auth_topology_matrix that verifies unauthenticated callers are rejected.
 * This suite covers a different threat model: an authenticated caller
 * MUST NOT be able to read another user's data, even when they know a
 * cross-user entity_id, source_id, or relationship key.
 *
 * Motivated by GHSA-wrr4-782v-jhwh /
 * docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md
 *
 * Every authenticated query endpoint that touches user-owned data MUST be
 * covered here. Adding a new endpoint to the codebase without adding a
 * row to this matrix is a regression that must be caught in review.
 *
 * NOTE: Some endpoints listed below are pending tenant-isolation fixes
 * (#365 /list_relationships, #366 /retrieve_graph_neighborhood). Those
 * cases are marked `.todo` or `.skip` until the fix PRs land; the matrix
 * landing first ensures the fixes are verified against this suite.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "tenant_iso_matrix_test";
const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface FixtureUserData {
  userId: string;
  entityId: string;
  sourceId: string;
}

async function seedUserData(label: string): Promise<FixtureUserData> {
  const userId = randomUUID();
  const entityId = `${TEST_PREFIX}_ent_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sourceId = randomUUID();

  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: "test",
    canonical_name: `${label}'s Entity`,
  });

  await db.from("sources").insert({
    id: sourceId,
    user_id: userId,
    content_hash: `${TEST_PREFIX}_hash_${label}_${Date.now()}`,
    mime_type: "text/plain",
    storage_url: `internal://test/${label}`,
    file_size: 0,
  });

  return { userId, entityId, sourceId };
}

async function cleanupUserData(data: FixtureUserData): Promise<void> {
  await db.from("entities").delete().eq("id", data.entityId);
  await db.from("sources").delete().eq("id", data.sourceId);
}

async function callEndpoint(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

describe("Tenant isolation matrix (GHSA-wrr4-782v-jhwh)", () => {
  let userA: FixtureUserData;
  let userB: FixtureUserData;

  beforeAll(async () => {
    userA = await seedUserData("alice");
    userB = await seedUserData("bob");
  });

  afterAll(async () => {
    await cleanupUserData(userA);
    await cleanupUserData(userB);
  });

  describe("/retrieve_related_entities", () => {
    it("user A querying their own entity_id returns user A's data", async () => {
      const { status, json } = await callEndpoint("/retrieve_related_entities", {
        entity_id: userA.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      // Empty relationships is fine — what matters is no error and no cross-user leak
      expect(Array.isArray(json.relationships)).toBe(true);
    });

    it("user A querying user B's entity_id returns no data (scoped to user A)", async () => {
      const { status, json } = await callEndpoint("/retrieve_related_entities", {
        entity_id: userB.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      // User A's scope means no relationships involving user B's entity
      expect(json.relationships).toEqual([]);
      expect(json.entities ?? []).toEqual([]);
    });
  });

  describe("/list_relationships", () => {
    it.todo("Add coverage once #365 lands — verify cross-user entity_id returns empty");
  });

  describe("/retrieve_graph_neighborhood", () => {
    it.todo("Add coverage once #366 lands — verify cross-user node_id returns no entity");
  });
});
