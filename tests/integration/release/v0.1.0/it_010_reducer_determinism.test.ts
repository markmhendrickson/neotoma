/**
 * IT-010: Reducer Determinism Validation
 *
 * Goal: Verify that reducers are deterministic (same observations + merge rules → same snapshot).
 */

import { describe, it, expect } from "vitest";
import { reduceRecordCreated } from "../../../../src/reducers/record_reducer.js";
import type { StateEvent } from "../../../../src/events/event_schema.js";

describe("IT-010: Reducer Determinism Validation", () => {
  it("should produce same snapshot for same events", () => {
    // Step 1: Create events
    const event1: StateEvent = {
      id: "evt-1",
      event_type: "RecordCreated",
      payload: {
        type: "invoice",
        properties: { invoice_number: "INV-001", amount: 1000 },
      },
      timestamp: "2024-01-15T00:00:00Z",
      record_id: "rec-1",
      reducer_version: "1.0",
      created_at: "2024-01-15T00:00:00Z",
    };

    // Step 2: Apply reducer multiple times
    const snapshot1 = reduceRecordCreated(event1);
    const snapshot2 = reduceRecordCreated(event1);
    const snapshot3 = reduceRecordCreated(event1);

    // Step 3: Verify all snapshots are identical
    expect(snapshot1).toEqual(snapshot2);
    expect(snapshot2).toEqual(snapshot3);
    expect(snapshot1.type).toBe("invoice");
    expect(snapshot1.properties.invoice_number).toBe("INV-001");
  });
});
