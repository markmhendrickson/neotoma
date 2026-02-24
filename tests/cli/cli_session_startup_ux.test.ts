import { describe, expect, it } from "vitest";

import {
  buildApiBoxLines,
  buildInstallationBoxLines,
  buildIntroBoxContent,
  buildStatusBlockOutput,
  getPromptPlaceholder,
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
        installationLines: ["MCP status by config:", "CLI instructions status:"],
      },
      100
    );

    expect(output).toContain(" APIs ");
    expect(output).toContain(" Recent events ");
    expect(output).toContain(" Installation ");
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

  it("adds installation warnings when platform config exists but Neotoma is missing", () => {
    const lines = buildInstallationBoxLines(
      [{ path: "/tmp/.cursor/mcp.json", hasDev: false, hasProd: false }],
      {
        appliedProject: { cursor: false, claude: false, codex: false },
        appliedUser: { cursor: false, claude: false, codex: false },
      }
    );

    expect(lines.join("\n")).toContain("Warning: Cursor config found, Neotoma MCP is not installed.");
    expect(lines.join("\n")).toContain(
      "Warning: Cursor is installed, Neotoma CLI instructions are missing."
    );
  });

  it("shows prompt placeholder only when input is empty", () => {
    expect(getPromptPlaceholder("")).toBe("/ for commands");
    expect(getPromptPlaceholder("entities list")).toBe("");
  });
});
