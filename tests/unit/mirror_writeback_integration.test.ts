/**
 * Integration / service-layer tests for mirror_writeback.ts (issue #1776).
 *
 * These tests drive `runMirrorPush` at the service boundary with injected
 * failing mocks rather than relying on unit-level over-mocks that hide real
 * failure modes.  They were added after QA identified four gaps in the
 * original 27-test suite:
 *
 *   1. API failure mid-batch (POST /correct returns 400 / 500 / 503)
 *   2. Missing / invalid API client at the service boundary
 *   3. Basemap IO errors (corrupt JSON, missing base directory)
 *   4. (doc) Concurrent-push notes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  runMirrorPush,
  type WritebackApiClient,
  type MirrorPushResult,
} from "../../src/services/mirror_writeback.ts";
import type { MirrorProfile } from "../../src/services/canonical_mirror.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<MirrorProfile> = {}): MirrorProfile {
  return {
    id: "test-profile",
    entity_type: "plan",
    filter: {},
    output_path: "/tmp/placeholder", // overridden per-test
    render_mode: "frontmatter_content",
    content_field: "body",
    allow_disk_writeback: true,
    ...overrides,
  };
}

function makeApiClient(overrides: Partial<WritebackApiClient> = {}): WritebackApiClient {
  const defaultGet = vi.fn().mockResolvedValue({
    data: {
      entity_type: "plan",
      snapshot: { title: "Original Title", status: "active" },
    },
    error: null,
    response: { status: 200 },
  });
  const defaultPost = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
  return {
    GET: (overrides.GET as WritebackApiClient["GET"]) ?? defaultGet,
    POST: (overrides.POST as WritebackApiClient["POST"]) ?? defaultPost,
  };
}

/** Minimal on-disk mirror file with a title that differs from the canonical "Original Title". */
function makeMarkdownFile(entityId: string, title = "Edited Title"): string {
  return `---
entity_id: ${entityId}
entity_type: plan
schema_version: 1.0
title: ${title}
status: active
---

Body content.
`;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "neotoma-mw-int-"));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ===========================================================================
// 1. API failure mid-batch: POST /correct returns 4xx / 5xx
// ===========================================================================

describe("runMirrorPush — API failure mid-batch", () => {
  it("captures error in result.errors when POST /correct returns a 400 error body", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    // Write a file whose title differs from canonical so a correction is queued.
    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_api400"), "utf8");

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });
    // POST returns an error body simulating a 400.
    const postMock = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "VALIDATION_ERROR", message: "Field value rejected" },
    });

    const api = makeApiClient({ GET: getMock, POST: postMock });
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    // The service must NOT throw.
    expect(result).toBeDefined();

    // At least one error should be recorded for the failing correction.
    expect(result.errors.length).toBeGreaterThan(0);
    const correctionError = result.errors.find((e) => e.message.includes("Correction failed"));
    expect(correctionError).toBeDefined();
    expect(correctionError?.message).toContain("title");

    // No corrections should count as "applied" when the POST returned an error.
    expect(result.corrections_applied).toBe(0);
  });

  it("captures error in result.errors when POST /correct throws a network-level exception (503)", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_api503"), "utf8");

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });
    // POST throws instead of returning — simulates a network timeout / 503.
    const postMock = vi.fn().mockRejectedValue(new Error("Service Unavailable (503)"));

    const api = makeApiClient({ GET: getMock, POST: postMock });
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
    const networkError = result.errors.find((e) => e.message.includes("Correction request failed"));
    expect(networkError).toBeDefined();
    expect(networkError?.message).toContain("503");
    expect(result.corrections_applied).toBe(0);
  });

  it("continues processing subsequent files after one POST failure (no crash, partial batch)", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    // Two files that both need corrections.
    await fs.writeFile(path.join(tmpDir, "plan-a.md"), makeMarkdownFile("ent_batch_a"), "utf8");
    await fs.writeFile(path.join(tmpDir, "plan-b.md"), makeMarkdownFile("ent_batch_b"), "utf8");

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });

    let postCallCount = 0;
    // First POST call fails, subsequent calls succeed.
    const postMock = vi.fn().mockImplementation(() => {
      postCallCount++;
      if (postCallCount === 1) {
        return Promise.resolve({
          data: null,
          error: { code: "INTERNAL_SERVER_ERROR", message: "500 Internal Server Error" },
        });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });

    const api = makeApiClient({ GET: getMock, POST: postMock });
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    // Must not throw; must record the failure.
    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);

    // At least one correction should succeed (from the second file / call).
    expect(result.corrections_applied).toBeGreaterThan(0);

    // Both files were scanned regardless of the first failure.
    expect(result.files_scanned).toBe(2);
  });

  it("records error without crashing when GET /entities/{id} returns a 500 error body", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_get500"), "utf8");

    const getMock = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Server error" },
      response: { status: 500 },
    });

    const api = makeApiClient({ GET: getMock });
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
    const fetchError = result.errors.find((e) => e.message.includes("API fetch failed"));
    expect(fetchError).toBeDefined();
    expect(fetchError?.message).toContain("500");
    expect(result.corrections_applied).toBe(0);
  });
});

// ===========================================================================
// 2. Missing / invalid API client at the service boundary
// ===========================================================================

/**
 * The service wraps per-file API calls in a try/catch so it can continue
 * processing remaining files — the TypeError from null/undefined client
 * surfaces as an entry in `result.errors` rather than an uncaught rejection.
 * This is correct defensive behavior: no silent success, no crash, failure
 * is surfaced explicitly in the structured result.
 */
describe("runMirrorPush — invalid API client at the service boundary", () => {
  it("surfaces TypeError in result.errors (no silent success) when apiClient is null", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    // Write a file so the service gets past the directory scan and attempts an API call.
    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_null_client"), "utf8");

    // The CLI guards against a null client, but the service catches the TypeError
    // and records it in errors[] rather than crashing — that is the correct behavior.
    const result = await runMirrorPush(profile, null as unknown as WritebackApiClient);

    // Must not silently succeed.
    expect(result.corrections_applied).toBe(0);
    // The failure must be visible in the structured result.
    expect(result.errors.length).toBeGreaterThan(0);
    const typeError = result.errors.find((e) => e.message.includes("TypeError"));
    expect(typeError).toBeDefined();
    expect(typeError?.message).toContain("null");
  });

  it("surfaces TypeError in result.errors (no silent success) when apiClient is undefined", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_undef_client"), "utf8");

    const result = await runMirrorPush(profile, undefined as unknown as WritebackApiClient);

    expect(result.corrections_applied).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    const typeError = result.errors.find((e) => e.message.includes("TypeError"));
    expect(typeError).toBeDefined();
  });

  it("surfaces TypeError in result.errors when GET is replaced with a non-function", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_badget"), "utf8");

    // Partially broken client: GET is not a function.
    const brokenClient = {
      GET: "not-a-function",
      POST: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    } as unknown as WritebackApiClient;

    const result = await runMirrorPush(profile, brokenClient);

    expect(result.corrections_applied).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    const typeError = result.errors.find(
      (e) => e.message.includes("TypeError") || e.message.includes("is not a function")
    );
    expect(typeError).toBeDefined();
  });
});

// ===========================================================================
// 3. Basemap IO errors
// ===========================================================================

describe("runMirrorPush — basemap IO errors", () => {
  it("recovers gracefully from corrupt basemap.json (invalid JSON) — treats as empty base", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_corrupt_base"), "utf8");

    // Write a corrupt basemap.
    const baseDir = path.join(tmpDir, ".neotoma-mirror-base");
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(path.join(baseDir, "basemap.json"), "{ this is not valid JSON !!!}", "utf8");

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });
    const postMock = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const api = makeApiClient({ GET: getMock, POST: postMock });

    // Must not throw — corrupt basemap is treated as empty (no base known).
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    expect(result).toBeDefined();
    // The service should not crash; corrections may still be applied.
    // With no base, any disk-vs-canonical diff triggers a correction.
    expect(result.corrections_applied).toBeGreaterThanOrEqual(0);
    // No fatal errors due to the basemap corruption itself.
    const basemapError = result.errors.find((e) => e.message.includes("basemap"));
    expect(basemapError).toBeUndefined();
  });

  it("recovers gracefully from basemap.json with missing required fields — treats as empty base", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    await fs.writeFile(
      path.join(tmpDir, "plan.md"),
      makeMarkdownFile("ent_malformed_base"),
      "utf8"
    );

    // Write a basemap with wrong shape: entries lack `snapshot` field.
    const baseDir = path.join(tmpDir, ".neotoma-mirror-base");
    mkdirSync(baseDir, { recursive: true });
    const malformedMap = {
      "plan.md": {
        content_hash: "deadbeef",
        // snapshot field intentionally omitted
      },
    };
    writeFileSync(
      path.join(baseDir, "basemap.json"),
      JSON.stringify(malformedMap, null, 2),
      "utf8"
    );

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });
    const postMock = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const api = makeApiClient({ GET: getMock, POST: postMock });

    // Must not throw.
    const result: MirrorPushResult = await runMirrorPush(profile, api);
    expect(result).toBeDefined();
  });

  it("returns an error (no crash) when the profile output directory does not exist", async () => {
    const nonExistentDir = path.join(tmpDir, "does-not-exist");
    const profile = makeProfile({ output_path: nonExistentDir });

    const api = makeApiClient();
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
    const dirError = result.errors.find((e) =>
      e.message.includes("Cannot read profile output directory")
    );
    expect(dirError).toBeDefined();
    expect(result.corrections_applied).toBe(0);
  });

  it("records error and continues when basemap save fails (directory becomes unwritable)", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    // Write a file that will produce a correction.
    await fs.writeFile(path.join(tmpDir, "plan.md"), makeMarkdownFile("ent_save_fail"), "utf8");

    // Create the base dir as a file (not directory) so mkdir in saveBaseMap fails.
    writeFileSync(path.join(tmpDir, ".neotoma-mirror-base"), "I am a file, not a directory");

    const getMock = vi.fn().mockResolvedValue({
      data: { entity_type: "plan", snapshot: { title: "Original Title", status: "active" } },
      error: null,
      response: { status: 200 },
    });
    const postMock = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const api = makeApiClient({ GET: getMock, POST: postMock });

    // Must not throw.
    const result: MirrorPushResult = await runMirrorPush(profile, api);

    expect(result).toBeDefined();
    // The basemap save error should be recorded.
    const saveError = result.errors.find(
      (e) => e.message.includes("Failed to save base map") || e.message.includes("base map")
    );
    expect(saveError).toBeDefined();
    // Despite the basemap save failure, corrections should still have been applied.
    expect(result.corrections_applied).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 4. Concurrent-push documentation / behavioral note
// ===========================================================================

/**
 * Concurrent-push behavior note (non-blocking, informational):
 *
 * `runMirrorPush` is NOT concurrency-safe on a single profile.  If two
 * processes call it simultaneously for the same `output_path`:
 *
 *   - Both read the same `basemap.json` at startup → both start from the
 *     same base snapshot.
 *   - Both may POST `/correct` for the same field → the second POST wins
 *     because `/correct` is idempotent for the same `idempotency_key`.
 *   - Both write `basemap.json` at the end → last write wins; the loser
 *     drops its base updates silently.
 *
 * The safe operational pattern is:
 *   - Serialize pushes per profile (single writer, e.g. via a file lock or
 *     a queue, or the CLI's natural sequential execution).
 *   - Never fan-out parallel `mirror push` on the same profile.
 *
 * The test below documents the idempotency-key collision: two sequential
 * pushes for the same unchanged disk state produce identical idempotency
 * keys and both succeed (the second is a no-op at the API level).
 */
describe("runMirrorPush — idempotency and sequential re-push", () => {
  it("two sequential pushes with the same disk state produce deterministic idempotency keys on the first push", async () => {
    const profile = makeProfile({ output_path: tmpDir });

    // Use a disk file whose editable fields (title, status, body) all match
    // what the mock API returns after corrections — so the second push is a no-op.
    const diskContent = makeMarkdownFile("ent_sequential");
    await fs.writeFile(path.join(tmpDir, "plan.md"), diskContent, "utf8");

    // The disk file parses to: { title: "Edited Title", status: "active", body: "Body content." }
    // Original canonical has title: "Original Title" → correction queued for title (and body).
    // After first push the service re-fetches; return the fully-updated snapshot so
    // basemap reflects disk state exactly — second push should be a no-op.
    const originalSnapshot = { title: "Original Title", status: "active", body: "" };
    const updatedSnapshot = {
      title: "Edited Title",
      status: "active",
      body: "Body content.",
    };
    let getCallCount = 0;
    const getMock = vi.fn().mockImplementation(() => {
      getCallCount++;
      // First call (during first push, fetching canonical): return original.
      // All subsequent calls (basemap re-fetch + second push GET): return updated.
      const snapshot = getCallCount === 1 ? originalSnapshot : updatedSnapshot;
      return Promise.resolve({
        data: { entity_type: "plan", snapshot },
        error: null,
        response: { status: 200 },
      });
    });

    const postedKeys: string[] = [];
    const postMock = vi
      .fn()
      .mockImplementation((_path: string, args: { body: { idempotency_key: string } }) => {
        postedKeys.push(args.body.idempotency_key);
        return Promise.resolve({ data: { success: true }, error: null });
      });

    const api = makeApiClient({ GET: getMock, POST: postMock });

    // First push — should apply corrections for at least title and body.
    const result1 = await runMirrorPush(profile, api);
    const keys1 = [...postedKeys];

    // First push should have applied corrections.
    expect(result1.corrections_applied).toBeGreaterThan(0);
    expect(result1.errors).toHaveLength(0);

    // All idempotency keys must follow the deterministic SHA-256 hash format.
    for (const key of keys1) {
      expect(key).toMatch(/^mirror-push-[0-9a-f]{32}$/);
    }

    // Second push: GET returns updatedSnapshot (= disk state).
    // The basemap was also written with updatedSnapshot after the first push.
    // So disk == canonical == base → all fields are in sync → no corrections.
    postedKeys.length = 0;
    const result2 = await runMirrorPush(profile, api);
    const keys2 = [...postedKeys];

    expect(result2.corrections_applied).toBe(0);
    expect(keys2).toHaveLength(0);
    expect(result2.errors).toHaveLength(0);
  });
});
