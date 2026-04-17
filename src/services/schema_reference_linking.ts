/**
 * Schema-driven reference linking.
 *
 * When a schema declares `reference_fields`, this service auto-creates typed
 * relationships between the stored entity and the entity referenced by the
 * named field value.
 *
 * The referenced entity is resolved by (1) treating the field value as a
 * canonical name / identifier and (2) looking up an existing entity of the
 * declared `target_entity_type`. If no match is found, the link is skipped
 * (we do not invent targets).
 *
 * This is the schema-agnostic replacement for hardcoded
 * "if entity.category === 'foo', link to Foo" logic.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import type { RelationshipType } from "./relationships.js";
import type { SchemaDefinition } from "./schema_registry.js";

export interface AutoLinkReferenceFieldsParams {
  entityId: string;
  entityType: string;
  fields: Record<string, unknown>;
  schema: SchemaDefinition | null | undefined;
  userId: string;
  sourceId?: string;
}

export interface AutoLinkResult {
  created: number;
  skipped: number;
  details: Array<{
    field: string;
    target_entity_type: string;
    target_canonical_name: string;
    target_entity_id: string | null;
    relationship_type: string;
    linked: boolean;
  }>;
}

function normalizeCandidate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export async function autoLinkReferenceFields(
  params: AutoLinkReferenceFieldsParams,
): Promise<AutoLinkResult> {
  const result: AutoLinkResult = { created: 0, skipped: 0, details: [] };
  const refs = params.schema?.reference_fields;
  if (!refs || refs.length === 0) return result;

  const { relationshipsService } = await import("./relationships.js");

  for (const ref of refs) {
    const rawValue = params.fields[ref.field];
    const candidate = normalizeCandidate(rawValue);
    if (!candidate) continue;

    // Resolve target entity by canonical_name or display name of the declared
    // target entity type. We check entity_snapshots for an exact canonical
    // match first, then fall back to a case-insensitive name match.
    const { data: byCanonical, error: canonErr } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .eq("entity_type", ref.target_entity_type)
      .eq("user_id", params.userId)
      .eq("canonical_name", candidate)
      .limit(1);

    let targetEntityId: string | null =
      !canonErr && byCanonical && byCanonical.length > 0
        ? byCanonical[0].entity_id
        : null;

    if (!targetEntityId) {
      // Fallback: case-insensitive match on common name-like fields in the
      // target snapshot. We intentionally use a narrow allowlist rather than
      // regex-scanning arbitrary JSON so this stays deterministic.
      const nameLikeKeys = ["canonical_name", "name", "title", "full_name"];
      for (const key of nameLikeKeys) {
        const { data: matches } = await db
          .from("entity_snapshots")
          .select("entity_id, snapshot")
          .eq("entity_type", ref.target_entity_type)
          .eq("user_id", params.userId)
          .limit(25);
        const hit = (matches ?? []).find((row: { snapshot?: unknown }) => {
          const snap = row.snapshot as Record<string, unknown> | null;
          if (!snap) return false;
          const v = snap[key];
          return (
            typeof v === "string" &&
            v.trim().toLowerCase() === candidate.toLowerCase()
          );
        });
        if (hit) {
          targetEntityId = (hit as { entity_id: string }).entity_id;
          break;
        }
      }
    }

    if (!targetEntityId) {
      result.skipped++;
      result.details.push({
        field: ref.field,
        target_entity_type: ref.target_entity_type,
        target_canonical_name: candidate,
        target_entity_id: null,
        relationship_type: ref.relationship_type || "REFERS_TO",
        linked: false,
      });
      continue;
    }

    if (targetEntityId === params.entityId) {
      // No self-loops.
      result.skipped++;
      continue;
    }

    const relationshipType = (ref.relationship_type ||
      "REFERS_TO") as RelationshipType;

    try {
      await relationshipsService.createRelationship({
        relationship_type: relationshipType,
        source_entity_id: params.entityId,
        target_entity_id: targetEntityId,
        source_id: params.sourceId,
        metadata: {
          auto_linked: true,
          auto_link_field: ref.field,
          auto_link_entity_type: params.entityType,
        },
        user_id: params.userId,
      });
      result.created++;
      result.details.push({
        field: ref.field,
        target_entity_type: ref.target_entity_type,
        target_canonical_name: candidate,
        target_entity_id: targetEntityId,
        relationship_type: relationshipType,
        linked: true,
      });
    } catch (err) {
      result.skipped++;
      logger.warn(
        `[SCHEMA_REF_LINK] Failed to auto-link ${params.entityType}.${ref.field} -> ` +
          `${ref.target_entity_type}(${candidate}): ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
  }

  return result;
}
