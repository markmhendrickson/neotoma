/**
 * Routing test: every observation insertion site goes through the shared
 * primitive.
 *
 * The characterization test next to this file pins what each site persists.
 * This one pins WHERE the row is built and inserted: it wraps the primitive's
 * functions in pass-through spies and asserts that `createObservation`, the
 * MCP structured-store core and `createCorrection` each call them, with the row
 * that ends up persisted. Reverting the extraction (inlining the insert back
 * into a site) makes the corresponding case fail.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  build: vi.fn(),
  find: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../src/services/observation_insert.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/observation_insert.js")>();
  return {
    ...actual,
    buildObservationRow: (...args: Parameters<typeof actual.buildObservationRow>) => {
      spies.build(...args);
      return actual.buildObservationRow(...args);
    },
    findExistingObservation: (...args: Parameters<typeof actual.findExistingObservation>) => {
      spies.find(...args);
      return actual.findExistingObservation(...args);
    },
    insertObservationRow: (...args: Parameters<typeof actual.insertObservationRow>) => {
      spies.insert(...args);
      return actual.insertObservationRow(...args);
    },
  };
});

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";

const MCP_USER_ID = "00000000-0000-0000-0000-000000000000";
const USER = "test-user-observation-routing";
const RUN = `obs-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("observation insertion sites route through the shared primitive", () => {
  const entityIds: string[] = [];

  beforeEach(() => {
    spies.build.mockClear();
    spies.find.mockClear();
    spies.insert.mockClear();
  });

  afterAll(async () => {
    for (const id of entityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("createObservation builds, probes and inserts via the primitive", async () => {
    const entityId = `ent_${RUN}_http`;
    entityIds.push(entityId);
    const params = {
      entity_id: entityId,
      entity_type: "note",
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1,
      source_priority: 100,
      fields: { title: `${RUN} http` },
      user_id: USER,
    };
    const created = await createObservation(params);

    expect(spies.build).toHaveBeenCalledTimes(1);
    expect(spies.find).toHaveBeenCalledTimes(1);
    expect(spies.find.mock.calls[0].slice(0, 2)).toEqual([created.id, USER]);
    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.insert.mock.calls[0][0]).toMatchObject({ id: created.id, entity_id: entityId });

    // A replay probes, finds the row, and inserts nothing further.
    spies.insert.mockClear();
    await createObservation(params);
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("the MCP structured-store core and createCorrection route through it too", async () => {
    const server = new NeotomaServer();
    const marker = `${RUN}-mcp`;
    const stored = await server.executeToolForCli(
      "store",
      { entities: [{ entity_type: "note", title: marker }], idempotency_key: marker },
      MCP_USER_ID
    );
    const entityId = (
      JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> }
    ).entities[0].entity_id;
    entityIds.push(entityId);

    expect(spies.build).toHaveBeenCalled();
    expect(spies.find).toHaveBeenCalled();
    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.insert.mock.calls[0][0]).toMatchObject({
      entity_id: entityId,
      source_priority: 100,
      user_id: MCP_USER_ID,
    });

    spies.build.mockClear();
    spies.find.mockClear();
    spies.insert.mockClear();
    const correction = await createCorrection({
      entity_id: entityId,
      entity_type: "note",
      field: "title",
      value: `${marker} corrected`,
      schema_version: "1.0",
      user_id: MCP_USER_ID,
      idempotency_key: `${marker}-c`,
    });
    expect(spies.build).toHaveBeenCalledTimes(1);
    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.insert.mock.calls[0][0]).toMatchObject({
      id: correction.observation_id,
      source_priority: 1000,
    });
    // The correction site has never probed first: it relies on the unique
    // constraint for replay, and must keep doing so.
    expect(spies.find).not.toHaveBeenCalled();
  });
});
