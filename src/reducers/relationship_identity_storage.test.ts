/** Real nonce SQLite consumers; synthetic ordinary data, not native authority. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AsyncSqliteDatabase } from "../repositories/sqlite/sqlite_driver.js";
import { ensureSchema } from "../repositories/sqlite/sqlite_client.js";
import * as connection from "../repositories/db/connection.js";
import { createLocalDbClient } from "../repositories/sqlite/local_db_adapter.js";
import { relationshipsService } from "../services/relationships.js";
import { repointRelationshipObservations } from "../services/observation_storage.js";
import { mergeEntities } from "../services/entity_merge.js";
import { RelationshipReducer, RelationshipIdentityError } from "./relationship_reducer.js";

vi.mock("../events/substrate_store_emit.js", () => ({
  emitEntityLifecycle: vi.fn(),
  emitEntitySnapshotChange: vi.fn(),
  emitRelationshipLifecycle: vi.fn(),
  emitObservationCreated: vi.fn(),
  shallowFieldsChanged: vi.fn(),
}));
let database: AsyncSqliteDatabase;
let directory: string;
const owner = "synthetic-identity-owner";
const client = createLocalDbClient();
beforeEach(async () => {
  mkdirSync(join(process.cwd(), ".vitest"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".vitest/native598-key-"));
  database = new AsyncSqliteDatabase(join(directory, "synthetic-ordinary.sqlite"));
  await ensureSchema(database);
  // Only the DB location is bound: all adapter/service SQL below is real.
  // No caller identity, grant, admission or origin is fabricated.
  vi.spyOn(connection, "getDb").mockResolvedValue(database);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});
async function insert(id: string, source: string, target: string) {
  const result = await client
    .from("relationship_observations")
    .insert({
      id,
      relationship_type: "PART_OF",
      source_entity_id: source,
      target_entity_id: target,
      user_id: owner,
      metadata: { synthetic: true },
      observed_at: "2026-01-01T00:00:00.000Z",
    })
    .select()
    .single();
  expect(result.error).toBeNull();
  return result.data;
}
describe("ordinary consumers of the existing generalized key method", () => {
  it("propagates the actual shared key failure before lower-adapter persistence", async () => {
    vi.spyOn(RelationshipReducer, "generateRelationshipKey").mockImplementation(() => {
      throw new RelationshipIdentityError();
    });
    const result = await client.from("relationship_observations").insert({
      id: "synthetic-refused",
      relationship_type: "PART_OF",
      source_entity_id: "synthetic-left",
      target_entity_id: "synthetic-right",
      user_id: owner,
    });
    expect(result.error).not.toBeNull();
    expect(
      await database.prepare("SELECT count(*) AS n FROM relationship_observations").get()
    ).toEqual({ n: 0 });
    expect(
      await database.prepare("SELECT count(*) AS n FROM relationship_snapshots").get()
    ).toEqual({ n: 0 });
  });
  it("uses the shared key at actual lower insert, reducer materialization and service lookup", async () => {
    const row = await insert("synthetic-one", "synthetic-left", "synthetic-right");
    expect(row?.relationship_key).toBe("PART_OF:synthetic-left:synthetic-right");
    expect(
      await database.prepare("SELECT relationship_key FROM relationship_snapshots").get()
    ).toEqual({ relationship_key: "PART_OF:synthetic-left:synthetic-right" });
    const snapshot = await relationshipsService.getRelationshipSnapshot(
      "PART_OF",
      "synthetic-left",
      "synthetic-right",
      owner
    );
    expect(snapshot?.relationship_key).toBe("PART_OF:synthetic-left:synthetic-right");
    expect(snapshot?.snapshot).toEqual({ synthetic: true });
  });
  it("preserves ordinary repoint keys through the actual storage service", async () => {
    await insert("synthetic-repoint", "synthetic-before", "synthetic-target");
    expect(
      await repointRelationshipObservations("synthetic-before", "synthetic-after", owner)
    ).toBe(1);
    expect(
      await database.prepare("SELECT relationship_key FROM relationship_observations").get()
    ).toEqual({ relationship_key: "PART_OF:synthetic-after:synthetic-target" });
  });
  it("propagates the shared key failure before actual repoint changes", async () => {
    await insert("synthetic-repoint-refused", "synthetic-before", "synthetic-target");
    vi.spyOn(RelationshipReducer, "generateRelationshipKey").mockImplementation(() => {
      throw new RelationshipIdentityError();
    });
    await expect(
      repointRelationshipObservations("synthetic-before", "synthetic-after", owner)
    ).rejects.toThrow();
    expect(
      await database.prepare("SELECT relationship_key FROM relationship_observations").get()
    ).toEqual({ relationship_key: "PART_OF:synthetic-before:synthetic-target" });
  });
  it("preserves keys through the actual merge transaction without creating native authority", async () => {
    for (const id of ["synthetic-before", "synthetic-after", "synthetic-target"]) {
      await database
        .prepare("INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES (?,?,?,?)")
        .run(id, "synthetic", id, owner);
    }
    await insert("synthetic-merge", "synthetic-before", "synthetic-target");
    const result = await mergeEntities({
      fromEntityId: "synthetic-before",
      toEntityId: "synthetic-after",
      userId: owner,
      mergedBy: "synthetic-test",
    });
    expect(result.relationships_repointed).toBe(1);
    expect(
      await database.prepare("SELECT relationship_key FROM relationship_observations").get()
    ).toEqual({ relationship_key: "PART_OF:synthetic-after:synthetic-target" });
    expect(
      await database
        .prepare(
          "SELECT count(*) AS n FROM relationship_observations WHERE relationship_type='principal_binding'"
        )
        .get()
    ).toEqual({ n: 0 });
  });
  it("rolls back the actual merge transaction on shared key failure", async () => {
    for (const id of ["synthetic-before", "synthetic-after", "synthetic-target"]) {
      await database
        .prepare("INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES (?,?,?,?)")
        .run(id, "synthetic", id, owner);
    }
    await insert("synthetic-merge-refused", "synthetic-before", "synthetic-target");
    vi.spyOn(RelationshipReducer, "generateRelationshipKey").mockImplementation(() => {
      throw new RelationshipIdentityError();
    });
    await expect(
      mergeEntities({
        fromEntityId: "synthetic-before",
        toEntityId: "synthetic-after",
        userId: owner,
        mergedBy: "synthetic-test",
      })
    ).rejects.toThrow();
    expect(
      await database.prepare("SELECT relationship_key FROM relationship_observations").get()
    ).toEqual({ relationship_key: "PART_OF:synthetic-before:synthetic-target" });
    expect(
      await database
        .prepare("SELECT merged_to_entity_id FROM entities WHERE id='synthetic-before'")
        .get()
    ).toEqual({ merged_to_entity_id: null });
  });
});
