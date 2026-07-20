/**
 * Schema-driven reference linking.
 *
 * When a schema declares `reference_fields`, this service auto-creates typed
 * relationships between the stored entity and the entity referenced by the
 * named field value.
 *
 * The referenced entity is resolved by (1) treating the field value as a
 * canonical name / identifier and (2) looking up an existing entity of the
 * declared `target_entity_type`. If no match is found, the link is skipped by
 * default (we do not invent targets) UNLESS the reference field opts in via
 * `resolve_target: true`, in which case a resolver may create the target
 * (see the `resolve_target` branch below and `company_resolution.ts`).
 *
 * When a reference field's resolved target changes across observations (e.g.
 * a contact's `organization` moves from Company A to Company B), the
 * previously auto-linked edge for that field is retracted in the same
 * reduction that creates the new one, so a stale duplicate edge never
 * accumulates (#1963). Only edges this mechanism created
 * (`metadata.auto_linked === true` for the same field) are retracted;
 * manually-created edges are never touched.
 *
 * This is the schema-agnostic replacement for hardcoded
 * "if entity.category === 'foo', link to Foo" logic.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import type { RelationshipType } from "./relationships.js";
import type { SchemaDefinition } from "./schema_registry.js";

/** Metadata shape written onto relationships created by this service. */
export interface AutoLinkMetadata {
  auto_linked: true;
  auto_link_field: string;
  auto_link_entity_type: string;
}

function isAutoLinkMetadataForField(
  metadata: Record<string, unknown> | null | undefined,
  field: string
): boolean {
  return (
    !!metadata && metadata.auto_linked === true && metadata.auto_link_field === field
  );
}

export interface AutoLinkReferenceFieldsParams {
  entityId: string;
  entityType: string;
  fields: Record<string, unknown>;
  schema: SchemaDefinition | null | undefined;
  userId: string;
  sourceId?: string;
  /**
   * When false (dry-run / `store --plan`), `resolve_target` reference fields
   * are skipped entirely rather than creating a target entity — matches the
   * store pipeline's existing "no writes when commit:false" contract. Plain
   * (non-`resolve_target`) reference fields never write a target entity
   * regardless of this flag (they only link to entities that already exist),
   * so this only changes behavior for `resolve_target: true` fields.
   * Defaults to true so existing callers are unaffected.
   */
  commit?: boolean;
}

export interface AutoLinkResult {
  created: number;
  skipped: number;
  retracted: number;
  retraction_failures: number;
  details: Array<{
    field: string;
    target_entity_type: string;
    target_canonical_name: string;
    target_entity_id: string | null;
    relationship_type: string;
    linked: boolean;
    retracted_target_entity_id?: string;
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

/** Live edges this mechanism previously created for one entity+field+type. */
async function findPriorAutoLinkedEdges(
  relationshipsService: (typeof import("./relationships.js"))["relationshipsService"],
  entityId: string,
  relationshipType: RelationshipType,
  field: string,
  userId: string
): Promise<Array<{ relationship_key: string; target_entity_id: string }>> {
  const existing = await relationshipsService.getRelationshipsForEntity(
    entityId,
    "outgoing",
    false,
    userId
  );
  return existing
    .filter(
      (rel) =>
        rel.relationship_type === relationshipType &&
        isAutoLinkMetadataForField(rel.snapshot, field)
    )
    .map((rel) => ({
      relationship_key: rel.relationship_key,
      target_entity_id: rel.target_entity_id,
    }));
}

/** Result of attempting to retract a set of stale auto-linked edges. */
export interface RetractStaleEdgesResult {
  retracted: number;
  failed: number;
  retractedTargetEntityIds: string[];
}

/** Retract a set of stale auto-linked edges via softDeleteRelationship. */
async function retractStaleAutoLinkedEdges(
  stale: Array<{ relationship_key: string; target_entity_id: string }>,
  relationshipType: RelationshipType,
  entityId: string,
  field: string,
  entityType: string,
  userId: string
): Promise<RetractStaleEdgesResult> {
  const result: RetractStaleEdgesResult = { retracted: 0, failed: 0, retractedTargetEntityIds: [] };
  if (stale.length === 0) return result;
  const { softDeleteRelationship } = await import("./deletion.js");
  for (const edge of stale) {
    const retraction = await softDeleteRelationship(
      edge.relationship_key,
      relationshipType,
      entityId,
      edge.target_entity_id,
      userId,
      `auto_link_retraction:${field}`
    );
    if (retraction.success) {
      result.retracted++;
      result.retractedTargetEntityIds.push(edge.target_entity_id);
    } else {
      result.failed++;
      logger.error(
        `[SCHEMA_REF_LINK] Failed to retract stale auto-linked edge ` +
          `${edge.relationship_key} for ${entityType}.${field}: ${retraction.error}`
      );
    }
  }
  return result;
}

/**
 * Find and retract every live auto-linked edge for one entity+field+type,
 * swallowing lookup/retraction failures as warnings (never throws). Used on
 * every path where this field no longer resolves to a linkable target this
 * reduction — cleared, unresolvable, or self-referencing — so a stale edge
 * from a prior resolution never survives (#1963).
 */
async function retractPriorAutoLinkedEdgesSafely(
  relationshipsService: (typeof import("./relationships.js"))["relationshipsService"],
  relationshipType: RelationshipType,
  entityId: string,
  field: string,
  entityType: string,
  userId: string
): Promise<RetractStaleEdgesResult> {
  try {
    const stale = await findPriorAutoLinkedEdges(
      relationshipsService,
      entityId,
      relationshipType,
      field,
      userId
    );
    return await retractStaleAutoLinkedEdges(stale, relationshipType, entityId, field, entityType, userId);
  } catch (err) {
    logger.error(
      `[SCHEMA_REF_LINK] Failed to retract prior auto-linked edges for ` +
        `${entityType}.${field}: ${err instanceof Error ? err.message : String(err)}`
    );
    return { retracted: 0, failed: 1, retractedTargetEntityIds: [] };
  }
}

export async function autoLinkReferenceFields(
  params: AutoLinkReferenceFieldsParams
): Promise<AutoLinkResult> {
  const result: AutoLinkResult = {
    created: 0,
    skipped: 0,
    retracted: 0,
    retraction_failures: 0,
    details: [],
  };
  const refs = params.schema?.reference_fields;
  if (!refs || refs.length === 0) return result;

  const { relationshipsService } = await import("./relationships.js");

  for (const ref of refs) {
    const rawValue = params.fields[ref.field];
    const candidate = normalizeCandidate(rawValue);
    const relationshipTypeForField = (ref.relationship_type || "REFERS_TO") as RelationshipType;

    if (!candidate) {
      // Field cleared (null/empty): retract any prior auto-linked edge for
      // this field so the snapshot and its live edge don't disagree (#1963).
      const clearedRetraction = await retractPriorAutoLinkedEdgesSafely(
        relationshipsService,
        relationshipTypeForField,
        params.entityId,
        ref.field,
        params.entityType,
        params.userId
      );
      result.retracted += clearedRetraction.retracted;
      result.retraction_failures += clearedRetraction.failed;
      for (const retractedTargetEntityId of clearedRetraction.retractedTargetEntityIds) {
        result.details.push({
          field: ref.field,
          target_entity_type: ref.target_entity_type,
          target_canonical_name: "",
          target_entity_id: null,
          relationship_type: ref.relationship_type || "REFERS_TO",
          linked: false,
          retracted_target_entity_id: retractedTargetEntityId,
        });
      }
      continue;
    }

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
      !canonErr && byCanonical && byCanonical.length > 0 ? byCanonical[0].entity_id : null;

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
          return typeof v === "string" && v.trim().toLowerCase() === candidate.toLowerCase();
        });
        if (hit) {
          targetEntityId = (hit as { entity_id: string }).entity_id;
          break;
        }
      }
    }

    // resolve_target opts a reference field into get-or-create-with-fuzzy-match
    // semantics instead of "skip when no existing target is found" (see the
    // schema_registry.ts SchemaDefinition.reference_fields doc). Only
    // `target_entity_type: "company"` is wired to a resolver today
    // (`resolveCompanyEntity` in company_resolution.ts); other target types
    // fall back to the default skip behavior with a one-time warning so a
    // misconfigured schema fails loud in logs rather than silently no-op-ing.
    const commitTargets = params.commit ?? true;
    if (!targetEntityId && ref.resolve_target && commitTargets) {
      if (ref.target_entity_type === "company") {
        try {
          const { resolveCompanyEntity } = await import("./company_resolution.js");
          const resolution = await resolveCompanyEntity({
            organizationName: candidate,
            userId: params.userId,
          });
          targetEntityId = resolution.entityId;
        } catch (err) {
          logger.warn(
            `[SCHEMA_REF_LINK] resolve_target company resolution failed for ` +
              `${params.entityType}.${ref.field}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      } else {
        logger.warn(
          `[SCHEMA_REF_LINK] resolve_target: true declared for ` +
            `${params.entityType}.${ref.field} -> ${ref.target_entity_type}, but no resolver ` +
            `is wired for that target_entity_type. Falling back to skip-if-missing.`
        );
      }
    }

    if (!targetEntityId) {
      // Target no longer resolves (e.g. organization renamed to a company
      // not yet in the graph): retract any prior auto-linked edge for this
      // field so it doesn't survive as a stale duplicate (#1963).
      const unresolvedRetraction = await retractPriorAutoLinkedEdgesSafely(
        relationshipsService,
        relationshipTypeForField,
        params.entityId,
        ref.field,
        params.entityType,
        params.userId
      );
      result.retracted += unresolvedRetraction.retracted;
      result.retraction_failures += unresolvedRetraction.failed;
      result.skipped++;
      if (unresolvedRetraction.retractedTargetEntityIds.length > 0) {
        for (const retractedTargetEntityId of unresolvedRetraction.retractedTargetEntityIds) {
          result.details.push({
            field: ref.field,
            target_entity_type: ref.target_entity_type,
            target_canonical_name: candidate,
            target_entity_id: null,
            relationship_type: ref.relationship_type || "REFERS_TO",
            linked: false,
            retracted_target_entity_id: retractedTargetEntityId,
          });
        }
      } else {
        result.details.push({
          field: ref.field,
          target_entity_type: ref.target_entity_type,
          target_canonical_name: candidate,
          target_entity_id: null,
          relationship_type: ref.relationship_type || "REFERS_TO",
          linked: false,
        });
      }
      continue;
    }

    if (targetEntityId === params.entityId) {
      // No self-loops, but still retract any prior auto-linked edge for this
      // field — the field's resolved target changed even though we don't
      // link to it (#1963).
      const selfLoopRetraction = await retractPriorAutoLinkedEdgesSafely(
        relationshipsService,
        relationshipTypeForField,
        params.entityId,
        ref.field,
        params.entityType,
        params.userId
      );
      result.retracted += selfLoopRetraction.retracted;
      result.retraction_failures += selfLoopRetraction.failed;
      result.skipped++;
      if (selfLoopRetraction.retractedTargetEntityIds.length > 0) {
        for (const retractedTargetEntityId of selfLoopRetraction.retractedTargetEntityIds) {
          result.details.push({
            field: ref.field,
            target_entity_type: ref.target_entity_type,
            target_canonical_name: candidate,
            target_entity_id: null,
            relationship_type: relationshipTypeForField,
            linked: false,
            retracted_target_entity_id: retractedTargetEntityId,
          });
        }
      } else {
        result.details.push({
          field: ref.field,
          target_entity_type: ref.target_entity_type,
          target_canonical_name: candidate,
          target_entity_id: null,
          relationship_type: relationshipTypeForField,
          linked: false,
        });
      }
      continue;
    }

    const relationshipType = relationshipTypeForField;

    // Find any live edges this mechanism previously created for this field,
    // so a changed resolution target (e.g. contact.organization moving from
    // Company A to Company B) retracts the stale edge instead of
    // accumulating a duplicate (#1963). Manually-created edges (no
    // auto_linked metadata, or a different field) are left untouched.
    let priorAutoLinked: Array<{ relationship_key: string; target_entity_id: string }> = [];
    try {
      priorAutoLinked = await findPriorAutoLinkedEdges(
        relationshipsService,
        params.entityId,
        relationshipType,
        ref.field,
        params.userId
      );
    } catch (err) {
      logger.warn(
        `[SCHEMA_REF_LINK] Failed to look up existing auto-linked edges for ` +
          `${params.entityType}.${ref.field}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const alreadyLinkedToTarget = priorAutoLinked.some(
      (rel) => rel.target_entity_id === targetEntityId
    );
    const staleAutoLinked = priorAutoLinked.filter(
      (rel) => rel.target_entity_id !== targetEntityId
    );

    if (alreadyLinkedToTarget) {
      // Target unchanged: no-op, avoid a redundant create + retraction pair.
      result.details.push({
        field: ref.field,
        target_entity_type: ref.target_entity_type,
        target_canonical_name: candidate,
        target_entity_id: targetEntityId,
        relationship_type: relationshipType,
        linked: true,
      });
      continue;
    }

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
        } satisfies AutoLinkMetadata,
        user_id: params.userId,
      });

      const changedTargetRetraction = await retractStaleAutoLinkedEdges(
        staleAutoLinked,
        relationshipType,
        params.entityId,
        ref.field,
        params.entityType,
        params.userId
      );
      result.retracted += changedTargetRetraction.retracted;
      result.retraction_failures += changedTargetRetraction.failed;

      result.created++;
      if (changedTargetRetraction.retractedTargetEntityIds.length > 0) {
        for (const retractedTargetEntityId of changedTargetRetraction.retractedTargetEntityIds) {
          result.details.push({
            field: ref.field,
            target_entity_type: ref.target_entity_type,
            target_canonical_name: candidate,
            target_entity_id: targetEntityId,
            relationship_type: relationshipType,
            linked: true,
            retracted_target_entity_id: retractedTargetEntityId,
          });
        }
      } else {
        result.details.push({
          field: ref.field,
          target_entity_type: ref.target_entity_type,
          target_canonical_name: candidate,
          target_entity_id: targetEntityId,
          relationship_type: relationshipType,
          linked: true,
        });
      }
    } catch (err) {
      result.skipped++;
      logger.warn(
        `[SCHEMA_REF_LINK] Failed to auto-link ${params.entityType}.${ref.field} -> ` +
          `${ref.target_entity_type}(${candidate}): ${
            err instanceof Error ? err.message : String(err)
          }`
      );
    }
  }

  return result;
}
