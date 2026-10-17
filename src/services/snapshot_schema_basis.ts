import { createHash } from "node:crypto";
import { stableSerialize } from "./stable_serialize.js";

/** Identity of the schema and reducer used to materialize an entity snapshot.
 * A version label alone is insufficient: a scoped override can reuse it.
 */
export function snapshotSchemaBasis(schema: {
  schema_version: string;
  schema_definition: unknown;
  reducer_config: unknown;
}): string {
  return createHash("sha256")
    .update(
      stableSerialize({
        schema_version: schema.schema_version,
        schema_definition: schema.schema_definition,
        reducer_config: schema.reducer_config,
      })
    )
    .digest("hex");
}
