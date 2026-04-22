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

  /**
   * Enriched, human-readable fields for UI rendering. All optional for
   * backwards compatibility with older clients that only consume
   * `title`/`subtitle`. Clients should fall back to `title`/`subtitle`
   * when these are absent.
   */
  entity_id?: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  source_id?: string | null;
  source_filename?: string | null;
  source_type?: string | null;
  source_entity_id?: string | null;
  source_entity_name?: string | null;
  target_entity_id?: string | null;
  target_entity_name?: string | null;
  relationship_type?: string | null;
  event_type?: string | null;
  status?: string | null;
  turn_key?: string | null;
  /**
   * Server-computed clustering hint: items sharing the same `group_key`
   * are typically produced by the same agent turn or refer to the same
   * primary entity, and can be visually bundled by the client.
   */
  group_key?: string | null;
}

type SqlRow = {
  record_type: string;
  id: string;
  activity_at: string;
  title: string | null;
  subtitle: string | null;
  entity_id: string | null;
  entity_name: string | null;
  entity_type: string | null;
  source_id: string | null;
  source_filename: string | null;
  source_type: string | null;
  source_entity_id: string | null;
  source_entity_name: string | null;
  target_entity_id: string | null;
  target_entity_name: string | null;
  relationship_type: string | null;
  event_type: string | null;
  status: string | null;
  turn_key: string | null;
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
 *
 * Each sub-select produces the same ordered column list so UNION ALL
 * stays valid. Enrichment is delivered via LEFT JOINs to `entities` and
 * `sources`, and via `json_extract` on the observation `fields` blob for
 * turn identity. Missing joins simply yield NULLs which the UI ignores.
 */
const UNION_SQL = `
SELECT * FROM (
  SELECT
    'entity' AS record_type,
    e.id AS id,
    ${max2("e.created_at", "e.updated_at")} AS activity_at,
    e.canonical_name AS title,
    e.entity_type AS subtitle,
    e.id AS entity_id,
    e.canonical_name AS entity_name,
    e.entity_type AS entity_type,
    NULL AS source_id,
    NULL AS source_filename,
    NULL AS source_type,
    NULL AS source_entity_id,
    NULL AS source_entity_name,
    NULL AS target_entity_id,
    NULL AS target_entity_name,
    NULL AS relationship_type,
    NULL AS event_type,
    NULL AS status,
    NULL AS turn_key
  FROM entities e
  WHERE e.user_id = ?
    AND (e.merged_to_entity_id IS NULL OR trim(ifnull(e.merged_to_entity_id, '')) = '')

  UNION ALL

  SELECT
    'source' AS record_type,
    s.id AS id,
    ${max2("s.created_at", "s.created_at")} AS activity_at,
    s.original_filename AS title,
    s.source_type AS subtitle,
    NULL AS entity_id,
    NULL AS entity_name,
    NULL AS entity_type,
    s.id AS source_id,
    s.original_filename AS source_filename,
    s.source_type AS source_type,
    NULL AS source_entity_id,
    NULL AS source_entity_name,
    NULL AS target_entity_id,
    NULL AS target_entity_name,
    NULL AS relationship_type,
    NULL AS event_type,
    NULL AS status,
    NULL AS turn_key
  FROM sources s
  WHERE s.user_id = ?

  UNION ALL

  SELECT
    'observation' AS record_type,
    o.id AS id,
    ${max2("o.created_at", "o.observed_at")} AS activity_at,
    o.entity_type AS title,
    o.entity_id AS subtitle,
    o.entity_id AS entity_id,
    oe.canonical_name AS entity_name,
    o.entity_type AS entity_type,
    o.source_id AS source_id,
    os.original_filename AS source_filename,
    os.source_type AS source_type,
    NULL AS source_entity_id,
    NULL AS source_entity_name,
    NULL AS target_entity_id,
    NULL AS target_entity_name,
    NULL AS relationship_type,
    NULL AS event_type,
    NULL AS status,
    json_extract(o.fields, '$.turn_key') AS turn_key
  FROM observations o
  LEFT JOIN entities oe ON oe.id = o.entity_id
  LEFT JOIN sources os ON os.id = o.source_id
  WHERE o.user_id = ?

  UNION ALL

  SELECT
    'interpretation' AS record_type,
    i.id AS id,
    ${max3("i.created_at", "i.completed_at", "i.started_at")} AS activity_at,
    i.status AS title,
    i.source_id AS subtitle,
    NULL AS entity_id,
    NULL AS entity_name,
    NULL AS entity_type,
    i.source_id AS source_id,
    isrc.original_filename AS source_filename,
    isrc.source_type AS source_type,
    NULL AS source_entity_id,
    NULL AS source_entity_name,
    NULL AS target_entity_id,
    NULL AS target_entity_name,
    NULL AS relationship_type,
    NULL AS event_type,
    i.status AS status,
    NULL AS turn_key
  FROM interpretations i
  LEFT JOIN sources isrc ON isrc.id = i.source_id
  WHERE i.user_id = ?

  UNION ALL

  SELECT
    'relationship' AS record_type,
    rs.relationship_key AS id,
    ${max2("rs.computed_at", "rs.last_observation_at")} AS activity_at,
    rs.relationship_type AS title,
    (rs.source_entity_id || ' → ' || rs.target_entity_id) AS subtitle,
    NULL AS entity_id,
    NULL AS entity_name,
    NULL AS entity_type,
    NULL AS source_id,
    NULL AS source_filename,
    NULL AS source_type,
    rs.source_entity_id AS source_entity_id,
    rse.canonical_name AS source_entity_name,
    rs.target_entity_id AS target_entity_id,
    rte.canonical_name AS target_entity_name,
    rs.relationship_type AS relationship_type,
    NULL AS event_type,
    NULL AS status,
    NULL AS turn_key
  FROM relationship_snapshots rs
  LEFT JOIN entities rse ON rse.id = rs.source_entity_id
  LEFT JOIN entities rte ON rte.id = rs.target_entity_id
  WHERE rs.user_id = ?

  UNION ALL

  SELECT
    'timeline_event' AS record_type,
    te.id AS id,
    ${max2("te.created_at", "te.created_at")} AS activity_at,
    te.event_type AS title,
    te.entity_id AS subtitle,
    te.entity_id AS entity_id,
    tee.canonical_name AS entity_name,
    tee.entity_type AS entity_type,
    te.source_id AS source_id,
    tes.original_filename AS source_filename,
    tes.source_type AS source_type,
    NULL AS source_entity_id,
    NULL AS source_entity_name,
    NULL AS target_entity_id,
    NULL AS target_entity_name,
    NULL AS relationship_type,
    te.event_type AS event_type,
    NULL AS status,
    NULL AS turn_key
  FROM timeline_events te
  LEFT JOIN entities tee ON tee.id = te.entity_id
  LEFT JOIN sources tes ON tes.id = te.source_id
  WHERE te.source_id IN (SELECT id FROM sources WHERE user_id = ?)
)
ORDER BY activity_at DESC
LIMIT ? OFFSET ?
`;

function cleanString(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function computeGroupKey(row: SqlRow): string | null {
  const turn = cleanString(row.turn_key);
  if (turn) return `turn:${turn}`;
  if (row.record_type === "observation" || row.record_type === "timeline_event") {
    const ent = cleanString(row.entity_id);
    if (ent) return `entity:${ent}`;
  }
  if (row.record_type === "interpretation") {
    const src = cleanString(row.source_id);
    if (src) return `source:${src}`;
  }
  if (row.record_type === "relationship") {
    const src = cleanString(row.source_entity_id);
    if (src) return `entity:${src}`;
  }
  return null;
}

function normalizeItem(row: SqlRow): RecordActivityItem {
  const type = row.record_type as RecordActivityType;
  const title =
    row.title && String(row.title).trim()
      ? String(row.title).trim()
      : humanizeRecordType(type);
  const subtitle = cleanString(row.subtitle);
  return {
    record_type: type,
    id: row.id,
    activity_at: row.activity_at,
    title,
    subtitle,
    entity_id: cleanString(row.entity_id),
    entity_name: cleanString(row.entity_name),
    entity_type: cleanString(row.entity_type),
    source_id: cleanString(row.source_id),
    source_filename: cleanString(row.source_filename),
    source_type: cleanString(row.source_type),
    source_entity_id: cleanString(row.source_entity_id),
    source_entity_name: cleanString(row.source_entity_name),
    target_entity_id: cleanString(row.target_entity_id),
    target_entity_name: cleanString(row.target_entity_name),
    relationship_type: cleanString(row.relationship_type),
    event_type: cleanString(row.event_type),
    status: cleanString(row.status),
    turn_key: cleanString(row.turn_key),
    group_key: computeGroupKey(row),
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
