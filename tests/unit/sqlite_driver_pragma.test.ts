import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-sqlite-pragma-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("SQLite PRAGMA readback", () => {
  it("uses prepare().all() for a node:sqlite-shaped handle", async () => {
    const db = new AsyncSqliteDatabase(path.join(workDir, "native-shaped.db"));
    const all = vi.fn(() => [{ integrity_check: "ok" }]);
    const prepare = vi.fn(() => ({ all }));
    const exec = vi.fn();
    const raw = db.rawDb() as unknown as {
      db: { prepare: typeof prepare; exec: typeof exec; close: () => void };
    };
    raw.db = { prepare, exec, close: () => {} };

    try {
      await expect(db.pragma("integrity_check")).resolves.toEqual([{ integrity_check: "ok" }]);
      expect(prepare).toHaveBeenCalledWith("PRAGMA integrity_check");
      expect(all).toHaveBeenCalledOnce();
      expect(exec).not.toHaveBeenCalled();
    } finally {
      await db.close();
    }
  });

  it("keeps the better-sqlite3 pragma API path unchanged", async () => {
    const db = new AsyncSqliteDatabase(path.join(workDir, "better-shaped.db"));
    const pragma = vi.fn(() => [{ integrity_check: "ok" }]);
    const prepare = vi.fn();
    const raw = db.rawDb() as unknown as {
      db: { pragma: typeof pragma; prepare: typeof prepare; close: () => void };
    };
    raw.db = { pragma, prepare, close: () => {} };

    try {
      await expect(db.pragma("integrity_check")).resolves.toEqual([{ integrity_check: "ok" }]);
      expect(pragma).toHaveBeenCalledWith("integrity_check");
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      await db.close();
    }
  });

  it("returns integrity_check and quick_check rows through the shared driver", async () => {
    const db = new AsyncSqliteDatabase(path.join(workDir, "pragma.db"));
    try {
      const integrity = (await db.pragma("integrity_check")) as Array<Record<string, unknown>>;
      const quick = (await db.pragma("quick_check")) as Array<Record<string, unknown>>;

      expect(integrity).not.toHaveLength(0);
      expect(String(Object.values(integrity[0])[0])).toBe("ok");
      expect(quick).not.toHaveLength(0);
      expect(String(Object.values(quick[0])[0])).toBe("ok");
    } finally {
      await db.close();
    }
  });
});
