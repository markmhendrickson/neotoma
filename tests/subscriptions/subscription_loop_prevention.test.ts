import { describe, expect, it } from "vitest";

import type { SubstrateEvent } from "../../src/events/types.js";
import { parseSubscriptionSnapshot, subscriptionMatchesEvent } from "../../src/services/subscriptions/subscription_types.js";

describe("subscription loop prevention (sync_peer_id)", () => {
  const baseSub = parseSubscriptionSnapshot("ent_sub", "user-1", {
    subscription_id: "s1",
    watch_entity_types: ["issue"],
    watch_event_types: ["entity.updated"],
    delivery_method: "webhook",
    webhook_url: "https://peer.example/hook",
    webhook_secret: "sec",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    consecutive_failures: 0,
    max_failures: 10,
    sync_peer_id: "peer-alpha",
  });

  it("skips when event.source_peer_id matches subscription.sync_peer_id", () => {
    expect(baseSub).not.toBeNull();
    const ev: SubstrateEvent = {
      event_id: "e1",
      event_type: "entity.updated",
      timestamp: "2026-01-02T00:00:00.000Z",
      user_id: "user-1",
      entity_id: "ent_x",
      entity_type: "issue",
      action: "updated",
      source_peer_id: "peer-alpha",
    };
    expect(subscriptionMatchesEvent(baseSub!, ev)).toBe(false);
  });

  it("matches when source_peer_id differs", () => {
    expect(baseSub).not.toBeNull();
    const ev: SubstrateEvent = {
      event_id: "e2",
      event_type: "entity.updated",
      timestamp: "2026-01-02T00:00:00.000Z",
      user_id: "user-1",
      entity_id: "ent_y",
      entity_type: "issue",
      action: "updated",
      source_peer_id: "peer-beta",
    };
    expect(subscriptionMatchesEvent(baseSub!, ev)).toBe(true);
  });
});
