/**
 * Effect test: every write leaves a server-side record carrying its operation,
 * actor and conversation turn (write events; turn keys #2440).
 *
 * Drives real write paths — the MCP `tools/call` handler (with turn identity
 * in `_meta`), `createCorrection`, and the HTTP `/store` route (with turn
 * identity in headers) — against the real SQLite database, then reads the
 * durable log back through `listWriteEvents`. No mocks: the assertion is on
 * the persisted record, not on a code path being invoked.
 *
 * Also pins the privacy boundary: the write context is persisted, but the
 * copies delivered to subscribers (the SSE ring and durable resume) carry none
 * of it.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import { handleSubstrateEventForSubscriptions } from "../../src/services/subscriptions/subscription_bridge.js";
import { getEventsAfterSeq } from "../../src/services/subscriptions/event_log.js";
import { getRingEntriesAfter } from "../../src/services/subscriptions/sse_hub.js";
import { createCorrection } from "../../src/services/correction.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import {
  MCP_META_CONVERSATION_ID,
  MCP_META_TURN_KEY,
} from "../../src/services/write_events/turn_identity.js";
import {
  listWriteEvents,
  type WriteEventRecord,
} from "../../src/services/write_events/write_event_query.js";

const USER_ID = "00000000-0000-0000-0000-000000000000";
const RUN = `we-${Date.now()}-${randomUUID().slice(0, 6)}`;
const CONVERSATION = `conv-${RUN}`;
const TURN_MCP = `${RUN}:t1`;
const TURN_CORRECT = `${RUN}:t2`;
const TURN_HTTP = `${RUN}:t3`;

type Handler = (req: unknown, extra: unknown) => Promise<unknown>;

function toolsCallHandler(server: NeotomaServer): Handler {
  const handlers = (
    server as unknown as { mcpServer: { server: { _requestHandlers: Map<string, Handler> } } }
  ).mcpServer.server._requestHandlers;
  const handler = handlers.get("tools/call");
  if (!handler) throw new Error("tools/call handler not registered");
  return handler;
}

const extra = {
  requestId: "write-events-test",
  signal: new AbortController().signal,
  sendNotification: async () => {},
  sendRequest: async () => ({}),
};

async function callTool(
  server: NeotomaServer,
  name: string,
  args: Record<string, unknown>,
  meta?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = (await toolsCallHandler(server)(
    { method: "tools/call", params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } },
    extra
  )) as { content: Array<{ text: string }> };
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

/** Persistence runs off the bus asynchronously; poll the durable log. */
async function waitForWrites(
  filter: Parameters<typeof listWriteEvents>[0],
  predicate: (rows: WriteEventRecord[]) => boolean
): Promise<WriteEventRecord[]> {
  let rows: WriteEventRecord[] = [];
  for (let i = 0; i < 50; i++) {
    rows = (await listWriteEvents(filter)).write_events;
    if (predicate(rows)) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

describe("write events: server-side record of every write", () => {
  let server: NeotomaServer;
  let httpServer: Server;
  let apiPort = 0;
  const entityIds: string[] = [];
  const persist = (ev: SubstrateEvent): void => {
    void handleSubstrateEventForSubscriptions(ev);
  };

  beforeAll(async () => {
    substrateEventBus.onSubstrateEvent(persist);
    server = new NeotomaServer();
    // Authenticate the instance as the local test user (same path the CLI uses).
    await server.executeToolForCli("get_authenticated_user", {}, USER_ID);
    server.setSessionAgentIdentity({
      verified: true,
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: `tp-${RUN}`,
      algorithm: "ES256",
      sub: `agent:${RUN}`,
      iss: "https://agent.example",
    } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0]);

    const { app } = await import("../../src/actions.js");
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      // Ephemeral port: fixed ports collide with other suites in a parallel run.
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    apiPort = (httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    substrateEventBus.off("substrate_event", persist);
    server.setSessionAgentIdentity(null);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const id of entityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("MCP tools/call: create, relationship create/delete, delete and restore carry operation, actor and _meta turn", async () => {
    const meta = { [MCP_META_TURN_KEY]: TURN_MCP, [MCP_META_CONVERSATION_ID]: CONVERSATION };
    const stored = await callTool(
      server,
      "store",
      {
        entities: [
          { entity_type: "note", title: `${RUN} a` },
          { entity_type: "note", title: `${RUN} b` },
        ],
        idempotency_key: `${RUN}-store`,
      },
      meta
    );
    const [a, b] = (stored.entities as Array<{ entity_id: string }>).map((e) => e.entity_id);
    entityIds.push(a, b);

    const rel = { relationship_type: "REFERS_TO", source_entity_id: a, target_entity_id: b };
    await callTool(server, "create_relationship", rel, meta);
    await callTool(server, "delete_relationship", rel, meta);
    await callTool(server, "delete_entity", { entity_id: b, entity_type: "note" }, meta);
    await callTool(server, "restore_entity", { entity_id: b, entity_type: "note" }, meta);

    const expected = [
      "created",
      "relationship_created",
      "relationship_deleted",
      "deleted",
      "restored",
    ];
    const rows = await waitForWrites({ userId: USER_ID, turnKey: TURN_MCP }, (r) =>
      expected.every((op) => r.some((w) => w.operation === op))
    );
    const ops = new Set(rows.map((w) => w.operation));
    for (const op of expected) expect(ops, `missing ${op}`).toContain(op);

    const createdA = rows.find((w) => w.operation === "created" && w.entity_id === a);
    expect(createdA).toBeDefined();
    expect(createdA!.entity_type).toBe("note");
    expect(createdA!.turn_key).toBe(TURN_MCP);
    expect(createdA!.conversation_id).toBe(CONVERSATION);
    expect(createdA!.turn_source).toBe("mcp_meta");
    expect(createdA!.actor.agent_sub).toBe(`agent:${RUN}`);
    expect(createdA!.actor.agent_thumbprint).toBe(`tp-${RUN}`);

    const relCreated = rows.find((w) => w.operation === "relationship_created")!;
    expect(relCreated.relationship_type).toBe("REFERS_TO");
    expect(relCreated.source_entity_id).toBe(a);
    expect(relCreated.target_entity_id).toBe(b);

    // Every row is the same turn: nothing outside it leaked into the filter.
    expect(rows.every((w) => w.turn_key === TURN_MCP)).toBe(true);
  });

  it("a correction is recorded as `corrected`, not as a generic update", async () => {
    const base = await callTool(server, "store", {
      entities: [{ entity_type: "note", title: `${RUN} to correct` }],
      idempotency_key: `${RUN}-corr-base`,
    });
    const entityId = (base.entities as Array<{ entity_id: string }>)[0].entity_id;
    entityIds.push(entityId);

    await runWithRequestContext(
      {
        agentIdentity: createAgentIdentity({ clientName: "write-events-corrector" }),
        turn: { turn_key: TURN_CORRECT, source: "header" },
      },
      () =>
        createCorrection({
          entity_id: entityId,
          entity_type: "note",
          field: "title",
          value: `${RUN} corrected`,
          schema_version: "1.0",
          user_id: USER_ID,
          idempotency_key: `${RUN}-corr`,
        })
    );

    const rows = await waitForWrites({ userId: USER_ID, turnKey: TURN_CORRECT }, (r) =>
      r.some((w) => w.operation === "corrected")
    );
    const corrected = rows.find((w) => w.operation === "corrected" && w.entity_id === entityId);
    expect(corrected).toBeDefined();
    expect(corrected!.fields_changed).toEqual(["title"]);
    expect(corrected!.actor.client_name).toBe("write-events-corrector");
    expect(rows.some((w) => w.operation === "updated")).toBe(false);
  });

  it("HTTP /store: turn identity from X-Neotoma-* headers lands on the record", async () => {
    const res = await fetch(`http://127.0.0.1:${apiPort}/store`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-name": "write-events-http",
        "x-neotoma-turn-key": TURN_HTTP,
        "x-neotoma-conversation-id": CONVERSATION,
      },
      body: JSON.stringify({
        entities: [{ entity_type: "note", title: `${RUN} via http` }],
        idempotency_key: `${RUN}-http`,
        user_id: USER_ID,
      }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { entities: Array<{ entity_id: string }> };
    const entityId = body.entities[0].entity_id;
    entityIds.push(entityId);

    const rows = await waitForWrites({ userId: USER_ID, turnKey: TURN_HTTP }, (r) =>
      r.some((w) => w.entity_id === entityId)
    );
    const created = rows.find((w) => w.entity_id === entityId);
    expect(created).toBeDefined();
    expect(created!.operation).toBe("created");
    expect(created!.turn_source).toBe("header");
    expect(created!.conversation_id).toBe(CONVERSATION);
    expect(created!.actor.client_name).toBe("write-events-http");
  });

  it("filters by conversation, and a write sent without turn identity matches no turn", async () => {
    const byConversation = await listWriteEvents({ userId: USER_ID, conversationId: CONVERSATION });
    const turns = new Set(byConversation.write_events.map((w) => w.turn_key));
    expect(turns).toContain(TURN_MCP);
    expect(turns).toContain(TURN_HTTP);

    const stored = await callTool(server, "store", {
      entities: [{ entity_type: "note", title: `${RUN} no turn` }],
      idempotency_key: `${RUN}-noturn`,
    });
    const entityId = (stored.entities as Array<{ entity_id: string }>)[0].entity_id;
    entityIds.push(entityId);
    const rows = await waitForWrites({ userId: USER_ID, entityId }, (r) => r.length > 0);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((w) => w.turn_key === undefined)).toBe(true);
    expect(rows[0].actor.agent_sub).toBe(`agent:${RUN}`);
  });

  it("subscribers never receive the write context: ring and durable resume are stripped", async () => {
    const turnRows = await listWriteEvents({ userId: USER_ID, turnKey: TURN_MCP });
    expect(turnRows.count).toBeGreaterThan(0);
    const entityIdsInTurn = new Set(turnRows.write_events.map((w) => w.entity_id));

    const ringCopies = getRingEntriesAfter(undefined, (ev) => entityIdsInTurn.has(ev.entity_id));
    expect(ringCopies.length).toBeGreaterThan(0);
    for (const entry of ringCopies) expect(entry.event.write_context).toBeUndefined();

    const resumed = await getEventsAfterSeq(USER_ID, 0, 100000, {
      entityIds: [...entityIdsInTurn],
    });
    expect(resumed.length).toBeGreaterThan(0);
    for (const d of resumed) {
      expect(d.event.write_context).toBeUndefined();
      expect(JSON.stringify(d.event)).not.toContain(TURN_MCP);
    }
  });
});
