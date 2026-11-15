import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaClient } from "../../packages/client/src/client.js";
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
    client = new NeotomaClient({
      transport: "http",
      baseUrl: `http://127.0.0.1:${address.port}`,
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
});
