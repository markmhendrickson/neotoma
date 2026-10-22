/** Storage-foundation effects only; public validity writes/queries are not enabled. */
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  PARITY_USER_ID,
  callHttp,
  callMcp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

const ids: string[] = [];
const base = (id: string) => ({
  entity_id: id,
  entity_type: "note",
  schema_version: "1.0",
  source_id: null,
  interpretation_id: null,
  observed_at: "2026-10-20T12:00:00.000Z",
  specificity_score: 0.5,
  source_priority: 100,
  observation_source: "sensor" as const,
  fields: { title: "Synthetic state-validity fixture" },
  user_id: PARITY_USER_ID,
  idempotency_key: `validity-${id}`,
});

afterAll(async () => {
  for (const entity_id of ids) await db.from("observations").delete().eq("entity_id", entity_id);
});

describe("nullable observation state-validity storage foundation", () => {
  it("guarded service writes preserve precision and public MCP/HTTP history exposes the metadata", async () => {
    const id = "ent_validity_storage_roundtrip";
    ids.push(id);
    const params = {
      ...base(id),
      valid_from: "2026-10-01T01:00:00.123456789+01:00",
      valid_to: "2026-10-02T01:00:00.000+01:00",
    };
    const written = await createObservation(params);
    const expectedValidity = {
      valid_from: "2026-10-01T00:00:00.123456789Z",
      valid_to: "2026-10-02T00:00:00.000Z",
    };
    const replay = await createObservation({
      ...params,
      valid_from: "2026-10-01T00:00:00.123456789Z",
      valid_to: "2026-10-02T00:00:00Z",
    });
    expect(replay.id).toBe(written.id);
    const server = await startOfflineServer();
    try {
      const mcp = await callMcp(makeMcpServer(), "list_observations", { entity_id: id });
      const http = await callHttp(server.base, "/list_observations", { entity_id: id });
      expect(http.status).toBe(200);
      for (const response of [mcp, http.json]) {
        expect(response.observations).toMatchObject([{ id: written.id, ...expectedValidity }]);
        expect((response.observations as unknown[]).length).toBe(1);
      }
      expect(written).toMatchObject(expectedValidity);
    } finally {
      await stopServer(server.server);
    }
  });

  it("an invalid effective interval leaves no observation, including the legacy-clock fallback", async () => {
    const id = "ent_validity_storage_refusal";
    ids.push(id);
    for (const endpoints of [
      { valid_from: "2026-10-03T00:00:00Z", valid_to: "2026-10-02T00:00:00Z" },
      { valid_from: "2026-10-02T00:00:00Z", valid_to: "2026-10-02T00:00:00Z" },
      { valid_to: "2026-10-20T11:59:59Z" },
      { valid_from: "2026-02-30T00:00:00Z" },
    ]) {
      await expect(createObservation({ ...base(id), ...endpoints })).rejects.toMatchObject({
        code: "VALIDATION_INVALID_FORMAT",
      });
    }
    const rows = await db.from("observations").select("id").eq("entity_id", id);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  it("validity changes the assertion identity; omitting it preserves the preexisting ID bytes", async () => {
    const id = "ent_validity_storage_identity";
    ids.push(id);
    const original = await createObservation(base(id));
    expect(original.id).toBe("fb962fae-3f6b-77d2-28dd-b900b73d5f61");
    const persisted = await db
      .from("observations")
      .select("valid_from,valid_to")
      .eq("id", original.id)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual({ valid_from: null, valid_to: null });
    expect((await createObservation(base(id))).id).toBe(original.id);
    const distinct = await createObservation({ ...base(id), valid_from: "2026-10-01T00:00:00Z" });
    expect(distinct.id).not.toBe(original.id);
    expect(original.observed_at).toBe(base(id).observed_at);
  });

  it("keeps same-named entity fields separate from observation validity metadata", async () => {
    const id = "ent_validity_storage_domain_fields";
    ids.push(id);
    const written = await createObservation({
      ...base(id),
      fields: { title: "Domain-only date fixture", valid_from: "domain supplied date" },
    });
    const persisted = await db
      .from("observations")
      .select("fields,valid_from,valid_to")
      .eq("id", written.id)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({
      fields: { valid_from: "domain supplied date" },
      valid_from: null,
      valid_to: null,
    });
  });

  it("upgrades an owned old-format SQLite database without rewriting its observations", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    try {
      await database.exec(`CREATE TABLE observations (
        id TEXT PRIMARY KEY,entity_id TEXT NOT NULL,entity_type TEXT NOT NULL,
        schema_version TEXT NOT NULL,source_id TEXT,interpretation_id TEXT,
        observed_at TEXT NOT NULL,specificity_score REAL,source_priority INTEGER,
        observation_source TEXT,fields TEXT,created_at TEXT,user_id TEXT,
        idempotency_key TEXT,canonical_hash TEXT,identity_basis TEXT,identity_rule TEXT
      )`);
      await database
        .prepare(
          "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,fields) VALUES(?,?,?,?,?,?)"
        )
        .run("legacy-row", "legacy-entity", "note", "1.0", "2026-01-01T00:00:00Z", '{"value":1}');
      await ensureSchema(database);
      await ensureSchema(database);
      const row = await database
        .prepare("SELECT id,observed_at,fields,valid_from,valid_to FROM observations")
        .get();
      expect(row).toEqual({
        id: "legacy-row",
        observed_at: "2026-01-01T00:00:00Z",
        fields: '{"value":1}',
        valid_from: null,
        valid_to: null,
      });
      const columns = (await database.prepare("PRAGMA table_info(observations)").all()) as Array<{
        name: string;
      }>;
      expect(columns.filter((c) => c.name === "valid_from")).toHaveLength(1);
      expect(columns.filter((c) => c.name === "valid_to")).toHaveLength(1);
    } finally {
      await database.close();
    }
  });
});
