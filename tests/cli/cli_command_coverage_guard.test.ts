import { describe, it, expect } from "vitest";

describe("CLI command coverage guard", () => {
  it("requires behavioral coverage or explicit help-only classification for every session command", async () => {
    const { getSessionCommandNames } = await import("../../src/cli/index.ts");
    const commandNames = getSessionCommandNames();

    // Commands with behavioral coverage in tests/cli.
    const coveredBehavioral = new Set([
      "api",
      "auth",
      "backup",
      "cli-instructions",
      "corrections",
      "dev",
      "doctor",
      "edit",
      "entities",
      "init",
      "interpretations",
      "logs",
      "mcp",
      "memory-export",
      "mirror",
      "observations",
      "options",
      "preferences",
      "relationships",
      "schemas",
      "servers",
      "setup",
      "snapshots",
      "sources",
      "stats",
      "storage",
      "store",
      "store-turn",
      "store-structured",
      "store-unstructured",
      "timeline",
      "discover",
      "ingest-transcript",
      "upload",
    ]);

    // Commands intentionally help-only due interactivity or generic dispatch.
    const helpOnlyWithRationale = new Set([
      "watch", // long-running interactive stream
      "request", // generic operation dispatcher with broad input surface
      "reset", // destructive; covered by infra / manual flows
      "site", // recently introduced; behavior is env-file mutation and currently validated manually
      "hooks", // harness lifecycle installer; per-harness paths covered by integration flows
    ]);

    const uncovered = commandNames.filter(
      (name) => !coveredBehavioral.has(name) && !helpOnlyWithRationale.has(name)
    );

    expect(uncovered).toEqual([]);
  });
});
