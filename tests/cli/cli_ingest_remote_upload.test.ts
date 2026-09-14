/**
 * v0.5.1 regression test: `neotoma ingest` must auto-upload the source
 * artifact via multipart and `source_id` when the base URL is non-localhost,
 * and must send `file_path` (server-side disk read) when the base URL is
 * localhost. The `--source-upload` / `--source-content` flags force upload
 * regardless of base URL.
 *
 * Rationale: remote API deployments can't read the CLI user's local
 * filesystem, so `file_path` would silently produce a missing-source
 * error. Auto-detect fixes the common case; the flags let operators
 * force the safer mode explicitly.
 */

import { describe, expect, it } from "vitest";
import { isLocalhostBaseUrl } from "../../src/cli/index.js";

describe("isLocalhostBaseUrl helper", () => {
  it("returns true for localhost variants", () => {
    expect(isLocalhostBaseUrl("http://localhost:8080")).toBe(true);
    expect(isLocalhostBaseUrl("http://127.0.0.1:18099")).toBe(true);
    expect(isLocalhostBaseUrl("http://[::1]:3000")).toBe(true);
    expect(isLocalhostBaseUrl("http://0.0.0.0:8080")).toBe(true);
    expect(isLocalhostBaseUrl("https://localhost")).toBe(true);
  });

  it("returns false for remote hosts", () => {
    expect(isLocalhostBaseUrl("https://api.neotoma.com")).toBe(false);
    expect(isLocalhostBaseUrl("https://example.net:8443")).toBe(false);
    expect(isLocalhostBaseUrl("http://10.0.0.5:8080")).toBe(false);
    expect(isLocalhostBaseUrl("http://192.168.1.2")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isLocalhostBaseUrl("not-a-url")).toBe(false);
    expect(isLocalhostBaseUrl("")).toBe(false);
  });
});

describe("ingest command help surface (audit)", () => {
  it("documents --source-upload, --source-content, and auto-upload behavior", async () => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync("node dist/cli/index.js ingest --help");
    expect(stdout).toMatch(/--source-upload/);
    expect(stdout).toMatch(/--source-content/);
    expect(stdout).toMatch(/non-localhost|localhost|Auto-detected/i);
  });
});
