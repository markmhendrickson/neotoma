import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NeotomaClient } from "../../packages/client/src/client.js";
import { MultiFieldCorrectionError } from "../../packages/client/src/correction.js";
import { snapshotOnUpdate } from "../../packages/client/src/helpers.js";
import { LocalTransport, type LocalOperations } from "../../packages/client/src/local.js";
import { app } from "../../src/actions.js";
import { createOperations } from "../../src/core/operations.js";
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

  // The server marks a replay with `replayed: true` and returns the original
  // observation; entity_version reflects the entity's current version.
  function expectReplayOfSameEffect(first: unknown, second: unknown): void {
    const a = first as Record<string, unknown>;
    const b = second as Record<string, unknown>;
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.observation_id).toBe(a.observation_id);
    expect(b.field).toBe(a.field);
    expect(b.value).toBe(a.value);
  }

  function countingClient(): { client: NeotomaClient; correctCalls: () => number } {
    let calls = 0;
    const counting = new NeotomaClient({
      transport: "http",
      baseUrl,
      fetch: (input, init) => {
        if (String(input).endsWith("/correct")) calls += 1;
        const headers = new Headers(init?.headers);
        headers.delete("Authorization");
        return fetch(input, { ...init, headers });
      },
    });
    return { client: counting, correctCalls: () => calls };
  }

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
    expect(helperResult.correctionResult).toBeDefined();
    const afterHelper = (await client.retrieveEntitySnapshot({
      entity_id: entityId,
    })) as { snapshot?: Record<string, unknown> };
    expect(afterHelper.snapshot).toMatchObject({
      status: "canonical-updated",
      note: "helper-updated",
    });
  });

  it("persists a single-entry deprecated map using the caller's key unchanged", async () => {
    const id = await seedEntity("map-single");

    await client.correct({
      entity_id: id,
      entity_type: TYPE,
      corrections: { status: "map-updated" },
      idempotency_key: `${runKey}-map-single`,
    });

    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "seeded",
      status: "map-updated",
    });
  });

  it("replays the same key over HTTP as one effect with the same result", async () => {
    const id = await seedEntity("replay");
    const key = `${runKey}-replay`;
    const request = {
      entity_id: id,
      entity_type: TYPE,
      field: "status",
      value: "replayed",
      idempotency_key: key,
    };

    const first = await client.correct(request);
    await client.correct({
      entity_id: id,
      entity_type: TYPE,
      field: "status",
      value: "later-writer",
      idempotency_key: `${key}-later`,
    });
    const second = await client.correct(request);

    expectReplayOfSameEffect(first, second);
    // The replay did not write a second observation over the later writer.
    expect((await readEntity(id)).snapshot.status).toBe("later-writer");
  });

  it("refuses a multi-field deprecated map over HTTP with no request and nothing persisted", async () => {
    const id = await seedEntity("refuse-map");
    const { client: counting, correctCalls } = countingClient();

    await expect(
      counting.correct({
        entity_id: id,
        entity_type: TYPE,
        corrections: { status: "refused", note: "refused" },
        idempotency_key: `${runKey}-refuse-map`,
      })
    ).rejects.toBeInstanceOf(MultiFieldCorrectionError);
    await counting.dispose();

    expect(correctCalls()).toBe(0);
    expect((await readEntity(id)).snapshot).toMatchObject({ note: "seeded", status: "seeded" });
  });

  it("refuses a multi-field snapshotOnUpdate over HTTP with no write and nothing persisted", async () => {
    const id = await seedEntity("refuse-helper");
    const { client: counting, correctCalls } = countingClient();

    await expect(
      snapshotOnUpdate(counting, {
        entityId: id,
        entityType: TYPE,
        corrections: { status: "refused", note: "refused" },
        idempotencyKey: `${runKey}-refuse-helper`,
      })
    ).rejects.toBeInstanceOf(MultiFieldCorrectionError);
    await counting.dispose();

    expect(correctCalls()).toBe(0);
    expect((await readEntity(id)).snapshot).toMatchObject({ note: "seeded", status: "seeded" });
  });

  it("forwards expected_version unchanged: current version applies, stale version is refused", async () => {
    const id = await seedEntity("version");
    const before = await readEntity(id);

    await snapshotOnUpdate(client, {
      entityId: id,
      entityType: TYPE,
      corrections: { status: "version-current" },
      idempotencyKey: `${runKey}-version-current`,
      expectedVersion: before.entity_version,
    });
    expect((await readEntity(id)).snapshot.status).toBe("version-current");

    await expect(
      client.correct({
        entity_id: id,
        entity_type: TYPE,
        field: "note",
        value: "version-stale",
        idempotency_key: `${runKey}-version-stale`,
        expected_version: before.entity_version,
      })
    ).rejects.toBeDefined();
    expect((await readEntity(id)).snapshot).toMatchObject({
      note: "seeded",
      status: "version-current",
    });
  });

  describe("local transport", () => {
    function localTransport(
      spy?: ReturnType<typeof vi.fn>
    ): { transport: LocalTransport; calls: () => number } {
      const operations = createOperations({ userId: LOCAL_DEV_USER_ID });
      const wrapped = {
        ...operations,
        correct: (input: Parameters<LocalOperations["correct"]>[0]) => {
          spy?.(input);
          return operations.correct(input);
        },
      } as unknown as LocalOperations;
      return {
        transport: new LocalTransport({ userId: LOCAL_DEV_USER_ID, operations: wrapped }),
        calls: () => spy?.mock.calls.length ?? 0,
      };
    }

    it("persists a canonical correction and a single-field snapshotOnUpdate", async () => {
      const id = await seedEntity("local-effect");
      const { transport } = localTransport();

      await transport.correct({
        entity_id: id,
        entity_type: TYPE,
        field: "status",
        value: "local-canonical",
        idempotency_key: `${runKey}-local-canonical`,
      });
      expect((await readEntity(id)).snapshot.status).toBe("local-canonical");

      const result = await snapshotOnUpdate(transport, {
        entityId: id,
        entityType: TYPE,
        corrections: { note: "local-helper" },
        idempotencyKey: `${runKey}-local-helper`,
      });
      expect(result.applied).toBe(true);
      expect((await readEntity(id)).snapshot).toMatchObject({
        status: "local-canonical",
        note: "local-helper",
      });
    });

    it("replays the same key as one effect with the same result", async () => {
      const id = await seedEntity("local-replay");
      const { transport } = localTransport();
      const key = `${runKey}-local-replay`;
      const request = {
        entity_id: id,
        entity_type: TYPE,
        field: "status",
        value: "local-replayed",
        idempotency_key: key,
      };

      const first = await transport.correct(request);
      await transport.correct({
        entity_id: id,
        entity_type: TYPE,
        field: "status",
        value: "local-later",
        idempotency_key: `${key}-later`,
      });
      const second = await transport.correct(request);

      expectReplayOfSameEffect(first, second);
      expect((await readEntity(id)).snapshot.status).toBe("local-later");
    });

    it("refuses multi-field input with no operation call and nothing persisted", async () => {
      const id = await seedEntity("local-refuse");
      const spy = vi.fn();
      const { transport, calls } = localTransport(spy);

      await expect(
        transport.correct({
          entity_id: id,
          entity_type: TYPE,
          corrections: { status: "refused", note: "refused" },
          idempotency_key: `${runKey}-local-refuse-map`,
        })
      ).rejects.toBeInstanceOf(MultiFieldCorrectionError);
      await expect(
        snapshotOnUpdate(transport, {
          entityId: id,
          entityType: TYPE,
          corrections: { status: "refused", note: "refused" },
          idempotencyKey: `${runKey}-local-refuse-helper`,
        })
      ).rejects.toBeInstanceOf(MultiFieldCorrectionError);

      expect(calls()).toBe(0);
      expect((await readEntity(id)).snapshot).toMatchObject({ note: "seeded", status: "seeded" });
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
