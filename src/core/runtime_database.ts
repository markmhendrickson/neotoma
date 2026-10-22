import type { EmbeddedRuntimeContext } from "./runtime_context.js";

/**
 * Internal explicit fresh setup through the existing schema seam. This is an
 * intentional caller action, never invoked by the context or client factory.
 * Nonempty databases refuse before DDL; existing stores require their own
 * version/contract admission and are never implicitly upgraded here.
 */
export async function initializeFreshEmbeddedDatabase(
  context: EmbeddedRuntimeContext
): Promise<void> {
  await context.run(async () => {
    const { ensureSchema } = await import("../repositories/sqlite/sqlite_client.js");
    await ensureSchema(context.database, { freshOnly: true });
  });
}
