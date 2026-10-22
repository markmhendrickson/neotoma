import type { DbDatabase } from "./driver.js";
import { getExplicitScopedDatabase } from "./scope.js";

/** Reuse the legacy connection owner only when no explicit database is bound. */
export async function acquireDatabase(): Promise<DbDatabase> {
  const explicit = getExplicitScopedDatabase();
  if (explicit) return explicit;
  const { getDb } = await import("./connection.js");
  return getDb();
}
