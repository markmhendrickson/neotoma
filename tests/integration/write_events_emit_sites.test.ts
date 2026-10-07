/**
 * Effect test: write paths outside the main store core leave a write event
 * (docs/subsystems/write_events.md, "Coverage").
 *
 * These four paths insert an observation without going through the MCP store
 * core or `createCorrection`, and before this change emitted no substrate
 * event at all, so they left no durable write record:
 *
 *   - REST `POST /observations/create`;
 *   - the asset record (`file_asset` …) a file store creates;
 *   - schema field promotion (`update_schema_incremental` with
 *     `migrate_existing`);
 *   - schema-lag repair (`repairEntityType`).
 *
 * Each case drives the real path against the real database and reads the
 * durable log back. Each was confirmed red with its emit call removed.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import { handleSubstrateEventForSubscriptions } from "../../src/services/subscriptions/subscription_bridge.js";
import {
  listWriteEvents,
  type WriteEventRecord,
} from "../../src/services/write_events/write_event_query.js";

const USER_ID = "00000000-0000-0000-0000-000000000000";
const RUN = `wes-${Date.now()}-${randomUUID().slice(0, 6)}`;

function parse(result: { content: Array<{ type: string; text: string }> }): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.type === "text")?.text ?? "{}");
}

async function waitForEntityWrites(
  entityId: string,
  predicate: (rows: WriteEventRecord[]) => boolean
): Promise<WriteEventRecord[]> {
  let rows: WriteEventRecord[] = [];
  for (let i = 0; i < 60; i++) {
    rows = (await listWriteEvents({ userId: USER_ID, entityId, entityLevelOnly: false }))
      .write_events;
    if (predicate(rows)) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

describe("write events: paths outside the store core", () => {
  let server: NeotomaServer;
  let httpServer: Server;
  let apiPort = 0;
  const entityTypes: string[] = [];
  const persist = (ev: SubstrateEvent): void => {
    void handleSubstrateEventForSubscriptions(ev);
  };

  beforeAll(async () => {
    substrateEventBus.onSubstrateEvent(persist);
    server = new NeotomaServer();
    await server.executeToolForCli("get_authenticated_user", {}, USER_ID);
    const { app } = await import("../../src/actions.js");
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    apiPort = (httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    substrateEventBus.off("substrate_event", persist);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const t of entityTypes) {
      await db.from("schema_registry").delete().eq("entity_type", t);
      await db.from("raw_fragments").delete().eq("entity_type", t);
    }
  });

  it("REST POST /observations/create records created, then updated with changed fields", async () => {
    const entityType = `wes_rest_${Date.now()}`;
    entityTypes.push(entityType);
    await schemaRegistry.register({
      entity_type: entityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          detail: { type: "string", required: false },
        },
        canonical_name_fields: ["name"],
      },
      reducer_config: { merge_policies: {} },
      activate: true,
    });
    const name = `${RUN} rest obs`;
    const post = async (fields: Record<string, unknown>) => {
      const res = await fetch(`http://127.0.0.1:${apiPort}/observations/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-neotoma-turn-key": `${RUN}:rest`,
        },
        body: JSON.stringify({
          entity_type: entityType,
          entity_identifier: name,
          fields,
          user_id: USER_ID,
        }),
      });
      expect(res.status, await res.clone().text()).toBe(200);
      return (await res.json()) as { entity_id: string; observation_id: string };
    };
    const first = await post({ name });
    const second = await post({ name, detail: "two" });
    expect(second.entity_id).toBe(first.entity_id);

    const rows = await waitForEntityWrites(first.entity_id, (r) =>
      r.some((w) => w.operation === "updated")
    );
    const created = rows.find((w) => w.operation === "created");
    const updated = rows.find((w) => w.operation === "updated");
    expect(created?.observation_id).toBe(first.observation_id);
    expect(created?.turn_key).toBe(`${RUN}:rest`);
    expect(updated?.observation_id).toBe(second.observation_id);
    expect(updated?.fields_changed).toEqual(["detail"]);
    expect(rows.filter((w) => w.operation === "stored")).toHaveLength(2);
  });

  it("a file store records its asset entity as created", async () => {
    const stored = parse(
      await (
        server as unknown as {
          store: (a: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).store({
        user_id: USER_ID,
        file_content: Buffer.from(`${RUN} asset bytes`).toString("base64"),
        mime_type: "text/plain",
        original_filename: `${RUN}.txt`,
        idempotency_key: `${RUN}-asset`,
      })
    );
    const assetId = stored.asset_entity_id as string;
    expect(assetId).toBeTruthy();

    const rows = await waitForEntityWrites(assetId, (r) =>
      r.some((w) => w.operation === "created")
    );
    const created = rows.find((w) => w.operation === "created");
    expect(created).toBeDefined();
    expect(created!.entity_type).toBe(stored.asset_entity_type);
  });

  it("schema field promotion records an update naming the promoted field", async () => {
    const entityType = `wes_promote_${Date.now()}`;
    entityTypes.push(entityType);
    await schemaRegistry.register({
      entity_type: entityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: { name: { type: "string", required: true } },
        canonical_name_fields: ["name"],
      },
      reducer_config: { merge_policies: {} },
      activate: true,
    });
    const stored = parse(
      await server.executeToolForCli(
        "store",
        {
          idempotency_key: `${RUN}-promote`,
          entities: [{ entity_type: entityType, name: `${RUN} promote`, promoted_note: "x" }],
        },
        USER_ID
      )
    );
    const entityId = stored.entities[0].entity_id as string;

    const result = parse(
      await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: entityType,
          fields_to_add: [{ field_name: "promoted_note", field_type: "string" }],
          migrate_existing: true,
          user_id: USER_ID,
        },
        USER_ID
      )
    );
    expect(result.migrated_existing, JSON.stringify(result)).toBe(true);

    const rows = await waitForEntityWrites(entityId, (r) =>
      r.some((w) => w.operation === "updated" && w.fields_changed?.includes("promoted_note"))
    );
    expect(
      rows.some((w) => w.operation === "updated" && w.fields_changed?.includes("promoted_note"))
    ).toBe(true);
  });

  it("schema-lag repair records an update naming the repaired field", async () => {
    const entityType = `wes_lag_${Date.now()}`;
    entityTypes.push(entityType);
    await schemaRegistry.register({
      entity_type: entityType,
      schema_version: "1.0.0",
      schema_definition: {
        fields: { name: { type: "string", required: true } },
        canonical_name_fields: ["name"],
      },
      reducer_config: { merge_policies: {} },
      activate: true,
    });
    const stored = parse(
      await server.executeToolForCli(
        "store",
        {
          idempotency_key: `${RUN}-lag`,
          entities: [{ entity_type: entityType, name: `${RUN} lag`, lagged_note: "y" }],
        },
        USER_ID
      )
    );
    const entityId = stored.entities[0].entity_id as string;
    // Declare the field WITHOUT migrating, leaving the fragment behind: the lag.
    parse(
      await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: entityType,
          fields_to_add: [{ field_name: "lagged_note", field_type: "string" }],
          migrate_existing: false,
          user_id: USER_ID,
        },
        USER_ID
      )
    );

    const { repairEntityType } = await import("../../src/services/schema_lag_repair.js");
    const outcome = await repairEntityType(entityType, null, `run-${RUN}`, ["lagged_note"]);
    expect(outcome.inserted, JSON.stringify(outcome)).toBeGreaterThan(0);

    const rows = await waitForEntityWrites(entityId, (r) =>
      r.some((w) => w.operation === "updated" && w.fields_changed?.includes("lagged_note"))
    );
    expect(
      rows.some((w) => w.operation === "updated" && w.fields_changed?.includes("lagged_note"))
    ).toBe(true);
  });
});
