/**
 * Smoke test for MCP tool npm_check_update (plan: npm package update UX).
 * Verifies response shape and behavior when registry is reachable or unreachable.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";

describe("MCP npm_check_update tool", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  it("returns structured response with updateAvailable, latestVersion, message, suggestedCommand", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "0.0.1",
      distTag: "latest",
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    const text = result.content[0].text;
    const data = JSON.parse(text);

    expect(typeof data.updateAvailable).toBe("boolean");
    expect(data.latestVersion === null || typeof data.latestVersion === "string").toBe(true);
    expect(typeof data.message).toBe("string");
    expect(data.suggestedCommand === null || typeof data.suggestedCommand === "string").toBe(true);
    expect(data.packageName).toBe("neotoma");
    expect(data.currentVersion).toBe("0.0.1");
    expect(data.distTag).toBe("latest");

    if (data.updateAvailable) {
      expect(data.latestVersion).toBeTruthy();
      expect(data.suggestedCommand).toContain("neotoma");
    }
  });

  it("returns updateAvailable false when current is >= latest (or registry unreachable)", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "999.999.999",
      distTag: "latest",
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.updateAvailable).toBe(false);
    expect(typeof data.message).toBe("string");
  });
});
