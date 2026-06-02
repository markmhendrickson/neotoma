/**
 * Unit tests for resumeRingAfter (#1464 Tier 1: gap detection).
 *
 * The SSE event stream already supports Last-Event-ID resume against an
 * in-memory ring. The gap this covers: when a requested cursor is no longer in
 * the ring (evicted past the cap, or lost to a restart), resuming silently from
 * the buffer head looks like a clean continuation but is not. resumeRingAfter
 * flags that case so a consumer can reconcile instead of trusting a
 * discontinuous slice.
 */

import { describe, it, expect } from "vitest";
import {
  pushSubstrateEventToRing,
  resumeRingAfter,
} from "../../src/services/subscriptions/sse_hub.js";
import type { SubstrateEvent } from "../../src/events/types.js";

function makeEvent(entityId: string): SubstrateEvent {
  return {
    event_id: `evt_${entityId}`,
    event_type: "entity.created",
    timestamp: "2026-01-01T00:00:00.000Z",
    user_id: "00000000-0000-0000-0000-000000000000",
    entity_id: entityId,
    entity_type: "thing",
    action: "created",
  };
}

const all = () => true;

describe("resumeRingAfter (#1464 gap detection)", () => {
  it("fresh subscriber (no cursor) is not a gap", () => {
    pushSubstrateEventToRing(makeEvent("a"));
    const result = resumeRingAfter(undefined, all);
    expect(result.gap_detected).toBe(false);
    expect(result.latest_ring_id).not.toBeNull();
  });

  it("a cursor still in the ring resumes after it with no gap", () => {
    const id1 = pushSubstrateEventToRing(makeEvent("b1"));
    pushSubstrateEventToRing(makeEvent("b2"));

    const result = resumeRingAfter(id1, all);
    expect(result.gap_detected).toBe(false);
    // Entries returned are strictly after id1, so id1 itself is excluded.
    expect(result.entries.every((e) => e.id !== id1)).toBe(true);
    // The just-pushed b2 (and anything later) should be present.
    expect(result.entries.some((e) => e.event.entity_id === "b2")).toBe(true);
  });

  it("a cursor no longer in the ring flags a gap and resumes from the head", () => {
    pushSubstrateEventToRing(makeEvent("c1"));
    const latest = pushSubstrateEventToRing(makeEvent("c2"));

    // An id that was never in the ring stands in for an evicted / pre-restart
    // cursor.
    const result = resumeRingAfter("999999999999", all);
    expect(result.gap_detected).toBe(true);
    // Still returns the current buffer (resume from head) so the client gets
    // forward progress, just flagged.
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.latest_ring_id).toBe(latest);
  });
});
