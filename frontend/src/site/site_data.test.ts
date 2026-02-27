import { describe, expect, it } from "vitest";
import {
  CLI_COMMANDS_TABLE,
  FUNCTIONALITY_MATRIX,
  LEARN_MORE_POSTS,
  MCP_ACTIONS_TABLE,
  SITE_CODE_SNIPPETS,
  SITE_SECTIONS,
} from "./site_data";

describe("site_data", () => {
  it("defines sidebar sections in expected order", () => {
    expect(SITE_SECTIONS.map((section) => section.id)).toEqual([
      "install",
      "get-started",
      "use-cases",
      "terminology",
      "agent-instructions",
      "functionality",
      "configure-mcp",
      "cli",
      "docker",
      "learn-more",
    ]);
  });

  it("includes representative CLI and MCP coverage rows", () => {
    expect(FUNCTIONALITY_MATRIX.length).toBeGreaterThan(10);
    expect(CLI_COMMANDS_TABLE.length).toBeGreaterThan(10);
    expect(CLI_COMMANDS_TABLE.some((row) => row.command.includes("entities list"))).toBe(true);
    expect(MCP_ACTIONS_TABLE.length).toBeGreaterThan(10);
    expect(MCP_ACTIONS_TABLE.some((row) => row.action === "store" || row.action === "store_structured")).toBe(true);
  });

  it("keeps critical code snippets available for rendering", () => {
    expect(SITE_CODE_SNIPPETS.installCommands).toContain("npm install -g neotoma");
    expect(SITE_CODE_SNIPPETS.stdioConfigJson).toContain("\"mcpServers\"");
    expect(SITE_CODE_SNIPPETS.cliUploadExample).toContain("neotoma upload");
  });

  it("keeps learn-more card ordering stable", () => {
    const relatedPostTitles = LEARN_MORE_POSTS.filter((item) => item.label === "Related post").map(
      (item) => item.title
    );
    expect(relatedPostTitles).toContain("Six agentic trends I'm betting on (and how I might be wrong)");
    expect(relatedPostTitles).toContain("Why agent memory needs more than RAG");
    expect(
      relatedPostTitles.indexOf("Six agentic trends I'm betting on (and how I might be wrong)")
    ).toBeLessThan(relatedPostTitles.indexOf("Why agent memory needs more than RAG"));
  });
});
