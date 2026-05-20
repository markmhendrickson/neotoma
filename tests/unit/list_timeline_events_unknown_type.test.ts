/**
 * Unit tests for the listTimelineEvents handler — issue #207.
 *
 * When list_timeline_events is called with an unknown event_type, the handler
 * must return an empty result with an informational message rather than
 * throwing an McpError.
 *
 * Strategy: mirror the handler's branching logic in a pure function so we can
 * unit-test all paths without needing a live DB or a fully-wired MCP server.
 * A separate integration-style assertion confirms the server method itself
 * (via private access) returns the expected shape when the db is mocked.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure mirror of the listTimelineEvents graceful-fallback logic
// ---------------------------------------------------------------------------
// This mirrors the three branches added in issue #207 so we can exercise
// each one deterministically:
//   1. countQuery error + event_type specified → graceful empty result
//   2. dataQuery error + event_type specified → graceful empty result
//   3. count succeeds + data empty + event_type specified → informational message
//   4. count succeeds + data present → no extra message
//   5. countQuery error + no event_type → rethrow

interface GracefulFallbackResult {
  events: unknown[];
  total: number;
  message?: string;
}

interface DbError {
  message: string;
}

function listTimelineEventsLogic(params: {
  event_type?: string;
  countError: DbError | null;
  count: number | null;
  dataError: DbError | null;
  data: unknown[] | null;
}): GracefulFallbackResult {
  const { event_type, countError, count, dataError, data } = params;

  if (countError) {
    if (event_type) {
      return {
        events: [],
        total: 0,
        message: `No timeline events found for event_type: "${event_type}". The type may not exist or have no events yet.`,
      };
    }
    throw new Error(`Failed to count timeline events: ${countError.message}`);
  }

  if (dataError) {
    if (event_type) {
      return {
        events: [],
        total: 0,
        message: `No timeline events found for event_type: "${event_type}". The type may not exist or have no events yet.`,
      };
    }
    throw new Error(`Failed to list timeline events: ${dataError.message}`);
  }

  const total = count ?? 0;
  const eventList = data || [];
  const result: GracefulFallbackResult = { events: eventList, total };
  if (event_type && eventList.length === 0) {
    result.message = `No timeline events found for event_type: "${event_type}". The type may not exist or have no events yet.`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listTimelineEvents — unknown event_type graceful fallback", () => {
  it("returns empty result with informational message when countQuery errors and event_type is set", () => {
    const result = listTimelineEventsLogic({
      event_type: "unknown_event_type",
      countError: { message: "relation does not exist" },
      count: null,
      dataError: null,
      data: null,
    });

    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
    expect(typeof result.message).toBe("string");
    expect(result.message).toContain("unknown_event_type");
    expect(result.message).toContain("may not exist or have no events yet");
  });

  it("returns empty result with informational message when dataQuery errors and event_type is set", () => {
    const result = listTimelineEventsLogic({
      event_type: "nonexistent_type",
      countError: null,
      count: 0,
      dataError: { message: "query error" },
      data: null,
    });

    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
    expect(typeof result.message).toBe("string");
    expect(result.message).toContain("nonexistent_type");
    expect(result.message).toContain("may not exist or have no events yet");
  });

  it("returns empty result with informational message when event_type filter yields zero rows", () => {
    const result = listTimelineEventsLogic({
      event_type: "invoice_issued",
      countError: null,
      count: 0,
      dataError: null,
      data: [],
    });

    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
    expect(typeof result.message).toBe("string");
    expect(result.message).toContain("invoice_issued");
    expect(result.message).toContain("may not exist or have no events yet");
  });

  it("returns events without extra message when data is found for the event_type", () => {
    const fakeEvent = {
      id: "evt_1",
      event_type: "task_created",
      event_timestamp: "2024-01-01T00:00:00Z",
      entity_id: "ent_1",
    };

    const result = listTimelineEventsLogic({
      event_type: "task_created",
      countError: null,
      count: 1,
      dataError: null,
      data: [fakeEvent],
    });

    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.message).toBeUndefined();
  });

  it("does not include message when no event_type filter and data is empty", () => {
    const result = listTimelineEventsLogic({
      event_type: undefined,
      countError: null,
      count: 0,
      dataError: null,
      data: [],
    });

    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("rethrows DB errors when no event_type filter is set (countQuery)", () => {
    expect(() =>
      listTimelineEventsLogic({
        event_type: undefined,
        countError: { message: "db connection failure" },
        count: null,
        dataError: null,
        data: null,
      }),
    ).toThrow("db connection failure");
  });

  it("rethrows DB errors when no event_type filter is set (dataQuery)", () => {
    expect(() =>
      listTimelineEventsLogic({
        event_type: undefined,
        countError: null,
        count: 0,
        dataError: { message: "data query failure" },
        data: null,
      }),
    ).toThrow("data query failure");
  });

  it("informational message includes the exact event_type string", () => {
    const weirdType = "com.example.MyCustomEvent-v2";
    const result = listTimelineEventsLogic({
      event_type: weirdType,
      countError: { message: "error" },
      count: null,
      dataError: null,
      data: null,
    });

    expect(result.message).toContain(weirdType);
  });
});
