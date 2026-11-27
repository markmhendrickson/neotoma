/**
 * Unit tests for mirror rebuild auth failure handling (issue #401).
 *
 * `neotoma mirror rebuild --profile <id>` previously exited 0 having written 0
 * files when the API returned an auth error: rebuildProfile logged to stderr
 * and returned silently. The fix makes an auth error throw, so the CLI catch
 * block sets a non-zero exit code. These tests cover the auth-detection logic
 * and the throwing behavior end-to-end via rebuildMirror.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAuthError, rebuildMirror } from "../../src/services/canonical_mirror.ts";

describe("isAuthError", () => {
  it("detects the canonical error envelope code", () => {
    expect(isAuthError({ error: { code: "AUTH_REQUIRED" } })).toBe(true);
  });

  it("detects a bare code", () => {
    expect(isAuthError({ code: "AUTH_REQUIRED" })).toBe(true);
    expect(isAuthError({ code: "ERR_UNAUTHENTICATED" })).toBe(true);
  });

  it("detects HTTP 401 surfaced on the body", () => {
    expect(isAuthError({ status: 401 })).toBe(true);
    expect(isAuthError({ statusCode: 401 })).toBe(true);
  });

  it("returns false for non-auth errors", () => {
    expect(isAuthError({ error: { code: "DB_QUERY_FAILED" } })).toBe(false);
    expect(isAuthError({ status: 500 })).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError("nope")).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});

describe("rebuildMirror profile auth failure (issue #401)", () => {
  // The built-in `neotoma-plans` profile writes to the relative path
  // `docs/plans`, which inside a test run is the repository checkout. Point a
  // user config under a temporary HOME at a temporary output folder instead, so
  // the rebuild (and its ownership manifest) never writes into the repository.
  const envKeys = ["HOME", "USERPROFILE", "NEOTOMA_MIRROR_PATH"] as const;
  const saved: Record<string, string | undefined> = {};
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "mirror-rebuild-auth-"));
    for (const k of envKeys) saved[k] = process.env[k];
    process.env.HOME = tmpRoot;
    process.env.USERPROFILE = tmpRoot;
    process.env.NEOTOMA_MIRROR_PATH = path.join(tmpRoot, "mirror");
    const configDir = path.join(tmpRoot, ".config", "neotoma");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        mirror: {
          profiles: [
            {
              id: "neotoma-plans",
              entity_type: "plan",
              filter: {},
              output_path: path.join(tmpRoot, "plans"),
              render_mode: "frontmatter_content",
              content_field: "body",
            },
          ],
        },
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("throws (non-zero exit signal) when the API returns AUTH_REQUIRED for a profile rebuild", async () => {
    // Drive a `neotoma-plans` profile through the apiClient
    // path. The apiClient returns an auth error exactly as an unauthenticated
    // server would; rebuildProfile must throw rather than return silently.
    const apiClient = {
      POST: vi.fn(async () => ({ error: { error: { code: "AUTH_REQUIRED" } } })),
    } as unknown as Parameters<typeof rebuildMirror>[0] extends { apiClient?: infer A } ? A : never;

    await expect(
      rebuildMirror({ profileId: "neotoma-plans", apiClient, kind: "entities" })
    ).rejects.toThrow(/AUTH_REQUIRED/);

    // The auth failure short-circuits before any entity is rendered/written.
    expect((apiClient as { POST: ReturnType<typeof vi.fn> }).POST).toHaveBeenCalled();
  });

  it("does not throw for a non-auth API error (logs and continues)", async () => {
    const apiClient = {
      POST: vi.fn(async () => ({ error: { error: { code: "DB_QUERY_FAILED" } } })),
    } as unknown as Parameters<typeof rebuildMirror>[0] extends { apiClient?: infer A } ? A : never;

    // A non-auth error returns silently (existing behavior): the rebuild
    // resolves with a report rather than throwing.
    await expect(
      rebuildMirror({ profileId: "neotoma-plans", apiClient, kind: "entities" })
    ).resolves.toBeDefined();
  });
});
