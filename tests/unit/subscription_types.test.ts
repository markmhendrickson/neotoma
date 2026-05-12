import { describe, expect, it } from "vitest";
import type { SubstrateEvent } from "../../src/events/types.js";
import { subscriptionMatchesEvent, parseSubscriptionSnapshot } from "../../src/services/subscriptions/subscription_types.js";

function baseEvent(overrides: Partial<SubstrateEvent>): SubstrateEvent {
  return {
    event_id: "ev-test",
    timestamp: "2026-01-01T00:00:00.000Z",
    action: "created",
    event_type: "entity.created",
    user_id: "user-1",
    entity_id: "ent-a",
    entity_type: "task",
    ...overrides,
  };
}

describe("subscriptionMatchesEvent", () => {
  it("returns false when no filters are set", () => {
    const sub = parseSubscriptionSnapshot("e1", "user-1", {
      subscription_id: "s1",
      delivery_method: "sse",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      consecutive_failures: 0,
      max_failures: 10,
    });
    expect(sub).not.toBeNull();
    expect(subscriptionMatchesEvent(sub!, baseEvent({}))).toBe(false);
  });

  it("matches entity_types when set", () => {
    const sub = parseSubscriptionSnapshot("e1", "user-1", {
      subscription_id: "s1",
      delivery_method: "webhook",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      watch_entity_types: ["task"],
      consecutive_failures: 0,
      max_failures: 10,
    });
    expect(subscriptionMatchesEvent(sub!, baseEvent({ entity_type: "task" }))).toBe(true);
    expect(subscriptionMatchesEvent(sub!, baseEvent({ entity_type: "contact" }))).toBe(false);
  });

  it("requires same user_id", () => {
    const sub = parseSubscriptionSnapshot("e1", "user-1", {
      subscription_id: "s1",
      delivery_method: "sse",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      watch_entity_types: ["task"],
      consecutive_failures: 0,
      max_failures: 10,
    });
    expect(subscriptionMatchesEvent(sub!, baseEvent({ user_id: "other" }))).toBe(false);
  });

  it("returns false when subscription inactive", () => {
    const sub = parseSubscriptionSnapshot("e1", "user-1", {
      subscription_id: "s1",
      delivery_method: "sse",
      active: false,
      created_at: "2026-01-01T00:00:00.000Z",
      watch_entity_types: ["task"],
      consecutive_failures: 0,
      max_failures: 10,
    });
    expect(subscriptionMatchesEvent(sub!, baseEvent({ entity_type: "task" }))).toBe(false);
  });
});
