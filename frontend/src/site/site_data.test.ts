import { describe, expect, it } from "vitest";
import { FUNCTIONALITY_MATRIX, SITE_CODE_SNIPPETS, SITE_SECTIONS } from "./site_data";

describe("site_data", () => {
  it("defines sidebar sections in expected order", () => {
    expect(SITE_SECTIONS.map((section) => section.id)).toEqual([
      "install",
      "terminology",
      "agent-instructions",
      "functionality",
      "configure-mcp",
      "cli",
      "learn-more",
    ]);
  });

  it("includes representative CLI and MCP coverage rows", () => {
    expect(FUNCTIONALITY_MATRIX.length).toBeGreaterThan(10);
    expect(FUNCTIONALITY_MATRIX.some((row) => row.mcp.includes("store"))).toBe(true);
    expect(FUNCTIONALITY_MATRIX.some((row) => row.cli.includes("entities list"))).toBe(true);
  });

  it("keeps critical code snippets available for rendering", () => {
    expect(SITE_CODE_SNIPPETS.installCommands).toContain("npm install -g neotoma");
    expect(SITE_CODE_SNIPPETS.stdioConfigJson).toContain("\"mcpServers\"");
    expect(SITE_CODE_SNIPPETS.cliUploadExample).toContain("neotoma upload");
  });
});
