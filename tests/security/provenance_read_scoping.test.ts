/**
 * Field-provenance, entity-snapshot and observation-list reads are scoped to
 * the authenticated user.
 *
 * Covers `POST /get_field_provenance`, `POST /get_entity_snapshot` (the
 * materialized fast path), `POST /list_observations`, and the MCP
 * `retrieve_field_provenance` handler. Each case pairs a positive control
 * (the owner reads their own entity) with a read of another user's entity,
 * which must be indistinguishable from a read of an entity id that does not
 * exist.
 *
 * The HTTP rows run against the shared test server, where an unauthenticated
 * local request resolves to the local dev user, so the "own" fixture is
 * seeded under that user id.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const TEST_PREFIX = "prov_read_scope_test";
const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface Fixture {
  userId: string;
  entityId: string;
  observationId: string;
  sourceId: string;
}

async function seed(label: string, userId: string): Promise<Fixture> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entityId = `${TEST_PREFIX}_ent_${label}_${suffix}`;
  const observationId = randomUUID();
  const sourceId = randomUUID();

  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: "test",
    canonical_name: `${label} entity`,
  });
  await db.from("sources").insert({
    id: sourceId,
    user_id: userId,
    content_hash: `${TEST_PREFIX}_hash_${label}_${suffix}`,
    mime_type: "text/plain",
    storage_url: `internal://test/${label}`,
    file_size: 0,
  });
  await db.from("observations").insert({
    id: observationId,
    entity_id: entityId,
    entity_type: "test",
    schema_version: "1.0",
    observed_at: new Date().toISOString(),
    source_priority: 0,
    source_id: sourceId,
    fields: { marker: `${label}-value` },
    user_id: userId,
  });
  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    user_id: userId,
    entity_type: "test",
    schema_version: "1.0",
    snapshot: JSON.stringify({ marker: `${label}-value` }),
    provenance: JSON.stringify({ marker: observationId }),
    observation_count: 1,
  });

  return { userId, entityId, observationId, sourceId };
}

async function cleanup(f: Fixture): Promise<void> {
  await db.from("entity_snapshots").delete().eq("entity_id", f.entityId);
  await db.from("observations").delete().eq("id", f.observationId);
  await db.from("sources").delete().eq("id", f.sourceId);
  await db.from("entities").delete().eq("id", f.entityId);
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

/** Error envelope with any request-specific fields removed. */
function errorShape(json: any) {
  const err = json?.error ?? json;
  return { code: err?.code, message: err?.message };
}

describe("provenance and observation reads are scoped to the authenticated user", () => {
  let own: Fixture;
  let other: Fixture;
  const missingEntityId = `${TEST_PREFIX}_missing_${randomUUID()}`;

  beforeAll(async () => {
    own = await seed("own", LOCAL_DEV_USER_ID);
    other = await seed("other", randomUUID());
  });

  afterAll(async () => {
    await cleanup(own);
    await cleanup(other);
  });

  describe("POST /get_field_provenance", () => {
    it("returns provenance for the caller's own entity", async () => {
      const { status, json } = await post("/get_field_provenance", {
        entity_id: own.entityId,
        field: "marker",
      });
      expect(status).toBe(200);
      expect(json.observation_ids).toEqual([own.observationId]);
      expect(json.observations.map((o: any) => o.id)).toEqual([own.observationId]);
      expect(json.sources.map((s: any) => s.id)).toEqual([own.sourceId]);
    });

    it("provenance for another user's entity returns not-found", async () => {
      const foreign = await post("/get_field_provenance", {
        entity_id: other.entityId,
        field: "marker",
      });
      const missing = await post("/get_field_provenance", {
        entity_id: missingEntityId,
        field: "marker",
      });
      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(missing.status);
      expect(errorShape(foreign.json)).toEqual(errorShape(missing.json));
      const serialized = JSON.stringify(foreign.json);
      expect(serialized).not.toContain(other.observationId);
      expect(serialized).not.toContain(other.sourceId);
    });
  });

  describe("POST /get_entity_snapshot", () => {
    it("returns the caller's own snapshot", async () => {
      const { status, json } = await post("/get_entity_snapshot", { entity_id: own.entityId });
      expect(status).toBe(200);
      expect(json.entity_id).toBe(own.entityId);
    });

    it("a snapshot for another user's entity returns not-found", async () => {
      const foreign = await post("/get_entity_snapshot", { entity_id: other.entityId });
      const missing = await post("/get_entity_snapshot", { entity_id: missingEntityId });
      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(missing.status);
      expect(errorShape(foreign.json)).toEqual(errorShape(missing.json));
      expect(JSON.stringify(foreign.json)).not.toContain("other-value");
    });
  });

  describe("POST /list_observations", () => {
    it("lists the caller's own observations", async () => {
      const { status, json } = await post("/list_observations", { entity_id: own.entityId });
      expect(status).toBe(200);
      expect(json.observations.map((o: any) => o.id)).toContain(own.observationId);
    });

    it("observations for another user's entity come back empty", async () => {
      const foreign = await post("/list_observations", { entity_id: other.entityId });
      const missing = await post("/list_observations", { entity_id: missingEntityId });
      expect(foreign.status).toBe(200);
      expect(foreign.json).toEqual(missing.json);
      expect(foreign.json.observations).toEqual([]);
    });
  });

  describe("MCP retrieve_field_provenance", () => {
    let server: NeotomaServer;

    beforeAll(() => {
      server = new NeotomaServer();
    });

    const call = (userId: string, entityId: string) => {
      (server as any).authenticatedUserId = userId;
      return (server as any).retrieveFieldProvenance({ entity_id: entityId, field: "marker" });
    };

    it("returns provenance for the caller's own entity", async () => {
      const result = await call(other.userId, other.entityId);
      const body = JSON.parse(result.content[0].text);
      expect(body.source_observation.id).toBe(other.observationId);
      expect(body.source.id).toBe(other.sourceId);
    });

    it("provenance for another user's entity returns not-found", async () => {
      const foreign = await call(own.userId, other.entityId).then(
        () => null,
        (err: Error) => err.message.replace(other.entityId, "<id>")
      );
      const missing = await call(own.userId, missingEntityId).then(
        () => null,
        (err: Error) => err.message.replace(missingEntityId, "<id>")
      );
      expect(foreign).not.toBeNull();
      expect(foreign).toContain("Entity snapshot not found");
      expect(foreign).toBe(missing);
    });
  });
});
