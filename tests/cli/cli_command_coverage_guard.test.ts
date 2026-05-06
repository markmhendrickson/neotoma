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
      "cli",
      "cli-instructions",
      "corrections",
      "dev",
      "doctor",
      "edit",
      "entities",
      "init",
      "instructions",
      "interpretations",
      "ingest",
      "logs",
      "mcp",
      "memory-export",
      "mirror",
      "observations",
      "options",
      "preferences",
      "processes",
      "recent",
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
      "feedback", // thin preference setter; behavior is covered in feedback activation/service tests
      "triage", // thin dispatcher over ingest/admin flows covered by feedback pipeline tests
      "list-recent-changes", // read-only reporting command; behavior is covered by recent/activity integration tests
      "agents", // namespace dispatcher; subcommands (e.g. `agents grants import`) are covered by their own integration tests
      "inspector", // UI launcher namespace; behavior is covered by inspector/server integration flows
    ]);

    const uncovered = commandNames.filter(
      (name) => !coveredBehavioral.has(name) && !helpOnlyWithRationale.has(name)
    );

    expect(uncovered).toEqual([]);
  });
});
