/**
 * Shared-schema descriptor (Bundles m2 runtime).
 *
 * Path `src/services/bundles/_shared_schemas/` holds the canonical descriptor for
 * any entity type used by 2+ bundles (see `docs/foundation/bundles.md` ->
 * "Shared schemas"). When bundle B declares `references_shared_schemas: [X]` for
 * a type X originated in bundle A, the descriptor records `originated_by: A`.
 *
 * In m2 these descriptors carry ownership metadata only; the runtime entity
 * schema continues to come from the existing registry / `schema_definitions.ts`
 * when present. The `bundles:check` linter validates that every type referenced
 * by 2+ bundles has a matching descriptor here with a consistent `originated_by`.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

export interface SharedSchemaRef {
  /** Entity type this shared schema describes. */
  entity_type: string;
  /** Bundle that originated the schema (ownership transferred at 2nd reference). */
  originated_by: string;
  /** One-line description. */
  description: string;
}
