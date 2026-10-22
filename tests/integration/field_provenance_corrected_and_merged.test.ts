/**
 * Field provenance stays readable for corrected and merged fields (#2026).
 *
 * `correct()` writes its observation with `source_id: null` — corrections have
 * no source document — and that observation wins the snapshot. Before this fix
 * the MCP `retrieve_field_provenance` handler threw
 * `InternalError: Observation does not have source_id` for every corrected
 * field. A `merge_array` field had a second, independent failure: its snapshot
 * provenance is a comma-joined list of contributing observation ids, which the
 * MCP handler looked up as one id and so never found.
 *
 * Each case runs the real write path (store, then correct or store again) and
 * reads provenance back over both surfaces: the MCP handler and
 * `POST /get_field_provenance`.
 *
 * Scope: these cases pin only that the reads succeed and identify the right
 * observation. They deliberately do not pin the MCP response's key set: giving
 * the MCP and HTTP surfaces one declared response shape is a separate change.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return {
    ...original,
    generateEmbedding: vi.fn().mockResolvedValue(null),
  };
});

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_field_provenance_2026";

type McpTextResult = { content: Array<{ type?: string; text: string }> };

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
  retrieveFieldProvenance: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const entityIds = (entities ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", entityIds);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r: { source_id?: string | null }) => r.source_id)
          .filter((v: unknown): v is string => typeof v === "string")
      )
    );
    await db.from("timeline_events").delete().in("entity_id", entityIds);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("retrieve_field_provenance on corrected and merged fields (#2026)", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;
  let apiBase: string;

  async function storeEntity(label: string, extra: Record<string, unknown> = {}) {
    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `seed-2026-${label}-${randomUUID()}`,
        commit: true,
        entities: [{ entity_type: TYPE, label, notes: "as first stored", ...extra }],
      })
    );
    const entityId = stored.entities?.[0]?.entity_id;
    expect(typeof entityId).toBe("string");
    return entityId as string;
  }

  async function httpProvenance(entityId: string, field: string) {
    const res = await fetch(`${apiBase}/get_field_provenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, field }),
    });
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  }

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;

    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: true },
          notes: { type: "string", required: false, preserveCase: true },
          tags: { type: "array", required: false },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          notes: { strategy: "highest_priority", tie_breaker: "source_priority" },
          tags: { strategy: "merge_array" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolveListen, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolveListen());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupType();
  });

  describe("a field whose winning observation is a correction (NULL source_id)", () => {
    let entityId: string;
    let correctionObservationId: string;
    const idempotencyKey = `correct-2026-${randomUUID()}`;

    beforeAll(async () => {
      entityId = await storeEntity(`corrected-${randomUUID()}`);
      const corrected = parse(
        await server.correct({
          user_id: USER_ID,
          entity_id: entityId,
          entity_type: TYPE,
          field: "notes",
          value: "as corrected",
          idempotency_key: idempotencyKey,
        })
      );
      correctionObservationId = corrected.observation_id;
      expect(typeof correctionObservationId).toBe("string");

      const { data: row } = await db
        .from("observations")
        .select("source_id")
        .eq("id", correctionObservationId)
        .single();
      // Precondition: the correction really has no source, which is the case
      // that used to throw.
      expect(row?.source_id ?? null).toBeNull();
    });

    it("MCP returns the correction as the source observation, with source: null", async () => {
      const body = parse(
        await server.retrieveFieldProvenance({ entity_id: entityId, field: "notes" })
      );

      expect(body.field).toBe("notes");
      expect(body.value).toBe("as corrected");
      expect(body.source).toBeNull();
      expect(body.source_observation).toMatchObject({
        id: correctionObservationId,
        source_id: null,
        source_priority: 1000,
      });
      expect(typeof body.source_observation.observed_at).toBe("string");
      expect(body.observed_at).toBe(body.source_observation.observed_at);
    });

    it("HTTP returns 200 with the correction observation and no sources", async () => {
      const { status, json } = await httpProvenance(entityId, "notes");

      expect(status).toBe(200);
      expect(json.observation_ids).toEqual([correctionObservationId]);
      expect(json.observations).toHaveLength(1);
      expect(json.observations[0]).toMatchObject({
        id: correctionObservationId,
        source_id: null,
        source_priority: 1000,
      });
      expect(json.sources).toEqual([]);
    });

    it("an uncorrected field on the same entity still resolves its source", async () => {
      const body = parse(
        await server.retrieveFieldProvenance({ entity_id: entityId, field: "label" })
      );
      expect(typeof body.source_observation.source_id).toBe("string");
      expect(body.source?.id).toBe(body.source_observation.source_id);
    });
  });

  describe("a merge_array field built from several observations", () => {
    let entityId: string;

    beforeAll(async () => {
      const label = `merged-${randomUUID()}`;
      entityId = await storeEntity(label, { tags: ["alpha"] });
      const again = await storeEntity(label, { tags: ["beta"] });
      expect(again).toBe(entityId);
    });

    it("MCP resolves a contributing observation instead of failing", async () => {
      const { data: snap } = await db
        .from("entity_snapshots")
        .select("provenance")
        .eq("entity_id", entityId)
        .single();
      const provenance =
        typeof snap?.provenance === "string" ? JSON.parse(snap.provenance) : snap?.provenance;
      const contributing = String(provenance.tags).split(",");
      // Precondition: the snapshot stores a comma-joined id list for this field.
      expect(contributing.length).toBe(2);

      const body = parse(
        await server.retrieveFieldProvenance({ entity_id: entityId, field: "tags" })
      );

      expect([...body.value].sort()).toEqual(["alpha", "beta"]);
      // source_observation is one real contributor, never the raw joined list.
      expect(contributing).toContain(body.source_observation.id);
      expect(body.source?.id).toBe(body.source_observation.source_id);
    });

    it("HTTP returns every contributing observation", async () => {
      const { status, json } = await httpProvenance(entityId, "tags");
      expect(status).toBe(200);
      expect(json.observation_ids).toHaveLength(2);
      expect(json.observations).toHaveLength(2);
    });
  });

  describe("a non-NULL source_id that does not resolve", () => {
    const entityId = `${TYPE}_dangling_${randomUUID()}`;
    const observationId = randomUUID();

    beforeAll(async () => {
      await db.from("entities").insert({
        id: entityId,
        user_id: USER_ID,
        entity_type: TYPE,
        canonical_name: "dangling source",
      });
      await db.from("observations").insert({
        id: observationId,
        entity_id: entityId,
        entity_type: TYPE,
        schema_version: "1.0",
        observed_at: new Date().toISOString(),
        source_priority: 0,
        source_id: randomUUID(),
        fields: { notes: "points at a missing source" },
        user_id: USER_ID,
      });
      await db.from("entity_snapshots").insert({
        entity_id: entityId,
        user_id: USER_ID,
        entity_type: TYPE,
        schema_version: "1.0",
        snapshot: JSON.stringify({ notes: "points at a missing source" }),
        provenance: JSON.stringify({ notes: observationId }),
        observation_count: 1,
      });
    });

    it("MCP still reports it as an error (integrity violation)", async () => {
      await expect(
        server.retrieveFieldProvenance({ entity_id: entityId, field: "notes" })
      ).rejects.toMatchObject({
        code: -32603,
        data: {
          error_code: "PROVENANCE_INTEGRITY_ERROR",
          details: { field: "notes", reference_kind: "source" },
        },
      });
    });
  });
});
