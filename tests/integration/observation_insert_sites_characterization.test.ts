/**
 * Characterization test: the three observation insertion sites.
 *
 * Neotoma writes observation rows from three places that share one row shape
 * but were written independently:
 *
 *   1. `createObservation` (src/services/observation_storage.ts), used by the
 *      HTTP store path and by other services;
 *   2. the inline insert inside the MCP structured-store core
 *      (`storeStructuredInternal` in src/server.ts);
 *   3. `createCorrection` (src/services/correction.ts).
 *
 * These tests pin the observable behaviour of each site against the local
 * SQLite database: the persisted columns, the content-addressed replay
 * behaviour, and the per-owner scoping of the existing-row probe. They are
 * written to pass unchanged before and after the sites are routed through the
 * shared insert primitive (src/services/observation_insert.ts), which is a
 * non-behavioural extraction. A difference in any assertion here means the
 * extraction changed behaviour.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

const MCP_USER_ID = "00000000-0000-0000-0000-000000000000";
const USER_A = "test-user-observation-insert-a";
const USER_B = "test-user-observation-insert-b";
const RUN = `obs-insert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Row = Record<string, unknown>;

async function rowsForEntity(entityId: string, userId?: string): Promise<Row[]> {
  let query = db.from("observations").select("*").eq("entity_id", entityId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

async function rowById(id: string, userId: string): Promise<Row> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  expect(error).toBeNull();
  return data as Row;
}

describe("observation insertion sites (characterization)", () => {
  const entityIds: string[] = [];
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  afterAll(async () => {
    for (const id of entityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  function newEntityId(label: string): string {
    const id = `ent_${RUN}_${label}`;
    entityIds.push(id);
    return id;
  }

  describe("createObservation (HTTP / service site)", () => {
    it("persists the full row shape with every optional column supplied", async () => {
      const entityId = newEntityId("full");
      const identity = createAgentIdentity({ clientName: "Claude Code", clientVersion: "0.5.0" });
      const observedAt = new Date("2026-01-02T03:04:05.000Z").toISOString();

      const returned = await runWithRequestContext({ agentIdentity: identity }, () =>
        createObservation({
          entity_id: entityId,
          entity_type: "note",
          schema_version: "1.3",
          source_id: null,
          interpretation_id: null,
          observed_at: observedAt,
          specificity_score: 0.75,
          source_priority: 42,
          observation_source: "sensor",
          source_peer_id: "peer-xyz",
          fields: { title: `${RUN} full` },
          user_id: USER_A,
          idempotency_key: `${RUN}-full`,
          identity_basis: "schema_rule",
          identity_rule: "title",
        })
      );

      const row = await rowById(returned.id, USER_A);
      expect(row).toMatchObject({
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.3",
        source_id: null,
        interpretation_id: null,
        specificity_score: 0.75,
        source_priority: 42,
        observation_source: "sensor",
        source_peer_id: "peer-xyz",
        fields: { title: `${RUN} full` },
        user_id: USER_A,
        idempotency_key: `${RUN}-full`,
        identity_basis: "schema_rule",
        identity_rule: "title",
      });
      expect(new Date(row.observed_at as string).toISOString()).toBe(observedAt);
      expect(row.created_at).toBeTruthy();
      expect((row.provenance as Record<string, unknown>).client_name).toBe("Claude Code");
    });

    it("defaults observation_source and leaves unsupplied optional columns null", async () => {
      const entityId = newEntityId("minimal");
      const returned = await createObservation({
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: { title: `${RUN} minimal` },
        user_id: USER_A,
      });

      const row = await rowById(returned.id, USER_A);
      expect(row.observation_source).toBe("llm_summary");
      expect(row.idempotency_key ?? null).toBeNull();
      expect(row.identity_basis ?? null).toBeNull();
      expect(row.identity_rule ?? null).toBeNull();
      expect(row.source_peer_id ?? null).toBeNull();
      expect(row.provenance ?? null).toBeNull();
      expect(row.created_at).toBeTruthy();
    });

    it("treats falsy optional strings as absent, not as empty values", async () => {
      const entityId = newEntityId("falsy");
      const returned = await createObservation({
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: { title: `${RUN} falsy` },
        user_id: USER_A,
        idempotency_key: "",
        identity_basis: "",
        identity_rule: "",
        source_peer_id: "",
      });

      const row = await rowById(returned.id, USER_A);
      expect(row.idempotency_key ?? null).toBeNull();
      expect(row.identity_basis ?? null).toBeNull();
      expect(row.identity_rule ?? null).toBeNull();
      expect(row.source_peer_id ?? null).toBeNull();
    });

    it("is content-addressed: a replay returns the existing row and inserts nothing", async () => {
      const entityId = newEntityId("replay");
      const params = {
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: { title: `${RUN} replay` },
        user_id: USER_A,
        idempotency_key: `${RUN}-replay`,
      };
      const first = await createObservation(params);
      const second = await createObservation({
        ...params,
        // A later observed_at must not matter: the id is content-addressed.
        observed_at: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(second.id).toBe(first.id);
      expect(second.observed_at).toBe(first.observed_at);
      expect(await rowsForEntity(entityId)).toHaveLength(1);
    });

    it("refuses a same-content write by another owner before the insert (owner guard runs first)", async () => {
      const entityId = newEntityId("owners");
      const params = {
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: { title: `${RUN} owners` },
        idempotency_key: `${RUN}-owners`,
      };
      const forA = await createObservation({ ...params, user_id: USER_A });
      expect(forA.id).toBeTruthy();
      // The cross-owner guard sits before the content-addressed probe, so a
      // second owner can neither read nor shadow the first owner's row.
      await expect(createObservation({ ...params, user_id: USER_B })).rejects.toThrow(
        /owned by a different user/
      );
      expect(await rowsForEntity(entityId, USER_B)).toHaveLength(0);
      expect(await rowsForEntity(entityId, USER_A)).toHaveLength(1);
    });
  });

  describe("MCP structured-store core (inline site)", () => {
    it("persists the structured-store row shape and deduplicates on replay", async () => {
      const marker = `${RUN}-mcp`;
      const args = {
        entities: [{ entity_type: "note", title: marker }],
        idempotency_key: marker,
      };
      const first = await server.executeToolForCli("store", args, MCP_USER_ID);
      const firstBody = JSON.parse(first.content[0].text) as {
        entities?: Array<{ entity_id: string; observation_id?: string }>;
      };
      const entityId = firstBody.entities?.[0]?.entity_id;
      expect(entityId).toBeTruthy();
      entityIds.push(entityId as string);

      const rows = await rowsForEntity(entityId as string, MCP_USER_ID);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toMatchObject({
        entity_type: "note",
        interpretation_id: null,
        specificity_score: 1,
        source_priority: 100,
        observation_source: "llm_summary",
        user_id: MCP_USER_ID,
      });
      expect(row.source_id).toBeTruthy();
      expect(row.identity_basis).toBeTruthy();
      expect(typeof row.identity_rule).toBe("string");
      expect(row.idempotency_key).toBeTruthy();
      expect(row.created_at).toBeTruthy();
      expect(new Date(row.observed_at as string).getTime()).not.toBeNaN();

      // Replay: same request, same id, no second row.
      await server.executeToolForCli("store", args, MCP_USER_ID);
      expect(await rowsForEntity(entityId as string, MCP_USER_ID)).toHaveLength(1);
    });
  });

  describe("createCorrection (correction site)", () => {
    it("writes a priority-1000 single-field observation and is replay-safe", async () => {
      const marker = `${RUN}-corr`;
      const stored = await server.executeToolForCli(
        "store",
        {
          entities: [{ entity_type: "note", title: marker }],
          idempotency_key: marker,
        },
        MCP_USER_ID
      );
      const entityId = (
        JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> }
      ).entities[0].entity_id;
      entityIds.push(entityId);

      const params = {
        entity_id: entityId,
        entity_type: "note",
        field: "title",
        value: `${marker} corrected`,
        schema_version: "1.0",
        user_id: MCP_USER_ID,
        idempotency_key: `${marker}-c1`,
      };
      const first = await createCorrection(params);
      expect(first.observation_id).toBeTruthy();

      const row = await rowById(first.observation_id, MCP_USER_ID);
      expect(row).toMatchObject({
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        specificity_score: 1,
        source_priority: 1000,
        fields: { title: `${marker} corrected` },
        user_id: MCP_USER_ID,
        idempotency_key: `${marker}-c1`,
      });
      expect(new Date(row.observed_at as string).getTime()).not.toBeNaN();

      // Replay: the unique-violation branch returns the same id, no snapshot,
      // and writes no second row.
      const before = (await rowsForEntity(entityId, MCP_USER_ID)).length;
      const replay = await createCorrection(params);
      expect(replay.observation_id).toBe(first.observation_id);
      expect(replay.snapshot).toBeNull();
      expect((await rowsForEntity(entityId, MCP_USER_ID)).length).toBe(before);
    });
  });

  describe("cross-site row-shape parity", () => {
    it("HTTP-site and MCP-site rows agree on every column except the documented ones", async () => {
      const marker = `${RUN}-parity`;
      const stored = await server.executeToolForCli(
        "store",
        { entities: [{ entity_type: "note", title: marker }], idempotency_key: marker },
        MCP_USER_ID
      );
      const mcpEntityId = (
        JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> }
      ).entities[0].entity_id;
      entityIds.push(mcpEntityId);
      const mcpRow = (await rowsForEntity(mcpEntityId, MCP_USER_ID))[0];

      const httpEntityId = newEntityId("parity-http");
      const httpObs = await createObservation({
        entity_id: httpEntityId,
        entity_type: "note",
        schema_version: mcpRow.schema_version as string,
        source_id: mcpRow.source_id as string,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: mcpRow.fields as Record<string, unknown>,
        user_id: MCP_USER_ID,
        idempotency_key: mcpRow.idempotency_key as string,
        identity_basis: mcpRow.identity_basis as string,
        identity_rule: mcpRow.identity_rule as string,
      });
      const httpRow = await rowById(httpObs.id, MCP_USER_ID);

      const comparable = [
        "entity_type",
        "schema_version",
        "source_id",
        "interpretation_id",
        "specificity_score",
        "source_priority",
        "observation_source",
        "fields",
        "user_id",
        "idempotency_key",
        "identity_basis",
        "identity_rule",
        "provenance",
      ];
      for (const column of comparable) {
        expect(httpRow[column] ?? null, `column ${column}`).toEqual(mcpRow[column] ?? null);
      }
    });
  });
});
