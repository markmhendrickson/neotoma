/**
 * Webhook and peer-sync delivery never carry the server-side write context
 * (docs/subsystems/write_events.md, "Privacy").
 *
 * The write context (actor ids, client-reported turn) is persisted in the
 * durable log only. This drives one event that carries a full write context
 * through the real subscription bridge with two matching subscriptions:
 *
 *   - a webhook subscription, delivered by the real webhook code to a local
 *     HTTP receiver, so the assertion is on the bytes a webhook consumer gets;
 *   - a peer-sync subscription, whose hand-off is captured at
 *     `queuePeerSyncDelivery` (the peer payload itself carries only ids, but
 *     the event handed to the outbound sync path must be the stripped one).
 *
 * It also checks the durable row DID keep the context, so the test cannot
 * pass by the context never having existed.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SubstrateEvent } from "../../src/events/types.js";
import type { SubscriptionRecord } from "../../src/services/subscriptions/subscription_types.js";

const USER = "00000000-0000-0000-0000-000000000000";
const TURN = `strip-${Date.now()}:t1`;

const subs = vi.hoisted(() => ({ list: [] as unknown[] }));
const peerHandOffs = vi.hoisted(() => ({ events: [] as unknown[] }));

vi.mock("../../src/services/subscriptions/subscription_index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/subscriptions/subscription_index.js")>();
  return {
    ...actual,
    listAllSubscriptions: () => subs.list,
    refreshSubscriptionInIndex: async () => {},
  };
});

vi.mock("../../src/services/sync/sync_webhook_outbound.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/sync/sync_webhook_outbound.js")>();
  return {
    ...actual,
    queuePeerSyncDelivery: (_sub: unknown, event: unknown) => {
      peerHandOffs.events.push(event);
    },
  };
});

import { handleSubstrateEventForSubscriptions } from "../../src/services/subscriptions/subscription_bridge.js";
import { getDb } from "../../src/repositories/db/connection.js";

describe("write context is stripped from webhook and peer-sync delivery", () => {
  let receiver: Server;
  const received: string[] = [];
  let url = "";

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(body);
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", () => resolve()));
    url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;

    const base: SubscriptionRecord = {
      entity_id: "ent_sub_strip",
      user_id: USER,
      subscription_id: "sub_strip_webhook",
      watch_entity_types: ["note"],
      delivery_method: "webhook",
      webhook_url: url,
      webhook_secret: "test-secret-not-real",
      active: true,
      consecutive_failures: 0,
      max_failures: 10,
    };
    subs.list = [
      base,
      {
        ...base,
        entity_id: "ent_sub_strip_peer",
        subscription_id: "sub_strip_peer",
        sync_peer_id: "peer-x",
      },
    ];
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  it("delivers the event without write_context, while the durable log keeps it", async () => {
    const entityId = `ent_strip_${Date.now()}`;
    const event: SubstrateEvent = {
      event_id: `evt_${entityId}`,
      event_type: "entity.created",
      timestamp: new Date().toISOString(),
      user_id: USER,
      entity_id: entityId,
      entity_type: "note",
      action: "created",
      write_context: {
        operation: "created",
        actor: { client_name: "strip-client", authenticated_actor_id: "mbr_strip" },
        conversation_id: "conv-strip",
        turn_key: TURN,
        turn_source: "mcp_meta",
      },
    };

    await handleSubstrateEventForSubscriptions(event);

    for (let i = 0; i < 100 && received.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }

    // Webhook: the consumer's bytes.
    expect(received).toHaveLength(1);
    const delivered = received[0];
    expect(delivered).toContain(entityId);
    expect(delivered).not.toContain("write_context");
    expect(delivered).not.toContain(TURN);
    expect(delivered).not.toContain("mbr_strip");
    expect(delivered).not.toContain("strip-client");

    // Peer sync: the event handed to the outbound path.
    expect(peerHandOffs.events).toHaveLength(1);
    const handedOff = peerHandOffs.events[0] as SubstrateEvent;
    expect(handedOff.entity_id).toBe(entityId);
    expect(handedOff.write_context).toBeUndefined();

    // The durable row kept it: the stripping is at delivery, not at persist.
    const row = (await (await getDb())
      .prepare("SELECT payload FROM substrate_events WHERE entity_id = ? ORDER BY seq DESC LIMIT 1")
      .get(entityId)) as { payload: string } | undefined;
    expect(row?.payload).toContain(TURN);
  });
});
