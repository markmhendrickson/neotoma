/**
 * sse_hub live-broadcast health: dead SSE clients must be evicted from the
 * fan-out set, not left to accumulate.
 *
 * Regression for the neotoma#1749 failure mode: on a long-running server,
 * daemon connections that drop without `req.on("close")` firing (e.g. an
 * `incomplete chunked read` disconnect) would linger in the clients array
 * forever. broadcastSubstrateEventToSse now prunes any client whose socket is
 * ended/destroyed or whose write throws, so live delivery stays healthy across
 * the server's lifetime rather than only after a restart.
 */

import { describe, expect, it } from "vitest";

import {
  broadcastSubstrateEventToSse,
  registerSseClient,
  type SseClient,
} from "../../src/services/subscriptions/sse_hub.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import type { SubscriptionRecord } from "../../src/services/subscriptions/subscription_types.js";

const USER = "00000000-0000-0000-0000-000000000000";

function issueSub(subscription_id: string): SubscriptionRecord {
  return {
    subscription_id,
    user_id: USER,
    watch_entity_types: ["issue"],
    watch_entity_ids: [],
    watch_event_types: [],
    delivery_method: "sse",
    active: true,
  } as unknown as SubscriptionRecord;
}

function issueEvent(): SubstrateEvent {
  return {
    event_id: "evt",
    event_type: "observation.created",
    timestamp: new Date(0).toISOString(),
    user_id: USER,
    entity_id: "ent_issue",
    entity_type: "issue",
    action: "created",
  } as unknown as SubstrateEvent;
}

/** Minimal fake of the bits of express Response that the hub touches. */
function fakeRes(opts: { ended?: boolean; throwOnWrite?: boolean } = {}) {
  const writes: string[] = [];
  return {
    writableEnded: opts.ended ?? false,
    destroyed: false,
    writes,
    write(chunk: string) {
      if (opts.throwOnWrite) throw new Error("socket destroyed");
      writes.push(chunk);
      return true;
    },
  };
}

function client(sub: SubscriptionRecord, res: ReturnType<typeof fakeRes>): SseClient {
  return { userId: USER, subscription: sub, res: res as never, lastEventId: undefined };
}

describe("broadcastSubstrateEventToSse dead-client eviction", () => {
  it("delivers to a live client and leaves it registered", () => {
    const res = fakeRes();
    const unregister = registerSseClient(client(issueSub("live-1"), res));
    try {
      broadcastSubstrateEventToSse(issueEvent(), "1");
      broadcastSubstrateEventToSse(issueEvent(), "2");
      // A healthy client receives both broadcasts (3 writes each: id/event/data).
      expect(res.writes.length).toBe(6);
    } finally {
      unregister();
    }
  });

  it("evicts a client whose socket has ended (no write attempted)", () => {
    const res = fakeRes({ ended: true });
    registerSseClient(client(issueSub("ended-1"), res));
    broadcastSubstrateEventToSse(issueEvent(), "1");
    // Ended socket: skipped and evicted, never written to.
    expect(res.writes.length).toBe(0);
    // Second broadcast must not find it (already evicted) — still zero.
    broadcastSubstrateEventToSse(issueEvent(), "2");
    expect(res.writes.length).toBe(0);
  });

  it("evicts a client whose write throws, sparing the rest", () => {
    const bad = fakeRes({ throwOnWrite: true });
    const good = fakeRes();
    registerSseClient(client(issueSub("bad-1"), bad));
    const unregisterGood = registerSseClient(client(issueSub("good-1"), good));
    try {
      broadcastSubstrateEventToSse(issueEvent(), "1");
      // Good client still delivered despite the bad client throwing.
      expect(good.writes.length).toBe(3);
      // Second pass: bad client already evicted, good client keeps working.
      broadcastSubstrateEventToSse(issueEvent(), "2");
      expect(good.writes.length).toBe(6);
    } finally {
      unregisterGood();
    }
  });
});
