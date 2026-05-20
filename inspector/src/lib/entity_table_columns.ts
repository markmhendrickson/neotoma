import type { VisibilityState } from "@tanstack/react-table";
import { humanizeKey } from "./humanize";
import type { EntitySchema } from "@/types/api";

export type EntityTableColumnId =
  | "name"
  | "type"
  | "admission"
  | "observations"
  | "last_observation_at"
  | "entity_id";

/** Prefix for dynamic snapshot field columns (`snapshot:field_key`). */
export const SNAPSHOT_FIELD_COLUMN_PREFIX = "snapshot:";

export function snapshotFieldColumnId(fieldKey: string): string {
  return `${SNAPSHOT_FIELD_COLUMN_PREFIX}${fieldKey}`;
}

export function parseSnapshotFieldColumnId(columnId: string): string | null {
  if (!columnId.startsWith(SNAPSHOT_FIELD_COLUMN_PREFIX)) return null;
  return columnId.slice(SNAPSHOT_FIELD_COLUMN_PREFIX.length) || null;
}

export function isSnapshotFieldColumnId(columnId: string): boolean {
  return columnId.startsWith(SNAPSHOT_FIELD_COLUMN_PREFIX);
}

export const ENTITY_TABLE_COLUMN_LABELS: Record<EntityTableColumnId, string> = {
  name: "Name",
  type: "Type",
  admission: "Admission",
  observations: "Observations",
  last_observation_at: "Last observation",
  entity_id: "ID",
};

/** Entities list page — fixed columns always available in the toggle. */
export const ENTITIES_LIST_COLUMN_IDS: EntityTableColumnId[] = [
  "name",
  "type",
  "admission",
  "observations",
  "last_observation_at",
  "entity_id",
];

export const DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY: VisibilityState = {
  name: true,
  type: false,
  admission: false,
  observations: false,
  last_observation_at: false,
  entity_id: false,
};

/** Search entities / snapshots tabs — same defaults for shared columns. */
export const SEARCH_ENTITY_COLUMN_IDS: EntityTableColumnId[] = [
  "name",
  "type",
  "last_observation_at",
  "entity_id",
];

export const DEFAULT_SEARCH_ENTITY_COLUMN_VISIBILITY: VisibilityState = {
  name: true,
  type: true,
  last_observation_at: false,
  entity_id: false,
};

export function schemaFieldKeys(schema: EntitySchema | null | undefined): string[] {
  if (!schema) return [];
  if (schema.schema_definition?.fields) {
    return Object.keys(schema.schema_definition.fields);
  }
  return schema.field_names ?? [];
}

/** Fixed columns that map to server-side `sort_by` (see entity_queries). */
const COLUMN_ID_TO_API_SORT_BY: Partial<Record<EntityTableColumnId, string>> = {
  name: "canonical_name",
  observations: "observation_count",
  last_observation_at: "last_observation_at",
  entity_id: "entity_id",
};

const API_SORT_BY_TO_COLUMN_ID: Record<string, EntityTableColumnId> = {
  canonical_name: "name",
  observation_count: "observations",
  last_observation_at: "last_observation_at",
  entity_id: "entity_id",
};

const SNAPSHOT_SORT_BY_PREFIX = "snapshot:";

/** Columns with no server sort (type filter is separate; admission is derived). */
const NON_SORTABLE_COLUMN_IDS = new Set<string>(["type", "admission"]);

export function isEntitiesListColumnSortable(columnId: string): boolean {
  if (NON_SORTABLE_COLUMN_IDS.has(columnId)) return false;
  if (columnId in COLUMN_ID_TO_API_SORT_BY) return true;
  return isSnapshotFieldColumnId(columnId);
}

export function columnIdToApiSortBy(columnId: string): string | null {
  if (NON_SORTABLE_COLUMN_IDS.has(columnId)) return null;
  const fixed = COLUMN_ID_TO_API_SORT_BY[columnId as EntityTableColumnId];
  if (fixed) return fixed;
  const fieldKey = parseSnapshotFieldColumnId(columnId);
  if (fieldKey) return `${SNAPSHOT_SORT_BY_PREFIX}${fieldKey}`;
  return null;
}

export function apiSortByToColumnId(sortBy: string): string | null {
  if (sortBy.startsWith(SNAPSHOT_SORT_BY_PREFIX)) {
    const fieldKey = sortBy.slice(SNAPSHOT_SORT_BY_PREFIX.length);
    return fieldKey ? snapshotFieldColumnId(fieldKey) : null;
  }
  return API_SORT_BY_TO_COLUMN_ID[sortBy] ?? null;
}

export type EntityTableSortOption = { value: string; label: string };

/** Sort options for visible, server-sortable columns (stable column order). */
export function buildVisibleEntitySortOptions(
  columnIds: readonly string[],
  columnVisibility: VisibilityState,
  columnLabels: Record<string, string>,
): EntityTableSortOption[] {
  const options: EntityTableSortOption[] = [];
  for (const columnId of columnIds) {
    if (columnVisibility[columnId] === false) continue;
    if (!isEntitiesListColumnSortable(columnId)) continue;
    const value = columnIdToApiSortBy(columnId);
    if (!value) continue;
    options.push({
      value,
      label: columnLabels[columnId] ?? columnId,
    });
  }
  return options;
}

export function buildEntitiesListColumnConfig(schema: EntitySchema | null | undefined): {
  columnIds: string[];
  columnLabels: Record<string, string>;
  defaultVisibility: VisibilityState;
} {
  const fieldKeys = schemaFieldKeys(schema);
  const snapshotColumnIds = fieldKeys.map(snapshotFieldColumnId);

  const columnLabels: Record<string, string> = { ...ENTITY_TABLE_COLUMN_LABELS };
  for (const key of fieldKeys) {
    columnLabels[snapshotFieldColumnId(key)] = humanizeKey(key);
  }

  const defaultVisibility: VisibilityState = {
    ...DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY,
  };
  for (const id of snapshotColumnIds) {
    defaultVisibility[id] = false;
  }

  return {
    columnIds: [...ENTITIES_LIST_COLUMN_IDS, ...snapshotColumnIds],
    columnLabels,
    defaultVisibility,
  };
}
