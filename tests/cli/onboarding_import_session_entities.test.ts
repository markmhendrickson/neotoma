import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTranscriptImport } from "../../src/cli/onboarding_transcript_import.js";

// The import path posts raw files to /store. Session identity (cwd, native
// session id, content hash) must ride along, or a stored transcript cannot be
// located or re-materialized on another machine.
function fakeHomeWithClaudeSession(cwd: string): string {
  const home = mkdtempSync(path.join(tmpdir(), "import-home-"));
  const proj = path.join(home, ".claude", "projects", "-Users-x-repo");
  mkdirSync(proj, { recursive: true });

  const base = { cwd, gitBranch: "main", version: "2.1.204" };
  writeFileSync(
    path.join(proj, "aaaabbbb-cccc-dddd-eeee-ffff00001111.jsonl"),
    [
      {
        ...base,
        type: "user",
        timestamp: "2026-08-02T09:00:00Z",
        message: { role: "user", content: "hello" },
      },
      {
        ...base,
        type: "assistant",
        timestamp: "2026-08-02T09:00:01Z",
        message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n")
  );
  return home;
}

function captureApi() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    api: {
      POST: async (_route: string, opts: { body: Record<string, unknown> }) => {
        calls.push(opts.body);
        return { error: undefined };
      },
    },
  };
}

const ORIGINAL_HOME = process.env.HOME;

describe("runTranscriptImport — session identity attachment", () => {
  let home: string;

  beforeEach(() => {
    home = fakeHomeWithClaudeSession("/Users/x/repo");
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
  });

  it("attaches agent_session and session_transcript to the store call", async () => {
    const { api, calls } = captureApi();

    const result = await runTranscriptImport({ api: api as never, dryRun: false });

    expect(result.files_stored).toBe(1);
    expect(calls).toHaveLength(1);

    const entities = calls[0].entities as Array<Record<string, unknown>>;
    expect(entities).toBeDefined();

    const session = entities.find((e) => e.entity_type === "agent_session");
    expect(session).toMatchObject({
      harness: "claude-code",
      cwd: "/Users/x/repo",
      branch: "main",
    });

    const transcript = entities.find((e) => e.entity_type === "session_transcript");
    expect(transcript!.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(transcript!.agent_session_id).toBe(session!.native_session_id);
  });

  it("still stores the raw file path as the durable artifact", async () => {
    const { api, calls } = captureApi();
    await runTranscriptImport({ api: api as never, dryRun: false });

    expect(calls[0].file_path).toContain(".claude/projects");
    expect(calls[0].observation_source).toBe("import");
  });

  it("sends no entities in dry-run mode", async () => {
    const { api, calls } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: true });

    expect(result.files_found).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });
});
