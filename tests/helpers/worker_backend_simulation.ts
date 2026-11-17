/**
 * Simulate the worker-thread database backend for one test scope.
 *
 * The worker and libSQL drivers expose no in-process SQLite handle, which is
 * why sqlite-vec is never loaded on them. Wrapping the real connection in a
 * proxy whose prototype is not AsyncSqliteDatabase reproduces exactly that
 * property while every statement still runs against the test database.
 *
 * Usage (in the test file, before importing code under test):
 *   vi.mock("../../src/repositories/db/connection.js", async (importOriginal) =>
 *     simulatedConnectionModule(await importOriginal())
 *   );
 */
import type { DbDatabase } from "../../src/repositories/db/driver.js";

export const workerBackendSimulation = { active: false };

function withoutInProcessHandle(db: DbDatabase): DbDatabase {
  return new Proxy(db, {
    getPrototypeOf: () => Object.prototype,
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function simulatedConnectionModule<T extends { getDb: () => Promise<DbDatabase> }>(
  actual: T
): T {
  return {
    ...actual,
    getDb: async () => {
      const db = await actual.getDb();
      return workerBackendSimulation.active ? withoutInProcessHandle(db) : db;
    },
  };
}
