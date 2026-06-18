import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getEntityById } from "@/api/endpoints/entities";
import {
  enrichEntityRelationshipPins,
  enrichPinnedPrimitivesWithEntityTypes,
  parseEntityIdFromPinHref,
  type EntityRelationshipPinHydration,
  type PinnedPrimitive,
} from "@/lib/pinned_primitives";
import { parseEntityRelationshipSubpageRoute } from "@/lib/entity_relationship_routes";
import { entityDisplayHeadline, isLikelyMachineCanonicalName } from "@/lib/humanize";
import { pluralizeEntityTypeLabel } from "@/lib/entity_type_labels";

/**
 * Loads missing pin metadata for entity and entity_relationships pins so icons,
 * labels, and localStorage stay in sync.
 */
export function useHydratePinnedEntityTypes(
  pins: PinnedPrimitive[],
  onHydrated: (
    next: PinnedPrimitive[],
    options?: { source?: "user" | "hydration" },
  ) => void,
): void {
  const entityIdsByHref = useMemo(() => {
    const pairs: Array<{ href: string; entityId: string }> = [];
    for (const pin of pins) {
      if (
        pin.kind === "entity" &&
        (!pin.entity_type?.trim() || isLikelyMachineCanonicalName(pin.label))
      ) {
        const entityId = parseEntityIdFromPinHref(pin.href);
        if (entityId) pairs.push({ href: pin.href, entityId });
        continue;
      }
      if (pin.kind === "entity_relationships") {
        const slice = parseEntityRelationshipSubpageRoute(pin.href);
        if (slice) pairs.push({ href: pin.href, entityId: slice.entityId });
      }
    }
    return pairs;
  }, [pins]);

  const queries = useQueries({
    queries: entityIdsByHref.map(({ entityId }) => ({
      queryKey: ["entity", entityId],
      queryFn: ({ signal }: { signal: AbortSignal }) => getEntityById(entityId, { signal }),
      enabled: isApiUrlConfigured(),
      staleTime: 60_000,
    })),
  });

  useEffect(() => {
    const entityTypeByHref = new Map<string, string>();
    const entityLabelByHref = new Map<string, string>();
    const relationshipHydrationByHref = new Map<string, EntityRelationshipPinHydration>();

    entityIdsByHref.forEach(({ href, entityId }, index) => {
      const row = queries[index]?.data;
      if (!row) return;

      const anchorEntityType = row.entity_type?.trim();
      if (!anchorEntityType) return;

      const snapshot =
        row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
          ? (row.snapshot as Record<string, unknown>)
          : {};
      const anchorLabel = entityDisplayHeadline({
        canonical_name: row.canonical_name,
        snapshot,
        entity_type: row.entity_type,
        entity_type_label: row.entity_type_label ?? undefined,
        entity_id: row.entity_id ?? row.id ?? entityId,
        id: row.id,
      });

      const pin = pins.find((p) => p.href === href);
      if (pin?.kind === "entity") {
        entityTypeByHref.set(href, anchorEntityType);
        entityLabelByHref.set(href, anchorLabel);
        return;
      }

      if (pin?.kind === "entity_relationships") {
        const slice = parseEntityRelationshipSubpageRoute(href);
        const relatedEntityType =
          pin.related_entity_type?.trim() ?? slice?.relatedEntityType ?? "";
        if (!relatedEntityType) return;
        relationshipHydrationByHref.set(href, {
          anchorEntityType,
          anchorLabel,
          relatedEntityType,
          relatedTypeLabel: pluralizeEntityTypeLabel(relatedEntityType, null),
        });
      }
    });

    if (
      entityTypeByHref.size === 0 &&
      entityLabelByHref.size === 0 &&
      relationshipHydrationByHref.size === 0
    ) {
      return;
    }

    let next = enrichPinnedPrimitivesWithEntityTypes(pins, entityTypeByHref, entityLabelByHref);
    next = enrichEntityRelationshipPins(next, relationshipHydrationByHref);
    if (next !== pins) onHydrated(next, { source: "hydration" });
  }, [entityIdsByHref, onHydrated, pins, queries]);
}
