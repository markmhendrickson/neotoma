import { describe, it, expect } from "vitest";

describe("CLI command coverage guard", () => {
  it("requires behavioral coverage or explicit help-only classification for every session command", async () => {
    const { getSessionCommandNames } = await import("../../src/cli/index.ts");
    const commandNames = getSessionCommandNames();

    // Commands with behavioral coverage in tests/cli.
    const coveredBehavioral = new Set([
      "api",
      "access",
      "auth",
      "backup",
      "cli",
      "cli-instructions",
      "corrections",
      "dev",
      "status", // formerly `doctor`; `doctor` retained as a deprecated alias
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
      "peers",
      "preferences",
      "processes",
      "recent",
      "relationships",
      "schemas",
      "servers",
      "setup",
      // `skills sync`: package-skill mirror reconciler covered by
      // tests/cli/skills_mirror.test.ts; the `--include-instance-skills` /
      // `--include-instance-scripts` / `--approve-scripts` (and its
      // deprecated `--approve` alias) action-closure behavior
      // (implies-boolean flag coercion, hash-mismatch/rejected-filename exit
      // codes, blocked-vs-failed severity split, --json `instance` report
      // key) covered by tests/cli/skills_sync_instance_cli.test.ts.
      "skills",
      "snapshots",
      "sources",
      "stats",
      "storage",
      "store",
      "store-turn",
      "timeline",
      "discover",
      "ingest-transcript",
      "issues",
      "plans",
      "preflight",
      "reporter", // neotoma reporter setup covered by tests/cli/reporter_setup.test.ts
      "upload",
      "db", // subcommands covered by db_migrate_encryption.test.ts (migrate-encryption) and db_repair_schema_lag.test.ts (repair-schema-lag)
      "onboarding", // subcommands covered by onboarding_import_transcripts.test.ts (import-transcripts)
      "bundles", // list/info/install/enable/disable behavior covered by tests/unit/bundles_activation.test.ts + manage_bundles_tool.test.ts
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
      "compat", // remote version probe; exercised by API compatibility tests and manual release checks
    ]);

    const uncovered = commandNames.filter(
      (name) => !coveredBehavioral.has(name) && !helpOnlyWithRationale.has(name)
    );

    expect(uncovered).toEqual([]);
  });
});
