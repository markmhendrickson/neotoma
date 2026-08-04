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

/**
 * Mock that ENFORCES the server's /store contract instead of rubber-stamping.
 *
 * The previous mock returned `{ error: undefined }` unconditionally, so it
 * asserted request *shape* but never *acceptance* — and hid a real defect: a
 * body carrying `entities` without `idempotency_key` is rejected 400
 * ("idempotency_key is required when entities are provided", actions.ts), which
 * meant every real `--apply` import failed while the tests stayed green.
 */
function captureApi() {
  const calls: Array<Record<string, unknown>> = [];
  const seenIdempotencyKeys = new Set<string>();
  return {
    calls,
    seenIdempotencyKeys,
    api: {
      POST: async (_route: string, opts: { body: Record<string, unknown> }) => {
        const body = opts.body;
        calls.push(body);

        const hasEntities = Array.isArray(body.entities) && body.entities.length > 0;
        if (hasEntities && !body.idempotency_key) {
          return {
            error: { message: "idempotency_key is required when entities are provided" },
          };
        }
        if (typeof body.idempotency_key === "string") {
          seenIdempotencyKeys.add(body.idempotency_key);
        }
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

  it("does not attach conversation or conversation_message rows (server owns those)", async () => {
    const { api, calls } = captureApi();
    await runTranscriptImport({ api: api as never, dryRun: false });

    const entities = calls[0].entities as Array<Record<string, unknown>>;
    const types = entities.map((e) => e.entity_type);
    expect(types).toEqual(expect.arrayContaining(["agent_session", "session_transcript"]));
    expect(types).not.toContain("conversation");
    expect(types).not.toContain("conversation_message");
  });

  it("reports degraded imports on session_identity_degraded instead of failing silently", async () => {
    const broken = mkdtempSync(path.join(tmpdir(), "import-degraded-"));
    const proj = path.join(broken, ".claude", "projects", "-broken");
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(proj, "deadbeef-dead-beef-dead-beefdeadbeef.jsonl"), "NOT JSON\n{{{");
    process.env.HOME = broken;

    const { api } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: false });

    expect(result.files_stored).toBe(1);
    expect(result.session_identity_degraded).toHaveLength(1);
    expect(result.session_identity_degraded[0].file).toContain(".claude/projects");
    expect(result.session_identity_degraded[0].reason).toBeTruthy();
    // A corrupt transcript is actionable: re-running after a parser fix helps.
    expect(result.session_identity_degraded[0].kind).toBe("unexpected");
  });

  it("marks a non-harness export as expected degradation, not a bug to chase", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "import-chatgpt-"));
    const proj = path.join(home, ".claude", "projects", "-x");
    mkdirSync(proj, { recursive: true });
    // A claude-code-shaped path whose content parses but yields no harness
    // session: role/content present, but not a resumable harness transcript.
    writeFileSync(
      path.join(proj, "11111111-2222-3333-4444-555555555555.jsonl"),
      JSON.stringify({ type: "summary", summary: "no messages here" })
    );
    process.env.HOME = home;

    const { api } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: false });

    expect(result.files_stored).toBe(1);
    expect(result.session_identity_degraded).toHaveLength(1);
    // Reason must not guess — no trailing question mark.
    expect(result.session_identity_degraded[0].reason).not.toContain("?");
  });

  it("reports no degradation when session identity is derived", async () => {
    const { api } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: false });
    expect(result.session_identity_degraded).toHaveLength(0);
  });

  it("sends idempotency_key whenever entities are attached (server rejects otherwise)", async () => {
    const { api, calls } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: false });

    expect(result.files_stored).toBe(1);
    expect(result.errors).toHaveLength(0);
    const withEntities = calls.filter((c) => Array.isArray(c.entities) && c.entities.length > 0);
    expect(withEntities.length).toBeGreaterThan(0);
    for (const c of withEntities) {
      expect(typeof c.idempotency_key).toBe("string");
      expect(c.idempotency_key as string).toMatch(/^transcript-import-[0-9a-f]{64}$/);
    }
  });

  it("re-importing identical content reuses the same idempotency_key (dedupe effect)", async () => {
    const first = captureApi();
    await runTranscriptImport({ api: first.api as never, dryRun: false });
    const second = captureApi();
    await runTranscriptImport({ api: second.api as never, dryRun: false });

    expect(second.seenIdempotencyKeys.size).toBe(first.seenIdempotencyKeys.size);
    expect([...second.seenIdempotencyKeys]).toEqual([...first.seenIdempotencyKeys]);
  });

  it("still stores the raw file when parse yields no session entities", async () => {
    const broken = mkdtempSync(path.join(tmpdir(), "import-broken-"));
    const proj = path.join(broken, ".claude", "projects", "-broken");
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(proj, "deadbeef-dead-beef-dead-beefdeadbeef.jsonl"), "NOT JSON\n{{{");
    process.env.HOME = broken;

    const { api, calls } = captureApi();
    const result = await runTranscriptImport({ api: api as never, dryRun: false });

    expect(result.files_stored).toBe(1);
    expect(calls[0].file_path).toContain(".claude/projects");
    expect(calls[0].entities).toBeUndefined();
  });
});
