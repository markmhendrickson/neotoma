/**
 * Entity Display Name Utility
 *
 * Uses canonical display logic from shared module (same as CLI watch).
 * Priority: title → name → type-specific fields → canonical_name
 */

import type { Entity } from "@/components/EntityList";
import { getEntityDisplayName as getEntityDisplayNameShared } from "@shared/entity_display_name";

export { TYPE_SPECIFIC_DISPLAY_FIELDS } from "@shared/entity_display_name";

/**
 * Get display name for an entity (deterministic, schema-aware).
 * Delegates to shared canonical logic.
 */
export function getEntityDisplayName(entity: Entity): string {
  return getEntityDisplayNameShared({
    entity_type: entity.entity_type,
    canonical_name: entity.canonical_name ?? "",
    snapshot: entity.snapshot ?? undefined,
  });
}
