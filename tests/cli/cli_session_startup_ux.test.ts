import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildApiBoxLines,
  buildGetStartedBoxLines,
  buildInstallationBoxLines,
  buildIntroBoxContent,
  buildStatusBlockOutput,
  getPathCompletionCandidates,
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

  it("shows full data directory path above prompt in status output", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      {
        prod: {
          total_entities: 10,
          total_relationships: 5,
          total_sources: 3,
          total_events: 2,
          total_observations: 12,
          total_interpretations: 1,
        },
        dev: {
          total_entities: 4,
          total_relationships: 2,
          total_sources: 1,
          total_events: 0,
          total_observations: 5,
          total_interpretations: 0,
        },
        dataDir: "/tmp/neotoma-data",
      },
      "dev"
    );

    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        dataPath: "/tmp/neotoma-data",
      },
      100
    );

    expect(output).toContain("Data: /tmp/neotoma-data");
    expect(intro.lines.join("\n")).not.toContain("data dir:");
  });

  it("does not render configuration box by default in status output", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      ["Production data: unavailable", "Development data: unavailable"],
      "prod"
    );
    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        apiLines: ["Production API: http://127.0.0.1:3180 (2 ms)"],
        watchLines: ["1  1m ago  entity  add  ent_abc  Updated invoice"],
        watchEventCount: 1,
        installationLines: ["Config", "MCP User", "MCP Project", "CLI Instructions"],
      },
      100
    );

    expect(output).toContain(" APIs ");
    expect(output).not.toContain(" Configuration ");
  });

  it("renders get started box after APIs when provided", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      ["Production data: unavailable", "Development data: unavailable"],
      "prod"
    );
    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        apiLines: ["No running Neotoma HTTP APIs detected (ports 3080, 3180)."],
        installationLines: ["Project env configured  ✅"],
        getStartedLines: buildGetStartedBoxLines(),
      },
      100
    );

    expect(output).toContain(" APIs ");
    expect(output).toContain(" Get started ");
    expect(output.indexOf(" APIs ")).toBeLessThan(output.indexOf(" Get started "));
  });

  it("renders configuration box when explicitly requested", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      ["Production data: unavailable", "Development data: unavailable"],
      "prod"
    );
    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        apiLines: ["Production API: http://127.0.0.1:3180 (2 ms)"],
        installationLines: ["Project env configured  ✅"],
        showConfiguration: true,
      },
      100
    );

    expect(output).toContain(" Configuration ");
  });

  it("does not render APIs box when apiLines are not provided", () => {
    const intro = buildIntroBoxContent(
      "1.2.3",
      ["Production data: unavailable", "Development data: unavailable"],
      "prod"
    );
    const { output } = buildStatusBlockOutput(
      {
        introContent: intro,
        installationLines: ["Project env configured  ✅"],
        showConfiguration: true,
      },
      100
    );

    expect(output).not.toContain(" APIs ");
  });

  it("formats API lines with environment labels", () => {
    const lines = buildApiBoxLines([
      {
        port: 3180,
        url: "http://127.0.0.1:3180",
        envHint: "prod",
        source: "default",
        healthy: true,
        latencyMs: 3,
      },
      {
        port: 3080,
        url: "http://127.0.0.1:3080",
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

    expect(lines.join("\n")).not.toContain(
      "Warning: Cursor config found, Neotoma MCP is not installed."
    );
  });

  it("shows user env status in installation box", () => {
    const lines = buildInstallationBoxLines(
      [],
      {
        appliedProject: { cursor: false, claude: false, codex: false },
        appliedUser: { cursor: false, claude: false, codex: false },
      },
      {
        envTarget: "user",
        envFileExists: true,
        envFilePath: "/Users/example/.config/neotoma/.env",
        dataDirExists: true,
        dataDir: "/Users/example/neotoma/data",
      },
      null
    );

    const output = lines.join("\n");
    expect(output).toContain("User env configured  ✅");
    expect(output).toContain(".env file       ✅  /Users/example/.config/neotoma/.env");
  });

  it("shows project env status in installation box", () => {
    const lines = buildInstallationBoxLines(
      [],
      {
        appliedProject: { cursor: false, claude: false, codex: false },
        appliedUser: { cursor: false, claude: false, codex: false },
      },
      {
        envTarget: "project",
        envFileExists: true,
        envFilePath: "/repo/.env",
        dataDirExists: false,
        dataDir: "/repo/data",
      },
      "/repo"
    );

    const output = lines.join("\n");
    expect(output).toContain("Project env configured  ✅");
    expect(output).toContain("Data directory  ❌  /repo/data");
  });

  it("marks user MCP configured when only user-level MCP exists", () => {
    const lines = buildInstallationBoxLines(
      [{ path: "/Users/example/.cursor/mcp.json", hasDev: false, hasProd: true }],
      {
        appliedProject: { cursor: false, claude: false, codex: false },
        appliedUser: { cursor: false, claude: false, codex: false },
      },
      {
        envTarget: "user",
        envFileExists: true,
        envFilePath: "/Users/example/.config/neotoma/.env",
        dataDirExists: true,
        dataDir: "/Users/example/neotoma/data",
      },
      null
    );

    const output = lines.join("\n");
    expect(output).toMatch(/Cursor\s+✅\s+❌/);
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

  it("completes path candidates and adds directory suffixes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-path-complete-"));
    await fs.mkdir(path.join(tempRoot, "alpha"));
    await fs.writeFile(path.join(tempRoot, "app.json"), "{}");

    const matches = getPathCompletionCandidates("a", tempRoot);
    expect(matches).toContain("alpha/");
    expect(matches).toContain("app.json");
  });
});
