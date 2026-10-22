import { AsyncLocalStorage } from "node:async_hooks";
import type { DbDatabase } from "./driver.js";
import { getEmbeddedRuntimeContext } from "../../core/runtime_context.js";

/** One authority for the existing legacy lifecycle binding and explicit scope conflict. */
export const lifecycleDatabaseScope = new AsyncLocalStorage<{
  database: DbDatabase;
  active: boolean;
}>();

export function getExplicitScopedDatabase(): DbDatabase | null {
  const runtime = getEmbeddedRuntimeContext();
  if (!runtime) return null;
  if (lifecycleDatabaseScope.getStore())
    throw new Error("EXPLICIT_RUNTIME_DATABASE_BINDING_CONFLICT");
  return runtime.database;
}
