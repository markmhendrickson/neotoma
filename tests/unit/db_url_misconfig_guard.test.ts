/**
 * NEOTOMA_DB_URL / NEOTOMA_DB_BACKEND misconfiguration guard (concurrent-backend
 * plan, PR #1944 ux follow-up).
 *
 * NEOTOMA_DB_URL is only honored by the libsql backend. On the default `sqlite`
 * backend it is silently ignored, so an operator who sets a remote URL but
 * forgets NEOTOMA_DB_BACKEND=libsql gets the local sqlite file with no signal.
 * sqliteUrlMisconfig() is the guard the sqlite branch of openDb() consults:
 * throw for a remote URL, warn for a divergent local file: URL, stay silent
 * when the URL is absent or points at the same file that would open anyway.
 */

import { describe, expect, it } from "vitest";
import { sqliteUrlMisconfig } from "../../src/repositories/db/connection.js";

const SQLITE_PATH = "/data/neotoma.db";

describe("sqliteUrlMisconfig (NEOTOMA_DB_URL ignored on sqlite backend)", () => {
  it("returns null when no URL is set (the zero-config default)", () => {
    expect(sqliteUrlMisconfig(undefined, SQLITE_PATH)).toBeNull();
    expect(sqliteUrlMisconfig("", SQLITE_PATH)).toBeNull();
  });

  it("returns null when the URL points at the same file that would open anyway", () => {
    expect(sqliteUrlMisconfig(`file:${SQLITE_PATH}`, SQLITE_PATH)).toBeNull();
    expect(sqliteUrlMisconfig(SQLITE_PATH, SQLITE_PATH)).toBeNull();
  });

  it.each([
    "libsql://db.turso.io",
    "https://sqld.example.com",
    "http://localhost:8080",
    "wss://sqld.example.com",
    "LIBSQL://UPPERCASE.turso.io",
  ])("throws (fail-loud) for a remote URL %s", (url) => {
    const result = sqliteUrlMisconfig(url, SQLITE_PATH);
    expect(result?.level).toBe("throw");
    // Message names the offending value, the file that would open instead, and
    // the fix — the actionable-hint standard the ux lens checks for.
    expect(result?.message).toContain(url);
    expect(result?.message).toContain(SQLITE_PATH);
    expect(result?.message).toMatch(/NEOTOMA_DB_BACKEND=libsql/);
  });

  it("warns (not throws) for a divergent local file: URL", () => {
    const result = sqliteUrlMisconfig("file:/somewhere/else.db", SQLITE_PATH);
    expect(result?.level).toBe("warn");
    expect(result?.message).toContain("/somewhere/else.db");
    expect(result?.message).toContain(SQLITE_PATH);
  });

  it("warns for a bare divergent path (not a file: URL, not remote)", () => {
    const result = sqliteUrlMisconfig("/other/path.db", SQLITE_PATH);
    expect(result?.level).toBe("warn");
    expect(result?.message).toContain("/other/path.db");
  });
});
