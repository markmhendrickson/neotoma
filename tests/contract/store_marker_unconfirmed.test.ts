/**
 * A store whose writes committed but whose completion marker cannot be
 * confirmed answers success with `write_committed`, on every surface that
 * exposes it: the REST core (`storeStructuredForApi`) and MCP `store`, each
 * with and without an interpretation.
 *
 * The failure is forced for real: a trigger refuses the UPDATE that stamps the
 * `complete` marker on this test's keyed sources, so `markStoreWriteComplete`
 * fails after every observation has landed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { readStoreWriteState } from "../../src/services/store_write_state.js";

let userId: string;
let batch: string;
let entityType: string;
let triggerName: string;

type Reply = Record<string, unknown> & {
  entities?: Array<{ observation_id: string | null; entity_snapshot_after?: unknown }>;
};

function entities(count = 3) {
  return Array.from({ length: count }, (_, seq) => ({
    entity_type: entityType,
    title: `marker unconfirmed ${batch} ${seq}`,
    batch,
    seq,
  }));
}

async function failMarker(): Promise<void> {
  const conn = await getDb();
  await conn.exec(
    `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON sources ` +
      `WHEN json_extract(NEW.provenance, '$.store_write.state') = 'complete' ` +
      `AND NEW.idempotency_key LIKE 'mu-${batch}-%' ` +
      `BEGIN SELECT RAISE(ABORT, 'injected marker failure'); END`
  );
}

async function restoreMarker(): Promise<void> {
  const conn = await getDb();
  await conn.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
}

async function markerState(key: string) {
  const { data } = await db
    .from("sources")
    .select("provenance")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return readStoreWriteState(data?.provenance);
}

async function observationCount(): Promise<number> {
  const { data } = await db.from("observations").select("id").eq("user_id", userId);
  return (data ?? []).length;
}

const rest = (key: string, extra: Record<string, unknown> = {}): Promise<Reply> =>
  storeStructuredForApi({
    userId,
    entities: entities(),
    sourcePriority: 100,
    idempotencyKey: key,
    ...extra,
  }) as unknown as Promise<Reply>;

function mcp(key: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = userId;
  return (
    server as unknown as {
      store: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  )
    .store({
      user_id: userId,
      idempotency_key: key,
      entities: entities(),
      source_priority: 100,
      ...extra,
    })
    .then((r) => JSON.parse(r.content[0].text) as Reply);
}

const FIELDS = ["write_committed", "store_write_completion", "store_write_completion_note"];

async function cleanup() {
  await restoreMarker();
  const { data: sources } = await db.from("sources").select("id").eq("user_id", userId);
  const sourceIds = (sources ?? []).map((s: { id: string }) => s.id);
  const { data: ents } = await db.from("entities").select("id").eq("user_id", userId);
  const entityIds = (ents ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) await db.from("entity_snapshots").delete().in("entity_id", entityIds);
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("interpretations").delete().eq("user_id", userId);
  if (sourceIds.length > 0) {
    await db.from("raw_fragments").delete().in("source_id", sourceIds);
    await db.from("sources").delete().in("id", sourceIds);
  }
  if (entityIds.length > 0) await db.from("entities").delete().in("id", entityIds);
}

describe("store: committed with the completion marker unconfirmed", () => {
  beforeEach(async () => {
    userId = randomUUID();
    batch = randomUUID().replace(/-/g, "").slice(0, 12);
    entityType = `store_marker_unconfirmed_${batch}`;
    triggerName = `marker_fail_${batch}`;
    await schemaRegistry.register({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          batch: { type: "string", required: false },
          seq: { type: "number", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: { title: { strategy: "last_write" } } },
      user_id: userId,
      user_specific: true,
      activate: true,
    });
  });
  afterEach(cleanup);

  const surfaces: Array<[string, (k: string, e?: Record<string, unknown>) => Promise<Reply>]> = [
    ["REST core", rest],
    ["MCP store", mcp],
  ];

  for (const [name, store] of surfaces) {
    describe(name, () => {
      it("a normal store carries none of the fields", async () => {
        const key = `mu-${batch}-ok-${randomUUID()}`;
        const reply = await store(key);
        for (const f of FIELDS) expect(reply).not.toHaveProperty(f);
        expect(await markerState(key)).toBe("complete");
      });

      it("a forced marker failure still succeeds, names the commit, and offers one replay", async () => {
        const key = `mu-${batch}-plain-${randomUUID()}`;
        await failMarker();
        const reply = await store(key);

        expect(reply.write_committed).toBe(true);
        expect(reply.store_write_completion).toBe("unconfirmed");
        expect(String(reply.store_write_completion_note)).toMatch(/optional replay/);
        expect(reply.entities).toHaveLength(3);
        for (const e of reply.entities ?? []) expect(e.observation_id).toBeTruthy();
        expect(await observationCount()).toBe(3);
        expect(await markerState(key)).toBe("in_progress");

        // The promised replay completes the marker and adds no observation.
        await restoreMarker();
        const replay = await store(key);
        for (const f of FIELDS) expect(replay).not.toHaveProperty(f);
        expect(await observationCount()).toBe(3);
        expect(await markerState(key)).toBe("complete");
      });

      it("with an interpretation the note promises no replay, and a replay is indeed refused", async () => {
        const key = `mu-${batch}-interp-${randomUUID()}`;
        const extra = { interpretation: { source_ref: "structured" } };
        await failMarker();
        const reply = await store(key, extra);

        expect(reply.write_committed).toBe(true);
        expect(reply.store_write_completion).toBe("unconfirmed");
        const note = String(reply.store_write_completion_note);
        expect(note).toMatch(/No replay is needed/);
        expect(note).not.toMatch(/optional replay/);
        expect(await observationCount()).toBe(3);

        await restoreMarker();
        await expect(store(key, extra)).rejects.toThrow(/ERR_STORE_WRITE_INCOMPLETE/);
        expect(await observationCount()).toBe(3);
      });

      it("a normal interpretation store carries none of the fields", async () => {
        const reply = await store(`mu-${batch}-interp-ok-${randomUUID()}`, {
          interpretation: { source_ref: "structured" },
        });
        for (const f of FIELDS) expect(reply).not.toHaveProperty(f);
      });
    });
  }
});
