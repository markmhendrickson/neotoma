/**
 * The REST observation-create route cannot forge the correction shape (#2033).
 *
 * `POST /observations/create` is the public write path closest to what
 * `createCorrection` writes: it passes `source_id: null`, `interpretation_id: null`
 * and `specificity_score: 1.0`, and takes a client-chosen `source_priority`
 * (any number). The only thing keeping a caller from producing the correction
 * shape (and so from pinning a field against later writes) is that
 * `createObservation` stamps a non-null `observation_source` when the request
 * omits one. src/services/correction_identity.ts relies on that; this test pins it
 * on the real route, not only on MCP `store`.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { resolveOwnedObservations } from "../../src/services/attachment_resolution.js";
import { isCorrectionObservation } from "../../src/services/correction_identity.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return { ...original, generateEmbedding: vi.fn().mockResolvedValue(null) };
});

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_rest_obs_forge_2033";
let apiBase: string;

type McpTextResult = { content: Array<{ type?: string; text: string }> };
type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
  retrieveEntitySnapshot: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

async function createObservationViaRest(
  identifier: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${apiBase}/observations/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: TYPE,
      entity_identifier: identifier,
      fields: { name: identifier, ...fields },
      user_id: USER_ID,
      ...extra,
    }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const ids = (entities ?? []).map((e: { id: string }) => e.id);
  if (ids.length > 0) {
    await db.from("timeline_events").delete().in("entity_id", ids);
    await db.from("entity_snapshots").delete().in("entity_id", ids);
    await db.from("raw_fragments").delete().in("entity_id", ids);
    await db.from("observations").delete().in("entity_id", ids);
    await db.from("entities").delete().in("id", ids);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("POST /observations/create cannot forge the correction shape (#2033)", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          value: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["name"],
      },
      reducer_config: {
        merge_policies: { name: { strategy: "last_write" }, value: { strategy: "last_write" } },
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

  it.each([
    ["priority 1000 with no observation_source", { source_priority: 1000 }],
    ["priority 5000 with no observation_source", { source_priority: 5000 }],
    ["the default priority with no observation_source", {}],
  ])(
    "stores a request at %s as an ordinary write that a correction outlasts",
    async (_label, extra) => {
      const identifier = `forge-${randomUUID()}`;
      const seeded = await createObservationViaRest(identifier, { value: "seed" });
      expect(seeded.status).toBe(200);
      const entityId = seeded.body.entity_id as string;

      await tick();
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "value",
        value: "corrected",
        idempotency_key: `forge-correct-${randomUUID()}`,
      });

      await tick();
      const forged = await createObservationViaRest(identifier, { value: "forged" }, extra);
      expect(forged.status).toBe(200);
      expect(forged.body.entity_id).toBe(entityId);

      // The stored row got a declared source kind and so is not a correction...
      const rows = (await resolveOwnedObservations(entityId, USER_ID)) ?? [];
      const forgedRow = rows.find((row) => row.id === forged.body.observation_id);
      expect(forgedRow).toBeDefined();
      expect(forgedRow!.observation_source).toBeTruthy();
      expect(isCorrectionObservation(forgedRow!)).toBe(false);
      // ...exactly one row is a correction, the real one...
      const corrections = rows.filter((row) => isCorrectionObservation(row));
      expect(corrections).toHaveLength(1);
      expect(corrections[0].fields).toEqual({ value: "corrected" });
      // ...so the correction still holds against the forged write.
      const afterForge = parse(
        await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" })
      );
      expect(afterForge.snapshot.value).toBe("corrected");

      // And a later normal correction still replaces it.
      await tick();
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "value",
        value: "corrected again",
        idempotency_key: `forge-correct-2-${randomUUID()}`,
      });
      const afterSecond = parse(
        await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" })
      );
      expect(afterSecond.snapshot.value).toBe("corrected again");
    }
  );
});
