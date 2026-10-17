/** A whole-population guard must retain the writer reservation until correction. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";

const workDir = mkdtempSync(path.join(tmpdir(), "neotoma-population-lock-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe.each(["sqlite", "libsql-file"] as const)(
  "population write reservation (%s)",
  (backend) => {
    it("prevents a second connection from inserting after inventory and before commit", async () => {
      const file = path.join(workDir, `${backend}.db`);
      const connect = () =>
        backend === "sqlite"
          ? new AsyncSqliteDatabase(file)
          : openLibsqlDatabase(`file:${file}`, { busyTimeoutMs: 2000 });
      const first = connect();
      const second = connect();
      const insert = () => second.prepare("INSERT INTO source (id) VALUES (2)").run();
      try {
        await first.exec("CREATE TABLE source (id INTEGER PRIMARY KEY)");
        await first.prepare("INSERT INTO source (id) VALUES (1)").run();
        if (backend === "sqlite") await second.exec("PRAGMA busy_timeout = 50");
        const firstFile = (await first.pragma("database_list")).find(
          (row) => (row as { name?: unknown }).name === "main"
        );
        const secondFile = (await second.pragma("database_list")).find(
          (row) => (row as { name?: unknown }).name === "main"
        );
        expect(firstFile).toEqual(secondFile);
        expect(firstFile?.file).toBe(realpathSync(file));
        let deferredInsert: Promise<unknown> | undefined;
        await first.transaction(async (tx) => {
          expect(await tx.prepare("SELECT id FROM source ORDER BY id").all()).toEqual([{ id: 1 }]);
          if (backend === "sqlite") {
            await expect(insert()).rejects.toThrow(/locked|busy/i);
          } else {
            deferredInsert = insert();
            const outcome = await Promise.race([
              deferredInsert.then(
                () => "committed",
                () => "failed"
              ),
              new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 75)),
            ]);
            expect(outcome).toBe("pending");
          }
          await tx.prepare("UPDATE source SET id = 3 WHERE id = 1").run();
        });
        if (backend === "sqlite") await expect(insert()).resolves.toMatchObject({ changes: 1 });
        else await expect(deferredInsert).resolves.toMatchObject({ changes: 1 });
        expect(await first.prepare("SELECT id FROM source ORDER BY id").all()).toEqual([
          { id: 2 },
          { id: 3 },
        ]);
      } finally {
        await second.close();
        await first.close();
      }
    });
  }
);
