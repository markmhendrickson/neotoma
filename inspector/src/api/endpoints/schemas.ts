import { get, post } from "../client";
import type { EntitySchema } from "@/types/api";

/** GET /schemas JSON shape (server paginates with limit/offset; total is full count). */
export type ListSchemasApiResponse = {
  schemas: EntitySchema[];
  total: number;
  limit: number;
  offset: number;
};

const SCHEMA_LIST_FETCH_LIMIT = 250;
const SCHEMA_LIST_MAX_PAGES = 400;

/**
 * One page of GET /schemas. Prefer {@link listSchemas} for Inspector lists so search
 * covers the full registry, not only the server's first page (default limit 100).
 */
export function listSchemasPage(params?: {
  user_id?: string;
  limit?: number;
  offset?: number;
  keyword?: string;
  entity_type?: string;
}) {
  const q: Record<string, string | number | undefined> = {};
  if (params?.user_id) q.user_id = params.user_id;
  if (params?.limit != null) q.limit = params.limit;
  if (params?.offset != null) q.offset = params.offset;
  if (params?.keyword) q.keyword = params.keyword;
  if (params?.entity_type) q.entity_type = params.entity_type;
  return get<ListSchemasApiResponse>("/schemas", q);
}

/**
 * Loads every schema for the current user by following server pagination until the
 * accumulated rows reach `total` or a page returns fewer than `limit` rows.
 */
export async function listSchemas(userId?: string): Promise<{
  schemas: EntitySchema[];
  total: number;
}> {
  const limit = SCHEMA_LIST_FETCH_LIMIT;
  let offset = 0;
  const schemas: EntitySchema[] = [];
  let total = 0;

  for (let page = 0; page < SCHEMA_LIST_MAX_PAGES; page++) {
    const res = await listSchemasPage({
      user_id: userId,
      limit,
      offset,
    });
    total = res.total;
    schemas.push(...res.schemas);
    if (res.schemas.length === 0 || schemas.length >= total || res.schemas.length < limit) {
      break;
    }
    offset += limit;
  }

  return { schemas, total };
}

export function getSchemaByEntityType(entityType: string) {
  return get<EntitySchema>(`/schemas/${encodeURIComponent(entityType)}`);
}

export function registerSchema(data: {
  entity_type: string;
  schema_definition: Record<string, unknown>;
  reducer_config: Record<string, unknown>;
  schema_version?: string;
  user_specific?: boolean;
  activate?: boolean;
}) {
  return post<Record<string, unknown>>("/register_schema", data);
}

export function updateSchemaIncremental(data: {
  entity_type: string;
  fields_to_add: Array<{ field_name: string; field_type: string; required?: boolean; reducer_strategy?: string }>;
  schema_version?: string;
  user_specific?: boolean;
  activate?: boolean;
  migrate_existing?: boolean;
}) {
  return post<Record<string, unknown>>("/update_schema_incremental", data);
}

export function analyzeSchemaCandidates(params?: { entity_type?: string; min_frequency?: number; min_confidence?: number }) {
  return post<Record<string, unknown>>("/analyze_schema_candidates", params ?? {});
}

export function getSchemaRecommendations(entityType: string, source?: string, status?: string) {
  return post<Record<string, unknown>>("/get_schema_recommendations", {
    entity_type: entityType,
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
  });
}
