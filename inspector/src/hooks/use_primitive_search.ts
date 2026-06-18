import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { queryEntities } from "@/api/endpoints/entities";
import { listRecordActivity } from "@/api/endpoints/record_activity";
import { listSources } from "@/api/endpoints/sources";
import { matchesSearchQuery } from "@/lib/search_text_match";
import { recordActivityTypeForKind, type SearchPrimitiveKind } from "@/lib/search_primitives";
import type { EntitySnapshot, RecordActivityItem, Source } from "@/types/api";

export const SEARCH_RESULT_PAGE_SIZE = 25;

/** Recent rows scanned for primitives without a dedicated search API. */
const RECORD_ACTIVITY_SCAN_LIMIT = 300;

function recordActivitySearchText(item: RecordActivityItem): string {
  return [
    item.id,
    item.title,
    item.subtitle,
    item.entity_id,
    item.entity_name,
    item.entity_type,
    item.source_id,
    item.source_filename,
    item.source_type,
    item.source_entity_id,
    item.source_entity_name,
    item.target_entity_id,
    item.target_entity_name,
    item.relationship_type,
    item.event_type,
    item.status,
    item.turn_key,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");
}

type ActivitySearchKind =
  | "observations"
  | "interpretations"
  | "relationships"
  | "timeline_events";

export type PrimitiveSearchResult =
  | {
      kind: "entities" | "entity_snapshots";
      entities: EntitySnapshot[];
      total: number;
      limit: number;
      offset: number;
    }
  | {
      kind: "sources";
      sources: Source[];
      total: number;
      limit: number;
      offset: number;
    }
  | {
      kind: ActivitySearchKind;
      items: RecordActivityItem[];
      total: number;
      limit: number;
      offset: number;
      scannedRecent: true;
      scanLimit: number;
    };

type PrimitiveSearchRawResult =
  | {
      kind: "entities" | "entity_snapshots";
      entities: EntitySnapshot[];
      total: number;
      limit: number;
      offset: number;
    }
  | {
      kind: "sources";
      sources: Source[];
      total: number;
      limit: number;
      offset: number;
    }
  | {
      kind: ActivitySearchKind;
      allItems: RecordActivityItem[];
      total: number;
      scannedRecent: true;
      scanLimit: number;
    };

function paginateActivityResult(
  data: PrimitiveSearchRawResult,
  offset: number,
): PrimitiveSearchResult {
  if (!("allItems" in data)) {
    return data;
  }
  const limit = SEARCH_RESULT_PAGE_SIZE;
  return {
    kind: data.kind,
    items: data.allItems.slice(offset, offset + limit),
    total: data.total,
    limit,
    offset,
    scannedRecent: data.scannedRecent,
    scanLimit: data.scanLimit,
  };
}

export function usePrimitiveSearch(
  kind: SearchPrimitiveKind,
  query: string,
  offset: number,
  entityType?: string,
) {
  const trimmed = query.trim();
  const enabled = isApiUrlConfigured() && trimmed.length > 0;
  const usesOffsetInFetch =
    kind === "entities" || kind === "entity_snapshots" || kind === "sources";
  const normalizedEntityType =
    kind === "entities" && entityType?.trim() ? entityType.trim() : undefined;

  return useQuery({
    queryKey: [
      "primitive-search",
      kind,
      trimmed,
      normalizedEntityType ?? "",
      usesOffsetInFetch ? offset : "scan",
    ],
    enabled,
    queryFn: async ({ signal }): Promise<PrimitiveSearchRawResult> => {
      const limit = SEARCH_RESULT_PAGE_SIZE;
      const fetch = { signal };

      if (kind === "entities" || kind === "entity_snapshots") {
        const result = await queryEntities({
          search: trimmed,
          entity_type: kind === "entities" ? normalizedEntityType : undefined,
          limit,
          offset,
          include_snapshots: true,
        }, fetch);
        return {
          kind,
          entities: result.entities,
          total: result.total,
          limit,
          offset,
        };
      }

      if (kind === "sources") {
        const result = await listSources({
          search: trimmed,
          limit,
          offset,
        }, fetch);
        return {
          kind: "sources",
          sources: result.sources,
          total: result.total ?? result.sources.length,
          limit,
          offset,
        };
      }

      const recordType = recordActivityTypeForKind(kind);
      if (!recordType) {
        return {
          kind: kind as ActivitySearchKind,
          allItems: [],
          total: 0,
          scannedRecent: true,
          scanLimit: RECORD_ACTIVITY_SCAN_LIMIT,
        };
      }

      const activity = await listRecordActivity({
        record_types: recordType,
        limit: RECORD_ACTIVITY_SCAN_LIMIT,
        offset: 0,
      }, fetch);

      const allItems = activity.items.filter((item) =>
        matchesSearchQuery(recordActivitySearchText(item), trimmed),
      );

      return {
        kind: kind as ActivitySearchKind,
        allItems,
        total: allItems.length,
        scannedRecent: true,
        scanLimit: RECORD_ACTIVITY_SCAN_LIMIT,
      };
    },
    select: (data) => paginateActivityResult(data, offset),
  });
}
