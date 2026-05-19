import { pluralizeEntityTypeLabel } from "./entity_type_labels";
import type {
  EntityRelationshipsResponse,
  RelatedEntityExpansion,
  RelationshipSnapshot,
  SourceRelationshipsResponse,
} from "../types/api";

export type DirectedRelationshipRow = {
  rel: RelationshipSnapshot;
  direction: "outgoing" | "incoming";
  otherId: string;
  otherName: string | null;
  otherType: string | null;
  otherTypeLabel: string | null;
  /** From expanded related entity snapshot when available. */
  otherLastObservedAt?: string | null;
};

function lastObservedAt(row: DirectedRelationshipRow): string {
  return row.otherLastObservedAt ?? row.rel.last_observation_at ?? "";
}

export type EntityTypeRelationshipGroup = {
  entityType: string;
  entityTypeLabel: string | null;
  displayLabel: string;
  rows: DirectedRelationshipRow[];
};

export type RelationshipTypeGroup = {
  relationshipType: string;
  totalCount: number;
  entityTypeGroups: EntityTypeRelationshipGroup[];
};

function compareByName(
  a: DirectedRelationshipRow,
  b: DirectedRelationshipRow,
): number {
  const an = (a.otherName ?? a.otherId ?? "").toLowerCase();
  const bn = (b.otherName ?? b.otherId ?? "").toLowerCase();
  return an.localeCompare(bn);
}

function compareByLastObserved(
  a: DirectedRelationshipRow,
  b: DirectedRelationshipRow,
): number {
  const at = lastObservedAt(a);
  const bt = lastObservedAt(b);
  if (at === bt) return compareByName(a, b);
  if (!at) return 1;
  if (!bt) return -1;
  return bt.localeCompare(at);
}

function titleFromRelatedSnapshot(expansion: RelatedEntityExpansion | undefined): string | null {
  const snap = expansion?.snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const o = snap as Record<string, unknown>;
  for (const k of ["title", "name", "subject", "summary", "label", "headline", "topic"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Flatten API relationship payload into directed rows (one row per edge, other = neighbor). */
export function buildDirectedRelationshipRows(
  data: EntityRelationshipsResponse | undefined,
): DirectedRelationshipRow[] {
  if (!data) return [];
  const resolve = (id: string | undefined | null): RelatedEntityExpansion | undefined => {
    if (!id) return undefined;
    return data.related_entities?.[id];
  };
  const out = (data.outgoing ?? []).map<DirectedRelationshipRow>((rel) => {
    const otherId = rel.target_entity_id;
    const expansion = resolve(otherId);
    return {
      rel,
      direction: "outgoing",
      otherId,
      otherName:
        rel.target_entity_name?.trim() ||
        expansion?.canonical_name?.trim() ||
        titleFromRelatedSnapshot(expansion) ||
        null,
      otherType: rel.target_entity_type ?? expansion?.entity_type ?? null,
      otherTypeLabel: rel.target_entity_type_label ?? expansion?.entity_type_label ?? null,
      otherLastObservedAt: expansion?.last_observation_at ?? null,
    };
  });
  const inc = (data.incoming ?? []).map<DirectedRelationshipRow>((rel) => {
    const otherId = rel.source_entity_id;
    const expansion = resolve(otherId);
    return {
      rel,
      direction: "incoming",
      otherId,
      otherName:
        rel.source_entity_name?.trim() ||
        expansion?.canonical_name?.trim() ||
        titleFromRelatedSnapshot(expansion) ||
        null,
      otherType: rel.source_entity_type ?? expansion?.entity_type ?? null,
      otherTypeLabel: rel.source_entity_type_label ?? expansion?.entity_type_label ?? null,
      otherLastObservedAt: expansion?.last_observation_at ?? null,
    };
  });
  return [...out, ...inc];
}

function directedRowFromRelationship(
  rel: RelationshipSnapshot,
  direction: "outgoing" | "incoming",
  otherId: string,
  resolve: (id: string | undefined | null) => RelatedEntityExpansion | undefined,
): DirectedRelationshipRow {
  const expansion = resolve(otherId);
  const isOutgoing = direction === "outgoing";
  return {
    rel,
    direction,
    otherId,
    otherName:
      (isOutgoing ? rel.target_entity_name : rel.source_entity_name)?.trim() ||
      expansion?.canonical_name?.trim() ||
      titleFromRelatedSnapshot(expansion) ||
      null,
    otherType:
      (isOutgoing ? rel.target_entity_type : rel.source_entity_type) ??
      expansion?.entity_type ??
      null,
    otherTypeLabel:
      (isOutgoing ? rel.target_entity_type_label : rel.source_entity_type_label) ??
      expansion?.entity_type_label ??
      null,
    otherLastObservedAt: expansion?.last_observation_at ?? null,
  };
}

/**
 * For a flat source relationship list, pick the highest-degree endpoint per relationship
 * type so "View all" and grouping match entity-detail semantics (many leaves → one hub).
 */
export function inferHubEntityIdByRelationshipType(
  relationships: RelationshipSnapshot[],
): Map<string, string> {
  const byType = new Map<string, RelationshipSnapshot[]>();
  for (const rel of relationships) {
    const key = rel.relationship_type || "UNKNOWN";
    const list = byType.get(key) ?? [];
    list.push(rel);
    byType.set(key, list);
  }

  const hubs = new Map<string, string>();
  for (const [relType, rels] of byType) {
    const degree = new Map<string, number>();
    for (const rel of rels) {
      for (const id of [rel.source_entity_id, rel.target_entity_id]) {
        if (!id) continue;
        degree.set(id, (degree.get(id) ?? 0) + 1);
      }
    }
    const ranked = [...degree.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    const hubId = ranked[0]?.[0];
    if (hubId) hubs.set(relType, hubId);
  }
  return hubs;
}

/** Directed rows for GET /sources/:id/relationships (flat list + optional related_entities). */
export function buildDirectedRelationshipRowsFromSourceList(
  data: SourceRelationshipsResponse | undefined,
): DirectedRelationshipRow[] {
  const relationships = data?.relationships ?? [];
  if (relationships.length === 0) return [];

  const resolve = (id: string | undefined | null): RelatedEntityExpansion | undefined => {
    if (!id) return undefined;
    return data?.related_entities?.[id];
  };

  const hubByType = inferHubEntityIdByRelationshipType(relationships);
  const rows: DirectedRelationshipRow[] = [];

  for (const rel of relationships) {
    const relType = rel.relationship_type || "UNKNOWN";
    const hubId = hubByType.get(relType);
    if (hubId && rel.source_entity_id === hubId) {
      rows.push(
        directedRowFromRelationship(rel, "outgoing", rel.target_entity_id, resolve),
      );
    } else if (hubId && rel.target_entity_id === hubId) {
      rows.push(
        directedRowFromRelationship(rel, "incoming", rel.source_entity_id, resolve),
      );
    } else {
      rows.push(
        directedRowFromRelationship(rel, "outgoing", rel.target_entity_id, resolve),
      );
    }
  }

  return rows;
}

export function filterDirectedRelationshipRows(
  rows: DirectedRelationshipRow[],
  relationshipType: string,
  relatedEntityType: string,
): DirectedRelationshipRow[] {
  const relKey = relationshipType.trim() || "UNKNOWN";
  const typeKey = relatedEntityType.trim() || "unknown";
  return rows.filter(
    (row) =>
      (row.rel.relationship_type || "UNKNOWN") === relKey &&
      (row.otherType?.trim() || "unknown") === typeKey,
  );
}

/** Groups directed relationship rows by relationship type, then by related entity type. */
export function groupRelationshipRowsByType(
  rows: DirectedRelationshipRow[],
): RelationshipTypeGroup[] {
  const byRelationshipType = new Map<string, DirectedRelationshipRow[]>();
  for (const row of rows) {
    const key = row.rel.relationship_type || "UNKNOWN";
    const list = byRelationshipType.get(key) ?? [];
    list.push(row);
    byRelationshipType.set(key, list);
  }

  return Array.from(byRelationshipType.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([relationshipType, relRows]) => {
      const byEntityType = new Map<string, DirectedRelationshipRow[]>();
      for (const row of relRows) {
        const entityType = row.otherType?.trim() || "unknown";
        const list = byEntityType.get(entityType) ?? [];
        list.push(row);
        byEntityType.set(entityType, list);
      }

      const entityTypeGroups: EntityTypeRelationshipGroup[] = Array.from(
        byEntityType.entries(),
      )
        .sort((a, b) => b[1].length - a[1].length)
        .map(([entityType, typeRows]) => {
          const sortedRows = [...typeRows].sort(compareByLastObserved);
          const entityTypeLabel = sortedRows[0]?.otherTypeLabel ?? null;
          const displayLabel =
            entityType === "unknown"
              ? "Unknown type"
              : pluralizeEntityTypeLabel(entityType, entityTypeLabel);
          return {
            entityType,
            entityTypeLabel,
            displayLabel,
            rows: sortedRows,
          };
        });

      return {
        relationshipType,
        totalCount: relRows.length,
        entityTypeGroups,
      };
    });
}
