import { describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";

describe("MCP resource URI parsing", () => {
  it("parses the MCP Apps timeline widget URI", () => {
    const server = new NeotomaServer();
    const parsed = (server as any).parseResourceUri("ui://neotoma/timeline_widget");

    expect(parsed.type).toBe("ui_timeline_widget");
  });

  it("rejects malformed UI resource URIs", () => {
    const server = new NeotomaServer();

    expect(() => (server as any).parseResourceUri("ui://other/timeline_widget")).toThrow();
  });
});
