import { db } from "../db.js";

type DbError = {
  message?: string;
  code?: string;
};

type TimelineEventRow = Record<string, unknown> & {
  id: string;
  event_type: string;
  event_timestamp: string;
  source_id?: string | null;
  source_field?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
  user_id?: string | null;
};

type EntityLookupRow = {
  id: string;
  canonical_name: string | null;
  entity_type: string;
};

export type TimelineOrderBy = "event_timestamp" | "created_at";

export interface ListTimelineEventsForUserParams {
  startDate?: string;
  endDate?: string;
  eventType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface ListTimelineEventsForUserResult {
  events: TimelineEventRow[];
  total: number;
  limit: number;
  offset: number;
}

function normalizeOrderBy(orderBy: string | undefined): TimelineOrderBy {
  return orderBy?.trim().toLowerCase() === "created_at" ? "created_at" : "event_timestamp";
}

function assertNoDbError(error: DbError | null | undefined, message: string): void {
  if (!error) return;
  const err = new Error(error.message || message) as Error & { code?: string };
  if (error.code) err.code = error.code;
  throw err;
}

export async function listTimelineEventsForUser(
  userId: string,
  params: ListTimelineEventsForUserParams = {}
): Promise<ListTimelineEventsForUserResult> {
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const orderByColumn = normalizeOrderBy(params.orderBy);

  let query = db.from("timeline_events").select("*", { count: "exact" }).eq("user_id", userId);

  if (params.startDate) {
    query = query.gte("event_timestamp", params.startDate);
  }
  if (params.endDate) {
    query = query.lte("event_timestamp", params.endDate);
  }
  if (params.eventType) {
    query = query.eq("event_type", params.eventType);
  }
  if (params.entityId) {
    query = query.eq("entity_id", params.entityId);
  }

  const { data, error, count } = await query
    .order(orderByColumn, { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  assertNoDbError(error, "Failed to query timeline events");

  const events = (data || []) as TimelineEventRow[];
  const entityIds = [
    ...new Set(events.map((event) => event.entity_id).filter(Boolean)),
  ] as string[];
  const entityLookup = new Map<string, EntityLookupRow>();

  if (entityIds.length > 0) {
    const { data: entities, error: entitiesError } = await db
      .from("entities")
      .select("id, canonical_name, entity_type")
      .eq("user_id", userId)
      .in("id", entityIds);
    assertNoDbError(entitiesError, "Failed to load timeline event entities");

    for (const entity of (entities || []) as EntityLookupRow[]) {
      entityLookup.set(entity.id, entity);
    }
  }

  return {
    events: events.map((event) => {
      const entity = event.entity_id ? entityLookup.get(event.entity_id) : undefined;
      return {
        ...event,
        entity_name: entity?.canonical_name || undefined,
        entity_type: entity?.entity_type || undefined,
      };
    }),
    total: count || 0,
    limit,
    offset,
  };
}

export async function getTimelineEventForUser(
  userId: string,
  eventId: string
): Promise<TimelineEventRow | null> {
  const { data, error } = await db
    .from("timeline_events")
    .select("*")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  assertNoDbError(error, "Failed to query timeline event");
  return (data as TimelineEventRow | null) ?? null;
}
