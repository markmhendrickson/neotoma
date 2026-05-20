/**
 * Regression test for issue #207:
 * list_timeline_events returns a generic error instead of an empty result set
 * when called with an unknown event_type (e.g. event_type: "workout").
 *
 * Expected: { events: [], total: 0 }
 * Before fix: generic tool execution error
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";

describe("issue 207 — list_timeline_events with unknown event_type", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000207";

  beforeAll(() => {
    server = new NeotomaServer();
    // Set authenticated user directly — avoids needing a real MCP initialize handshake.
    (server as any).authenticatedUserId = testUserId;
  });

  it("returns empty events array (not an error) for a nonexistent event_type", async () => {
    // Calling list_timeline_events with an event_type that has no stored events
    // must return {events: [], total: 0} rather than throwing or returning an
    // error envelope.
    const result = await (server as any).listTimelineEvents({
      event_type: "workout",
    });

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("events");
    expect(parsed).toHaveProperty("total");
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events).toHaveLength(0);
    expect(parsed.total).toBe(0);
  });

  it("returns empty events array for another nonexistent event_type variant", async () => {
    const result = await (server as any).listTimelineEvents({
      event_type: "nonexistent_event_type_xyz_12345",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.events).toHaveLength(0);
    expect(parsed.total).toBe(0);
  });

  it("executeTool dispatch also returns empty results for unknown event_type (regression: issue #207)", async () => {
    // Exercise the full executeTool → listTimelineEvents path used by the MCP
    // CallToolRequestSchema handler so any regression in the dispatch layer is caught.
    const result = await server.executeToolForCli(
      "list_timeline_events",
      { event_type: "workout" },
      testUserId,
    );

    expect(result).toHaveProperty("content");
    const parsed = JSON.parse(result.content[0].text);
    // Must not be an error object
    expect(parsed).not.toHaveProperty("error");
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events).toHaveLength(0);
    expect(parsed.total).toBe(0);
  });
});
