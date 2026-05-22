/**
 * Integration tests for `neotoma onboarding import-transcripts`.
 *
 * Validates user-observable behavior:
 * - runTranscriptImport returns the correct result shape
 * - dry-run (dryRun: true) never calls the store API
 * - harness filter narrows the set of files
 * - missing home directory reports gracefully
 * - result counts are consistent with input
 *
 * The tests import the module function directly rather than spawning the CLI,
 * consistent with db_repair_schema_lag.test.ts and schemas_repair_plural_types.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { runTranscriptImport } from "../../src/cli/onboarding_transcript_import.js";

/** Minimal stub for NeotomaApiClient: captures POST calls. */
function makeApiStub(postResult: { error?: unknown; data?: unknown } = {}) {
  const calls: Array<{ path: string; body: unknown }> = [];
  return {
    calls,
    api: {
      POST: async (path: string, opts: { body: unknown }) => {
        calls.push({ path, body: opts.body });
        return postResult;
      },
    } as any,
  };
}

describe("onboarding import-transcripts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("dry-run behavior", () => {
    it("returns the expected result shape (dry-run, no files)", async () => {
      // HOME is set but there are no transcript files at that location in CI.
      const { calls, api } = makeApiStub();
      const result = await runTranscriptImport({
        dryRun: true,
        api,
      });

      expect(typeof result.harnesses_scanned).toBe("number");
      expect(typeof result.files_found).toBe("number");
      expect(typeof result.files_stored).toBe("number");
      expect(typeof result.files_skipped).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);

      // Dry-run: no POST calls
      expect(calls).toHaveLength(0);
    });

    it("dry-run stores nothing (files_stored === 0)", async () => {
      const { calls, api } = makeApiStub();
      const result = await runTranscriptImport({
        dryRun: true,
        api,
      });
      expect(result.files_stored).toBe(0);
      expect(calls).toHaveLength(0);
    });

    it("harness filter reduces scanned harnesses to at most 1", async () => {
      const { api } = makeApiStub();
      const result = await runTranscriptImport({
        dryRun: true,
        harness: "codex",
        api,
      });
      // codex may or may not exist on this machine; harnesses_scanned is always <= 1
      expect(result.harnesses_scanned).toBeLessThanOrEqual(1);
    });
  });

  describe("missing home directory", () => {
    it("returns all-zero counts when HOME is absent", async () => {
      const origHome = process.env.HOME;
      const origUserProfile = process.env.USERPROFILE;
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      try {
        const { api } = makeApiStub();
        const result = await runTranscriptImport({ dryRun: true, api });
        expect(result.harnesses_scanned).toBe(0);
        expect(result.files_found).toBe(0);
        expect(result.files_stored).toBe(0);
        expect(result.errors).toHaveLength(0);
      } finally {
        if (origHome !== undefined) process.env.HOME = origHome;
        if (origUserProfile !== undefined) process.env.USERPROFILE = origUserProfile;
      }
    });
  });

  describe("result invariants", () => {
    it("files_found >= files_stored + files_skipped is always true", async () => {
      const { api } = makeApiStub();
      const result = await runTranscriptImport({ dryRun: true, api });
      // files_skipped counts both dry-run skips and error skips;
      // on dry-run: files_stored === 0 and files_skipped === files_found
      expect(result.files_stored + result.files_skipped).toBe(result.files_found);
    });

    it("errors.length never exceeds files_found", async () => {
      const { api } = makeApiStub();
      const result = await runTranscriptImport({ dryRun: true, api });
      expect(result.errors.length).toBeLessThanOrEqual(result.files_found);
    });
  });

  describe("apply mode (mock store returns success)", () => {
    it("files_stored matches files_found when store always succeeds", async () => {
      // Mock discoverHarnessTranscripts to return a known set of files
      const { calls, api } = makeApiStub({ data: { ok: true } });

      // Monkey-patch discoverHarnessTranscripts via module mocking
      vi.mock("../../src/cli/discovery.js", () => ({
        discoverHarnessTranscripts: async () => [
          {
            harness: "claude-code",
            paths: ["/fake/transcript_1.jsonl", "/fake/transcript_2.jsonl"],
            fileCount: 2,
            estimatedDateRange: null,
            sampleTitles: [],
          },
        ],
      }));

      const { runTranscriptImport: run } = await import(
        "../../src/cli/onboarding_transcript_import.js"
      );

      const result = await run({ dryRun: false, api });

      expect(result.files_found).toBe(2);
      expect(result.files_stored).toBe(2);
      expect(result.files_skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(calls).toHaveLength(2);
    });
  });
});
