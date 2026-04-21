import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

/** Fallback so max() never compares empty strings (ISO strings sort lexicographically). */
const TS_EPOCH = "1970-01-01T00:00:00.000Z";

export type RecordActivityType =
  | "entity"
  | "source"
  | "observation"
  | "interpretation"
  | "timeline_event"
  | "relationship";

export interface RecordActivityItem {
  record_type: RecordActivityType;
  id: string;
  activity_at: string;
  title: string;
  subtitle: string | null;
}

type SqlRow = {
  record_type: string;
  id: string;
  activity_at: string;
  title: string | null;
  subtitle: string | null;
};

function max2(a: string, b: string): string {
  return `max(ifnull(nullif(trim(${a}), ''), '${TS_EPOCH}'), ifnull(nullif(trim(${b}), ''), '${TS_EPOCH}'))`;
}

function max3(a: string, b: string, c: string): string {
  return `max(${max2(a, b)}, ifnull(nullif(trim(${c}), ''), '${TS_EPOCH}'))`;
}

/**
 * Recent rows across core Neotoma tables for one user, ordered by latest
 * created/updated (or closest available timestamps per table).
 *
 * Uses SQLite max() on ISO-8601 strings (valid when formats are consistent).
 */
const UNION_SQL = `
SELECT * FROM (
  SELECT
    'entity' AS record_type,
    e.id AS id,
    ${max2("e.created_at", "e.updated_at")} AS activity_at,
    e.canonical_name AS title,
    e.entity_type AS subtitle
  FROM entities e
  WHERE e.user_id = ?
    AND (e.merged_to_entity_id IS NULL OR trim(ifnull(e.merged_to_entity_id, '')) = '')

  UNION ALL

  SELECT
    'source' AS record_type,
    s.id AS id,
    ${max2("s.created_at", "s.created_at")} AS activity_at,
    s.original_filename AS title,
    s.source_type AS subtitle
  FROM sources s
  WHERE s.user_id = ?

  UNION ALL

  SELECT
    'observation' AS record_type,
    o.id AS id,
    ${max2("o.created_at", "o.observed_at")} AS activity_at,
    o.entity_type AS title,
    o.entity_id AS subtitle
  FROM observations o
  WHERE o.user_id = ?

  UNION ALL

  SELECT
    'interpretation' AS record_type,
    i.id AS id,
    ${max3("i.created_at", "i.completed_at", "i.started_at")} AS activity_at,
    i.status AS title,
    i.source_id AS subtitle
  FROM interpretations i
  WHERE i.user_id = ?

  UNION ALL

  SELECT
    'relationship' AS record_type,
    rs.relationship_key AS id,
    ${max2("rs.computed_at", "rs.last_observation_at")} AS activity_at,
    rs.relationship_type AS title,
    (rs.source_entity_id || ' → ' || rs.target_entity_id) AS subtitle
  FROM relationship_snapshots rs
  WHERE rs.user_id = ?

  UNION ALL

  SELECT
    'timeline_event' AS record_type,
    te.id AS id,
    ${max2("te.created_at", "te.created_at")} AS activity_at,
    te.event_type AS title,
    te.entity_id AS subtitle
  FROM timeline_events te
  WHERE te.source_id IN (SELECT id FROM sources WHERE user_id = ?)
)
ORDER BY activity_at DESC
LIMIT ? OFFSET ?
`;

function normalizeItem(row: SqlRow): RecordActivityItem {
  const type = row.record_type as RecordActivityType;
  const title =
    row.title && String(row.title).trim()
      ? String(row.title).trim()
      : humanizeRecordType(type);
  const subtitle = row.subtitle && String(row.subtitle).trim() ? String(row.subtitle).trim() : null;
  return {
    record_type: type,
    id: row.id,
    activity_at: row.activity_at,
    title,
    subtitle,
  };
}

function humanizeRecordType(t: RecordActivityType): string {
  switch (t) {
    case "entity":
      return "Entity";
    case "source":
      return "Source";
    case "observation":
      return "Observation";
    case "interpretation":
      return "Interpretation";
    case "timeline_event":
      return "Timeline event";
    case "relationship":
      return "Relationship";
    default:
      return t;
  }
}

export function listRecentRecordActivity(
  userId: string,
  limit: number,
  offset: number
): { items: RecordActivityItem[]; has_more: boolean; limit: number; offset: number } {
  const db = getSqliteDb();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);
  const fetchLimit = safeLimit + 1;

  // Anonymous `?` only: better-sqlite3 mis-counts array binds for `?1`/`?2` (see WiseLibs/better-sqlite3#576).
  const stmt = db.prepare(UNION_SQL);
  const rows = stmt.all(userId, userId, userId, userId, userId, userId, fetchLimit, safeOffset) as SqlRow[];
  const hasMore = rows.length > safeLimit;
  const slice = hasMore ? rows.slice(0, safeLimit) : rows;
  return {
    items: slice.map(normalizeItem),
    has_more: hasMore,
    limit: safeLimit,
    offset: safeOffset,
  };
}
