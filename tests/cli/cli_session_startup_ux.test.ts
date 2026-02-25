import { describe, expect, it } from "vitest";

import {
  buildApiBoxLines,
  buildInstallationBoxLines,
  buildIntroBoxContent,
  buildStatusBlockOutput,
  getPromptPlaceholder,
  getSlashSuggestionCursorUpLines,
  getWatchEventCount,
  parseWatchRowSelection,
} from "../../src/cli/index.ts";

describe("CLI session startup UX", () => {
  it("builds intro with production and development summary lines", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      [
        "Production data: 59 entities, 10 relationships, 2 sources, 5 timeline events",
        "Development data: 2 entities, 1 relationships, 1 sources, 0 timeline events",
      ],
      "dev"
    );

    const combined = intro.lines.join("\n");
    expect(combined).toContain("Production data: 59 entities");
    expect(combined).toContain("Development data: 2 entities");
  });

  it("renders APIs, recent events, and installation boxes in status output", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      ["Production data: unavailable", "Development data: unavailable"],
      "prod"
    );
    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        apiLines: ["Production API: http://127.0.0.1:8180 (2 ms)"],
        watchLines: ["1  1m ago  entity  add  ent_abc  Updated invoice"],
        watchEventCount: 1,
        installationLines: ["Config", "MCP User", "MCP Project", "CLI Instructions"],
      },
      100
    );

    expect(output).toContain(" APIs ");
    expect(output).toContain(" Recent events ");
    expect(output).toContain(" Initialization ");
  });

  it("formats API lines with environment labels", () => {
    const lines = buildApiBoxLines([
      {
        port: 8180,
        url: "http://127.0.0.1:8180",
        envHint: "prod",
        source: "default",
        healthy: true,
        latencyMs: 3,
      },
      {
        port: 8080,
        url: "http://127.0.0.1:8080",
        envHint: "dev",
        source: "default",
        healthy: true,
        latencyMs: 5,
      },
    ]);

    expect(lines[0]).toContain("Production API:");
    expect(lines[1]).toContain("Development API:");
  });

  it("does not show cursor MCP warning when cursor config exists", () => {
    const lines = buildInstallationBoxLines(
      [{ path: "/tmp/.cursor/mcp.json", hasDev: false, hasProd: false }],
      {
        appliedProject: { cursor: false, claude: false, codex: false },
        appliedUser: { cursor: false, claude: false, codex: false },
      }
    );

    expect(lines.join("\n")).not.toContain("Warning: Cursor config found, Neotoma MCP is not installed.");
  });

  it("shows prompt placeholder only when input is empty", () => {
    expect(getPromptPlaceholder("")).toBe("/ for commands");
    expect(getPromptPlaceholder("entities list")).toBe("");
  });

  it("moves cursor up one extra line after slash suggestions render", () => {
    expect(getSlashSuggestionCursorUpLines(0)).toBe(1);
    expect(getSlashSuggestionCursorUpLines(1)).toBe(2);
    expect(getSlashSuggestionCursorUpLines(5)).toBe(6);
  });

  it("parses watch row selections from numeric and slash inputs", () => {
    expect(parseWatchRowSelection("9")).toBe(9);
    expect(parseWatchRowSelection("/9")).toBe(9);
    expect(parseWatchRowSelection("/ list 9")).toBe(9);
    expect(parseWatchRowSelection("/list 9")).toBe(9);
    expect(parseWatchRowSelection("/list")).toBe(0);
    expect(parseWatchRowSelection("list 9")).toBe(0);
  });

  it("returns watch event count only when events exist", () => {
    expect(getWatchEventCount([])).toBeUndefined();
    expect(getWatchEventCount([1, 2, 3])).toBe(3);
  });
});
