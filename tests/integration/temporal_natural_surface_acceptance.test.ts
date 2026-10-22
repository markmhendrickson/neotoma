/**
 * Natural-surface temporal acceptance fixture (core of SYN-LONG-01 S1–S7).
 *
 * Drives a small synthetic, non-clinical longitudinal episode through the
 * public write and read surfaces only — `store`, `correct`,
 * `retrieve_entity_snapshot` (`at` / `at_ingested`), `list_observations` and
 * `retrieve_field_provenance` — on BOTH the MCP dispatch surface and the
 * offline HTTP (Express) surface. No observation row is inserted directly and
 * no timestamp is backdated: every clock value comes from the server, exactly
 * as an agent would see it.
 *
 * Fixture (fictional sensor "station-syn-01", synthetic.reading in kPa):
 *   S1 store   occ-001  measured_at 2026-10-10  120
 *   S2 store   occ-002  measured_at 2026-10-01  110   (late arrival: earlier
 *                                                      measurement, later write)
 *   S3 correct occ-001.value -> 118
 *   S5 replay  S1 byte-for-byte (same idempotency_key, same payload)
 *   S6 store   occ-004  measured_at 2026-10-12  120   (deliberate repeat of the
 *                                                      same value: new occurrence)
 *   S7 store   occ-001  120 again, new idempotency_key (ordinary later write)
 * S4 (units) and S8+ belong to the broader synthetic longitudinal
 * acceptance scenario set; this file covers its core sequence.
 *
 * Clock contract pinned here (see openapi.yaml `/get_entity_snapshot`):
 *   - `at` filters `observed_at`, which public store/correct stamp with the
 *     server clock at write time. It is assertion time, NOT valid time.
 *   - `at_ingested` filters `created_at` (row-insertion time).
 *   - `measured_at` is an ordinary domain field. There is no native valid-time
 *     axis (#2034), so "latest by measured_at" is an application-level query.
 *
 * Correction durability (#2033) is a positive regression on both surfaces:
 * a newly marked correction survives a later ordinary write. Historical
 * unmarked corrections require separate provenance-based reconciliation.
 * Corrected-field provenance (#2026) is a positive regression on both
 * surfaces after its fix landed in main. Correction `reason` is not asserted.
 */

import type { Server } from "node:http";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import {
  PARITY_USER_ID,
  callHttp,
  callMcp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
  type Transport,
} from "../helpers/transport_parity_matrix.js";

// Install before server imports so the SDK captures the guarded fetch. Keep
// attempted hosts even when optional provider errors are swallowed by writes.
const network = vi.hoisted(() => {
  const originalFetch = globalThis.fetch;
  const attemptedHosts: string[] = [];
  let loopbackRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? String(input) : input.url
    );
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      attemptedHosts.push(url.hostname);
      throw new Error("temporal fixture: external fetch denied");
    }
    loopbackRequests += 1;
    return originalFetch(input, { ...init, redirect: "error" });
  };
  return { originalFetch, attemptedHosts, loopbackRequests: () => loopbackRequests };
});

// Only optional embedding acquisition is substituted; storage, reducers and
// both transports remain real. This fixture does not test provider behavior.
vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return { ...original, generateEmbedding: vi.fn().mockResolvedValue(null) };
});

beforeAll(async () => {
  await expect(fetch("https://example.invalid/sentinel")).rejects.toThrow(
    "temporal fixture: external fetch denied"
  );
  expect(network.attemptedHosts).toEqual(["example.invalid"]);
  network.attemptedHosts.length = 0;
});

afterAll(() => {
  try {
    expect(network.loopbackRequests()).toBeGreaterThan(0);
    expect(network.attemptedHosts, "writes must not attempt external fetch").toEqual([]);
  } finally {
    globalThis.fetch = network.originalFetch;
  }
});

type Json = Record<string, unknown>;

interface Observation {
  id: string;
  source_id: string | null;
  created_at: string;
  observed_at: string;
  source_priority: number;
  fields: Json;
}

interface Surface {
  store(entity: Json, idempotencyKey: string): Promise<{ entityId: string; response: Json }>;
  correct(entityId: string, field: string, value: unknown, idempotencyKey: string): Promise<Json>;
  snapshot(entityId: string, cutoff?: { at?: string; atIngested?: string }): Promise<Json>;
  observations(entityId: string): Promise<Observation[]>;
  provenance(entityId: string, field: string): Promise<Json>;
}

/** Let the server clock move past a checkpoint before the next write. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function checkpoint(): Promise<string> {
  await tick();
  const t = new Date().toISOString();
  await tick();
  return t;
}

function makeSurface(
  transport: Transport,
  mcp: NeotomaServer,
  base: string,
  entityType: string
): Surface {
  if (transport === "mcp") {
    return {
      async store(entity, idempotencyKey) {
        const response = await callMcp(mcp, "store", {
          idempotency_key: idempotencyKey,
          entities: [{ entity_type: entityType, ...entity }],
        });
        const entry = (response.entities as Json[])[0]!;
        return { entityId: entry.entity_id as string, response };
      },
      correct: (entityId, field, value, idempotencyKey) =>
        callMcp(mcp, "correct", {
          entity_id: entityId,
          entity_type: entityType,
          field,
          value,
          idempotency_key: idempotencyKey,
        }),
      snapshot: (entityId, cutoff = {}) =>
        callMcp(mcp, "retrieve_entity_snapshot", {
          entity_id: entityId,
          ...(cutoff.at ? { at: cutoff.at } : {}),
          ...(cutoff.atIngested ? { at_ingested: cutoff.atIngested } : {}),
          format: "json",
        }),
      async observations(entityId) {
        const r = await callMcp(mcp, "list_observations", { entity_id: entityId });
        return r.observations as Observation[];
      },
      provenance: (entityId, field) =>
        callMcp(mcp, "retrieve_field_provenance", { entity_id: entityId, field }),
    };
  }
  const post = async (route: string, body: Json): Promise<Json> => {
    const r = await callHttp(base, route, body);
    if (r.status !== 200) throw new Error(`${route} -> HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    return r.json;
  };
  return {
    async store(entity, idempotencyKey) {
      const response = await post("/store", {
        idempotency_key: idempotencyKey,
        commit: true,
        entities: [{ entity_type: entityType, ...entity }],
      });
      const entry = (response.entities as Json[])[0]!;
      return { entityId: entry.entity_id as string, response };
    },
    correct: (entityId, field, value, idempotencyKey) =>
      post("/correct", {
        entity_id: entityId,
        entity_type: entityType,
        field,
        value,
        idempotency_key: idempotencyKey,
      }),
    snapshot: (entityId, cutoff = {}) =>
      post("/get_entity_snapshot", {
        entity_id: entityId,
        ...(cutoff.at ? { at: cutoff.at } : {}),
        ...(cutoff.atIngested ? { at_ingested: cutoff.atIngested } : {}),
      }),
    async observations(entityId) {
      const r = await post("/list_observations", { entity_id: entityId });
      return r.observations as Observation[];
    },
    provenance: (entityId, field) => post("/get_field_provenance", { entity_id: entityId, field }),
  };
}

const value = (snap: Json): unknown => (snap.snapshot as Json | undefined)?.value;

describe.each<Transport>(["mcp", "offline"])(
  "natural-surface temporal acceptance (SYN-LONG-01 core) — %s",
  (transport) => {
    const run = randomUUID().replace(/-/g, "").slice(0, 10);
    const entityType = `syn_long_reading_${transport}_${run}`;
    const occ = (n: string) => `${run}-occ-${n}`;
    const createdEntityIds = new Set<string>();
    const createdSourceIds = new Set<string>();

    let mcp: NeotomaServer;
    let offline: { server: Server; base: string };
    let surface: Surface;

    // Ids, checkpoints and reads captured while the episode is applied.
    const ids: Record<string, string> = {};
    const at: Record<string, string> = {};
    const seen: Record<string, unknown> = {};
    const s1Payload = () => ({
      occurrence_id: occ("001"),
      station: "station-syn-01",
      measured_at: "2026-10-10",
      value: 120,
      unit: "kPa",
      source_ref: "src-A/ep-1",
    });
    const s1Key = `syn-long-s1-${run}`;

    beforeAll(async () => {
      mcp = makeMcpServer();
      offline = await startOfflineServer();
      surface = makeSurface(transport, mcp, offline.base, entityType);
      const store = surface.store.bind(surface);
      surface.store = async (entity, key) => {
        const result = await store(entity, key);
        createdEntityIds.add(result.entityId);
        if (typeof result.response.source_id === "string") {
          createdSourceIds.add(result.response.source_id);
        }
        return result;
      };

      await schemaRegistry.register({
        entity_type: entityType,
        schema_version: "1.0",
        schema_definition: {
          canonical_name_fields: ["occurrence_id"],
          fields: {
            occurrence_id: { type: "string", required: true },
            station: { type: "string", required: false },
            measured_at: { type: "string", required: false },
            value: { type: "number", required: false },
            unit: { type: "string", required: false },
            source_ref: { type: "string", required: false },
          },
        },
        // Every field on the default policy, so the fixture exercises the
        // path an auto-discovered field takes.
        reducer_config: {
          merge_policies: Object.fromEntries(
            ["occurrence_id", "station", "measured_at", "value", "unit", "source_ref"].map((f) => [
              f,
              { strategy: "last_write" },
            ])
          ),
        },
        user_id: PARITY_USER_ID,
        user_specific: true,
        activate: true,
      });

      at.S0 = await checkpoint();

      // S1
      ids.occ001 = (await surface.store(s1Payload(), s1Key)).entityId;
      at.S1 = await checkpoint();

      // S2 — late arrival: measured earlier than S1, written after it.
      ids.occ002 = (
        await surface.store(
          {
            occurrence_id: occ("002"),
            station: "station-syn-01",
            measured_at: "2026-10-01",
            value: 110,
            unit: "kPa",
            source_ref: "src-B/ep-1",
          },
          `syn-long-s2-${run}`
        )
      ).entityId;
      at.S2 = await checkpoint();

      // S3 — correction of occ-001.
      await surface.correct(ids.occ001, "value", 118, `syn-long-s3-${run}`);
      at.S3 = await checkpoint();
      seen.currentAfterS3 = value(await surface.snapshot(ids.occ001));
      const afterCorrection = await surface.observations(ids.occ001);
      seen.observationsAfterS3 = afterCorrection.length;
      seen.correctionObservation = afterCorrection.find((o) => o.source_priority === 1000);
      try {
        seen.provenanceAfterS3 = await surface.provenance(ids.occ001, "value");
      } catch (err) {
        seen.provenanceAfterS3Error = String(err);
      }

      // S5 — identical replay of S1.
      const replay = await surface.store(s1Payload(), s1Key);
      seen.replayEntityId = replay.entityId;
      at.S5 = await checkpoint();
      seen.currentAfterS5 = value(await surface.snapshot(ids.occ001));
      seen.observationsAfterS5 = (await surface.observations(ids.occ001)).length;

      // S6 — deliberate repeat: same value, new occurrence.
      ids.occ004 = (
        await surface.store(
          {
            occurrence_id: occ("004"),
            station: "station-syn-01",
            measured_at: "2026-10-12",
            value: 120,
            unit: "kPa",
            source_ref: "src-A/ep-2",
          },
          `syn-long-s6-${run}`
        )
      ).entityId;
      at.S6 = await checkpoint();

      // S7 — ordinary later store re-asserting the pre-correction value.
      seen.s7EntityId = (
        await surface.store({ ...s1Payload(), source_ref: "src-A/ep-1/v2" }, `syn-long-s7-${run}`)
      ).entityId;
      at.S7 = await checkpoint();

      for (const id of [ids.occ001, ids.occ002, ids.occ004]) if (id) createdEntityIds.add(id);
    });

    afterAll(async () => {
      const entityIds = [...createdEntityIds];
      if (entityIds.length > 0) {
        await db.from("entity_snapshots").delete().in("entity_id", entityIds);
        await db.from("observations").delete().in("entity_id", entityIds);
        await db.from("entities").delete().in("id", entityIds);
      }
      const sourceIds = [...createdSourceIds];
      if (sourceIds.length > 0) {
        await db.from("raw_fragments").delete().in("source_id", sourceIds);
        await db.from("interpretations").delete().in("source_id", sourceIds);
        await db.from("sources").delete().in("id", sourceIds);
      }
      await db
        .from("schema_registry")
        .delete()
        .eq("entity_type", entityType)
        .eq("user_id", PARITY_USER_ID);
      await stopServer(offline.server);
      expect(sourceIds.length).toBeGreaterThan(0);
      const remaining = await db.from("sources").select("id").in("id", sourceIds);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
    });

    it("occurrences resolve by occurrence_id: S5 and S7 hit occ-001, S6 is new", async () => {
      expect(new Set([ids.occ001, ids.occ002, ids.occ004]).size).toBe(3);
      expect(seen.replayEntityId).toBe(ids.occ001);
      expect(seen.s7EntityId).toBe(ids.occ001);
    });

    it("measured_at is a domain field returned verbatim, never a server clock", async () => {
      const s = (await surface.snapshot(ids.occ002)).snapshot as Json;
      expect(s.measured_at).toBe("2026-10-01");
      const [obs] = await surface.observations(ids.occ002);
      expect(obs!.fields.measured_at).toBe("2026-10-01");
      expect(obs!.observed_at.slice(0, 10)).not.toBe("2026-10-01");
    });

    it("late arrival: `at` before the write excludes occ-002 although its measured_at is earlier", async () => {
      for (const cutoff of [{ at: at.S1 }, { atIngested: at.S1 }]) {
        const snap = await surface.snapshot(ids.occ002, cutoff);
        expect(snap.observation_count).toBe(0);
        expect(value(snap)).toBeUndefined();
      }
      expect(value(await surface.snapshot(ids.occ002, { at: at.S2 }))).toBe(110);
    });

    it("historical reconstruction: @S1 occ-001=120; @S3 occ-001=118 and occ-002=110", async () => {
      for (const key of ["at", "atIngested"] as const) {
        expect(value(await surface.snapshot(ids.occ001, { [key]: at.S0 }))).toBeUndefined();
        expect(value(await surface.snapshot(ids.occ001, { [key]: at.S1 }))).toBe(120);
        expect(value(await surface.snapshot(ids.occ001, { [key]: at.S3 }))).toBe(118);
        expect(value(await surface.snapshot(ids.occ002, { [key]: at.S3 }))).toBe(110);
      }
    });

    it("both cutoffs apply together: the earlier bound excludes the correction", async () => {
      expect(value(await surface.snapshot(ids.occ001, { at: at.S1, atIngested: at.S3 }))).toBe(120);
      expect(value(await surface.snapshot(ids.occ001, { at: at.S3, atIngested: at.S1 }))).toBe(120);
      expect(value(await surface.snapshot(ids.occ001, { at: at.S3, atIngested: at.S3 }))).toBe(118);
    });

    it("correction takes effect as a priority-1000 assertion", async () => {
      expect(seen.currentAfterS3).toBe(118);
      const corrections = (await surface.observations(ids.occ001)).filter(
        (o) => o.source_priority === 1000
      );
      expect(corrections.map((o) => o.fields.value)).toEqual([118]);
    });

    it("field provenance of the corrected value resolves to the correction without error", async () => {
      expect(seen.provenanceAfterS3Error).toBeUndefined();
      const provenance = seen.provenanceAfterS3 as Json;
      const correction = seen.correctionObservation as Observation;
      expect(correction).toBeDefined();
      expect(provenance.field).toBe("value");
      if (transport === "mcp") {
        expect(provenance.value).toBe(118);
        expect(provenance.source_observation).toMatchObject({
          id: correction.id,
          source_id: null,
          source_priority: 1000,
          observed_at: correction.observed_at,
        });
        expect(provenance.source).toBeNull();
      } else {
        expect(provenance.observation_ids).toEqual([correction.id]);
        expect(provenance.observations).toMatchObject([
          { id: correction.id, source_priority: 1000, fields: { value: 118 } },
        ]);
        expect(provenance.sources).toEqual([]);
      }
    });

    it("identical replay adds no assertion; a deliberate repeat is a separate occurrence", async () => {
      expect(seen.observationsAfterS5).toBe(seen.observationsAfterS3);
      expect(seen.currentAfterS5).toBe(118);
      expect(value(await surface.snapshot(ids.occ004))).toBe(120);
      expect((await surface.observations(ids.occ004)).length).toBe(1);
    });

    it("full history of occ-001 lists exactly S1, S3, S7 in write order", async () => {
      const history = (await surface.observations(ids.occ001))
        .slice()
        .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
      expect(history.map((o) => o.fields.value)).toEqual([120, 118, 120]);
      expect(history.map((o) => o.source_priority === 1000)).toEqual([false, true, false]);
      expect(history.map((o) => o.fields.source_ref ?? null)).toEqual([
        "src-A/ep-1",
        null,
        "src-A/ep-1/v2",
      ]);
    });

    it("the correction survives an ordinary later store of the old value", async () => {
      expect(value(await surface.snapshot(ids.occ001))).toBe(118);
      expect(value(await surface.snapshot(ids.occ001, { at: at.S7 }))).toBe(118);
    });
  }
);
