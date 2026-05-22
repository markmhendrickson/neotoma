import { describe, expect, it, vi } from "vitest";

import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import type { SubstrateEvent } from "../../src/events/types.js";

describe("substrateEventBus", () => {
  it("assigns identical event_id when the same payload is emitted twice", () => {
    const partial: Omit<SubstrateEvent, "event_id"> = {
      event_type: "observation.created",
      timestamp: "2026-05-07T12:00:00.000Z",
      user_id: "u1",
      entity_id: "ent_a",
      entity_type: "note",
      observation_id: "obs_b",
      action: "created",
    };
    const ids: string[] = [];
    const fn = (ev: SubstrateEvent) => {
      ids.push(ev.event_id);
    };
    substrateEventBus.onSubstrateEvent(fn);
    substrateEventBus.emitSubstrateEvent(partial);
    substrateEventBus.emitSubstrateEvent(partial);
    substrateEventBus.off("substrate_event", fn);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toMatch(/^[a-f0-9]{40}$/);
  });

  it("does not propagate listener errors", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    substrateEventBus.onSubstrateEvent(bad);
    substrateEventBus.onSubstrateEvent(good);
    substrateEventBus.emitSubstrateEvent({
      event_type: "entity.updated",
      timestamp: "2026-05-07T12:00:01.000Z",
      user_id: "u1",
      entity_id: "ent_x",
      entity_type: "task",
      action: "updated",
    });
    substrateEventBus.off("substrate_event", bad);
    substrateEventBus.off("substrate_event", good);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
