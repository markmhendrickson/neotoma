import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaClient } from "../../packages/client/src/client.js";
import { SequentialCorrectionError } from "../../packages/client/src/correction.js";
import { snapshotOnUpdate } from "../../packages/client/src/helpers.js";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const TYPE = "sdk_client_correct_http_fixture";

describe("@neotoma/client correct() against the real HTTP server", () => {
  let httpServer: ReturnType<typeof createServer>;
  let client: NeotomaClient;
  let entityId: string;
  let runKey: string;
  let baseUrl: string;

  async function seedEntity(suffix: string): Promise<string> {
    const stored = await client.store({
      idempotency_key: `${runKey}-${suffix}-seed`,
      entities: [
        {
          entity_type: TYPE,
          label: `Synthetic SDK fixture ${runKey}-${suffix}`,
          status: "seeded",
          note: "seeded",
        },
      ],
    });
    const id = stored.entities?.[0]?.entity_id;
    if (!id) throw new Error("SDK seed store returned no entity_id");
    return id;
  }

  // `/get_entity_snapshot` returns the raw snapshot row and does NOT carry
  // `entity_version`; the entity-level version is returned by the entity query
  // endpoint (and by each `/correct` response).
  async function readEntity(id: string): Promise<{
    entity_version: string;
    snapshot: Record<string, unknown>;
  }> {
    const queried = (await client.retrieveEntities({
      entity_type: TYPE,
      limit: 200,
    })) as { entities?: Array<{ entity_id: string; entity_version?: string }> };
    const row = queried.entities?.find((entity) => entity.entity_id === id);
    const version = row?.entity_version;
    if (typeof version !== "string" || version.length === 0) {
      throw new Error("entity query returned no entity_version");
    }
    const snap = (await client.retrieveEntitySnapshot({ entity_id: id })) as {
      snapshot: Record<string, unknown>;
    };
    return { entity_version: version, snapshot: snap.snapshot };
  }

  beforeAll(async () => {
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: false },
          status: { type: "string", required: false },
          note: { type: "string", required: false },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          status: { strategy: "last_write" },
          note: { strategy: "last_write" },
        },
      },
      activate: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", resolve);
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP test server did not bind to a TCP port");
    }
    runKey = `sdk-client-correct-http-${address.port}`;
    baseUrl = `http://127.0.0.1:${address.port}`;
    client = new NeotomaClient({
      transport: "http",
      baseUrl,
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("Authorization");
        return fetch(input, { ...init, headers });
      },
    });

    const stored = await client.store({
      idempotency_key: `${runKey}-seed`,
      entities: [
        {
          entity_type: TYPE,
          label: "Synthetic SDK correction fixture",
          status: "seeded",
          note: "seeded",
        },
      ],
    });
    entityId = stored.entities?.[0]?.entity_id ?? "";
    if (!entityId) throw new Error("SDK seed store returned no entity_id");
  });

  afterAll(async () => {
    await client?.dispose();
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    await cleanupEntityType(TYPE, LOCAL_DEV_USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("persists canonical correct() and per-changed-field snapshotOnUpdate() writes", async () => {
    await client.correct({
      entity_id: entityId,
      entity_type: TYPE,
      field: "status",
      value: "canonical-updated",
      idempotency_key: `${runKey}-canonical`,
    });

    const afterCanonical = (await client.retrieveEntitySnapshot({
      entity_id: entityId,
    })) as { snapshot?: Record<string, unknown> };
    expect(afterCanonical.snapshot?.status).toBe("canonical-updated");

    const helperResult = await snapshotOnUpdate(client, {
      entityId,
      entityType: TYPE,
      corrections: {
        status: "canonical-updated",
        note: "helper-updated",
      },
      idempotencyKey: `${runKey}-helper`,
    });

    expect(helperResult.applied).toBe(true);
    expect(helperResult.correctionResults).toHaveLength(1);
    const afterHelper = (await client.retrieveEntitySnapshot({
      entity_id: entityId,
    })) as { snapshot?: Record<string, unknown> };
    expect(afterHelper.snapshot).toMatchObject({
      status: "canonical-updated",
      note: "helper-updated",
    });
  });

  it("persists both deprecated map fields with a chained version precondition", async () => {
    const id = await seedEntity("map-cas");
    const before = await readEntity(id);

    const results = await client.correct({
      entity_id: id,
      entity_type: TYPE,
      corrections: { status: "map-updated", note: "map-updated" },
      idempotency_key: `${runKey}-map-cas`,
      expected_version: before.entity_version,
    });

    expect(results).toHaveLength(2);
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "map-updated",
      status: "map-updated",
    });
  });

  it("persists both snapshotOnUpdate fields with a chained version precondition", async () => {
    const id = await seedEntity("helper-cas");
    const before = await readEntity(id);

    const result = await snapshotOnUpdate(client, {
      entityId: id,
      entityType: TYPE,
      corrections: { status: "helper-cas-updated", note: "helper-cas-updated" },
      idempotencyKey: `${runKey}-helper-cas`,
      expectedVersion: before.entity_version,
    });

    expect(result.correctionResults).toHaveLength(2);
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "helper-cas-updated",
      status: "helper-cas-updated",
    });
  });

  it("refuses a stale caller version before either map field is written", async () => {
    const id = await seedEntity("stale-cas");
    const before = await readEntity(id);
    await client.correct({
      entity_id: id,
      entity_type: TYPE,
      field: "status",
      value: "intervening-writer",
      idempotency_key: `${runKey}-intervening-writer`,
    });

    await expect(
      client.correct({
        entity_id: id,
        entity_type: TYPE,
        corrections: { status: "stale-caller", note: "stale-caller" },
        idempotency_key: `${runKey}-stale-cas`,
        expected_version: before.entity_version,
      })
    ).rejects.toMatchObject({ committedFields: [] });

    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "seeded",
      status: "intervening-writer",
    });
  });

  it("reports a partial conflict and retries only the uncommitted field", async () => {
    const id = await seedEntity("partial-cas");
    const before = await readEntity(id);
    let intervened = false;
    const racingClient = new NeotomaClient({
      transport: "http",
      baseUrl,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("Authorization");
        const response = await fetch(input, { ...init, headers });
        if (
          !intervened &&
          String(input).endsWith("/correct") &&
          JSON.parse(String(init?.body)).field === "note"
        ) {
          intervened = true;
          await client.correct({
            entity_id: id,
            entity_type: TYPE,
            field: "status",
            value: "intervening-writer",
            idempotency_key: `${runKey}-partial-writer`,
          });
        }
        return response;
      },
    });

    let failure: unknown;
    try {
      await racingClient.correct({
        entity_id: id,
        entity_type: TYPE,
        corrections: { status: "retry-complete", note: "first-committed" },
        idempotency_key: `${runKey}-partial-initial`,
        expected_version: before.entity_version,
      });
    } catch (error) {
      failure = error;
    } finally {
      await racingClient.dispose();
    }

    expect(intervened).toBe(true);
    expect(failure).toBeInstanceOf(SequentialCorrectionError);
    expect((failure as SequentialCorrectionError).committedFields).toEqual(["note"]);
    expect((failure as Error).message).toContain("Fields already committed: note");
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "first-committed",
      status: "intervening-writer",
    });

    const retryVersion = (await readEntity(id)).entity_version;
    await client.correct({
      entity_id: id,
      entity_type: TYPE,
      corrections: { status: "retry-complete" },
      idempotency_key: `${runKey}-partial-retry`,
      expected_version: retryVersion,
    });
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "first-committed",
      status: "retry-complete",
    });
  });

  it("reports a snapshotOnUpdate partial conflict and retries only the uncommitted field", async () => {
    const id = await seedEntity("helper-partial");
    const before = await readEntity(id);
    let intervened = false;
    const racingClient = new NeotomaClient({
      transport: "http",
      baseUrl,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.delete("Authorization");
        const response = await fetch(input, { ...init, headers });
        if (
          !intervened &&
          String(input).endsWith("/correct") &&
          JSON.parse(String(init?.body)).field === "note"
        ) {
          intervened = true;
          await client.correct({
            entity_id: id,
            entity_type: TYPE,
            field: "status",
            value: "intervening-writer",
            idempotency_key: `${runKey}-helper-partial-writer`,
          });
        }
        return response;
      },
    });

    let failure: unknown;
    try {
      await snapshotOnUpdate(racingClient, {
        entityId: id,
        entityType: TYPE,
        corrections: { status: "retry-complete", note: "first-committed" },
        idempotencyKey: `${runKey}-helper-partial-initial`,
        expectedVersion: before.entity_version,
      });
    } catch (error) {
      failure = error;
    } finally {
      await racingClient.dispose();
    }

    expect(intervened).toBe(true);
    expect(failure).toBeInstanceOf(SequentialCorrectionError);
    expect((failure as SequentialCorrectionError).committedFields).toEqual(["note"]);
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "first-committed",
      status: "intervening-writer",
    });

    const retryVersion = (await readEntity(id)).entity_version;
    await snapshotOnUpdate(client, {
      entityId: id,
      entityType: TYPE,
      corrections: { status: "retry-complete" },
      idempotencyKey: `${runKey}-helper-partial-retry`,
      expectedVersion: retryVersion,
    });
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "first-committed",
      status: "retry-complete",
    });
  });

  it("applies an atomic two-field update through executeTool(correct_transaction)", async () => {
    const id = await seedEntity("transaction");
    const { snapshot, observation_count } = (await client.retrieveEntitySnapshot({
      entity_id: id,
    })) as { snapshot: Record<string, unknown>; observation_count: number };

    await client.executeTool("correct_transaction", {
      idempotency_key: `${runKey}-transaction`,
      entities: [
        {
          entity_id: id,
          entity_type: TYPE,
          expected_observation_count: observation_count,
          expected_snapshot: { note: snapshot.note, status: snapshot.status },
          changes: [
            { field: "note", value: "transaction-updated" },
            { field: "status", value: "transaction-updated" },
          ],
        },
      ],
    });

    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "transaction-updated",
      status: "transaction-updated",
    });
  });
});
