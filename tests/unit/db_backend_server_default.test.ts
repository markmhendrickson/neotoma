/**
 * Server processes must default to the non-blocking DB backend (neotoma#2280).
 *
 * The worker-hosted backend that keeps SQLite statements off the Node event
 * loop landed in #1944, but it was opt-in via NEOTOMA_DB_BACKEND and no
 * Dockerfile, fly config, or start script ever set it. So every server
 * deployment silently kept the synchronous driver, where one slow query blocks
 * every concurrent request — a hosted instance served the DB-free /health
 * endpoint in 9.4s from inside its own VM.
 *
 * These tests pin the selection rule so the fix cannot silently regress to
 * opt-in again: servers get `libsql`, one-shot CLI processes keep `sqlite`,
 * and an explicit NEOTOMA_DB_BACKEND still wins in either direction.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultDbBackend } from "../../src/config.ts";

async function makeProjectRoot(prefix: string): Promise<{ homeDir: string; projectRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
  );
  return { homeDir, projectRoot };
}

async function stubBaseEnv(prefix: string) {
  const { homeDir, projectRoot } = await makeProjectRoot(prefix);
  vi.stubEnv("HOME", homeDir);
  vi.stubEnv("USERPROFILE", homeDir);
  vi.stubEnv("NEOTOMA_ENV", "development");
  vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
  vi.stubEnv("NEOTOMA_DATA_DIR", path.join(projectRoot, "data"));
}

/** Import config fresh, optionally declaring the process a server first. */
async function importConfig({ asServer }: { asServer: boolean }) {
  vi.resetModules();
  const state = await import("../../src/process_role_state.ts");
  state.resetProcessRoleForTests();
  if (asServer) state.markServerProcess();
  return import("../../src/config.ts");
}

describe("DB backend default by process role (#2280)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("selects the non-blocking backend for servers", () => {
    expect(defaultDbBackend(true)).toBe("libsql");
  });

  it("keeps the synchronous backend for one-shot CLI processes", () => {
    expect(defaultDbBackend(false)).toBe("sqlite");
  });

  it("a server process resolves to libsql when NEOTOMA_DB_BACKEND is unset", async () => {
    await stubBaseEnv("neotoma-role-server-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "");

    const { config } = await importConfig({ asServer: true });
    expect(config.dbBackend).toBe("libsql");
  });

  it("a CLI process resolves to sqlite when NEOTOMA_DB_BACKEND is unset", async () => {
    await stubBaseEnv("neotoma-role-cli-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "");

    const { config } = await importConfig({ asServer: false });
    expect(config.dbBackend).toBe("sqlite");
  });

  it("an explicit NEOTOMA_DB_BACKEND overrides the server default", async () => {
    await stubBaseEnv("neotoma-role-explicit-sqlite-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "sqlite");

    const { config } = await importConfig({ asServer: true });
    expect(config.dbBackend).toBe("sqlite");
  });

  it("an explicit NEOTOMA_DB_BACKEND overrides the CLI default", async () => {
    await stubBaseEnv("neotoma-role-explicit-libsql-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "libsql");

    const { config } = await importConfig({ asServer: false });
    expect(config.dbBackend).toBe("libsql");
  });

  it("importing process_role.js marks the process a server", async () => {
    await stubBaseEnv("neotoma-role-import-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "");

    vi.resetModules();
    const state = await import("../../src/process_role_state.ts");
    state.resetProcessRoleForTests();
    expect(state.isServerProcess()).toBe(false);

    await import("../../src/process_role.ts");
    expect(state.isServerProcess()).toBe(true);
  });

  /**
   * The role must NOT be readable from the environment. An inherited or
   * .env-sourced value would flip the backend for every CLI invocation and
   * every test worker — which is exactly what an earlier env-var-based version
   * of this fix did.
   */
  it("ignores an ambient NEOTOMA_PROCESS_ROLE env var", async () => {
    await stubBaseEnv("neotoma-role-ambient-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "");
    vi.stubEnv("NEOTOMA_PROCESS_ROLE", "server");

    const { config } = await importConfig({ asServer: false });
    expect(config.dbBackend).toBe("sqlite");
  });
});
