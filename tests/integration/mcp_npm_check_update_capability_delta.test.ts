/**
 * Integration-style tests for the npm_check_update MCP handler's
 * include_capability_delta branch.
 *
 * Tests the closest available seam: the private npmCheckUpdate() method on
 * NeotomaServer, matching the pattern used in
 * tests/integration/mcp_npm_check_update.test.ts.
 *
 * Coverage:
 * - include_capability_delta: true → new_tools, removed_tools, and
 *   capability_delta_recommendation appear in the response.
 * - include_capability_delta omitted (default false) → those fields are ABSENT.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";

describe("MCP npm_check_update — include_capability_delta", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  it("includes new_tools, removed_tools, and capability_delta_recommendation when flag is true", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "0.0.1",
      distTag: "latest",
      include_capability_delta: true,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    const text = result.content[0].text;
    const data = JSON.parse(text);

    // Core response fields must still be present
    expect(typeof data.updateAvailable).toBe("boolean");
    expect(typeof data.message).toBe("string");

    // Capability delta fields must be present
    expect(Array.isArray(data.new_tools)).toBe(true);
    expect(Array.isArray(data.removed_tools)).toBe(true);
    expect(typeof data.capability_delta_recommendation).toBe("string");
    expect(data.capability_delta_recommendation.length).toBeGreaterThan(0);

    // capability_delta_note is allowed but only when degradation occurred
    if (Object.prototype.hasOwnProperty.call(data, "capability_delta_note")) {
      expect(typeof data.capability_delta_note).toBe("string");
    }
  });

  it("omits new_tools, removed_tools, and capability_delta_recommendation when flag is not set", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "0.0.1",
      distTag: "latest",
      // include_capability_delta intentionally omitted (defaults to false)
    });

    expect(result).toBeDefined();
    const text = result.content[0].text;
    const data = JSON.parse(text);

    // Core response must still be present
    expect(typeof data.updateAvailable).toBe("boolean");

    // Capability delta fields must be ABSENT when the flag is not set
    expect(Object.prototype.hasOwnProperty.call(data, "new_tools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "removed_tools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "capability_delta_recommendation")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "capability_delta_note")).toBe(false);
  });

  it("omits capability delta fields when include_capability_delta is explicitly false", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "0.0.1",
      distTag: "latest",
      include_capability_delta: false,
    });

    const data = JSON.parse(result.content[0].text);
    expect(Object.prototype.hasOwnProperty.call(data, "new_tools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "removed_tools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "capability_delta_recommendation")).toBe(false);
  });
});
