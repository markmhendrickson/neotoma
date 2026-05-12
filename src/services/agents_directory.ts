/**
 * Aggregates distinct "agents" (writers) seen across the write-path tables.
 *
 * An agent is identified by `deriveAgentKey()` from `./agent_key.ts`, keeping
 * the server-side key identical to the Inspector-side `getAttributionKey()`.
 *
 * The directory is computed on demand from the provenance JSON columns of
 * `observations`, `sources`, `timeline_events`, `interpretations`, and
 * `relationship_observations`. No separate rollup table is maintained so
 * the view is always live.
 */

import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";
import { deriveAgentKey } from "./agent_key.js";
import {
  listRecentRecordActivity,
  type RecordActivityItem,
  type RecordActivityType,
} from "./recent_record_activity.js";

export type AgentAttributionTier =
  | "hardware"
  | "operator_attested"
  | "software"
  | "unverified_client"
  | "anonymous";

const KNOWN_TIERS: ReadonlySet<AgentAttributionTier> = new Set([
  "hardware",
  "operator_attested",
  "software",
  "unverified_client",
  "anonymous",
]);

/** Value returned by {@link listAgents}. */
export interface AgentDirectoryEntry {
  /** Stable identifier used for `GET /agents/:key` and UI links. */
  agent_key: string;
  /** Short label: `client_name` (+ version) → `agent_sub` → short thumbprint → "Anonymous". */
  label: string;
  /** Tier reported on the most recent row for this agent. */
  tier: AgentAttributionTier;
  agent_thumbprint?: string | null;
  agent_public_key?: string | null;
  agent_algorithm?: string | null;
  agent_sub?: string | null;
  agent_iss?: string | null;
  client_name?: string | null;
  client_version?: string | null;
  /** Earliest / latest ISO timestamp the agent was seen writing anything. */
  first_seen_at: string | null;
  last_seen_at: string | null;
  /** Total rows across all record types we aggregate. */
  total_records: number;
  /** Per record-type counts. Missing buckets mean zero. */
  record_counts: Partial<Record<RecordActivityType, number>>;
  /**
   * Observations grouped by target entity type (join `entities`). Used to
   * surface feedback (`issue` / conversations), governance (`agent_grant`), and
   * other permissioned or high-signal writers on the Agents directory.
   * Omitted when empty.
   */
  observation_entity_type_counts?: Record<string, number>;
}

export interface ListAgentsResult {
  agents: AgentDirectoryEntry[];
  total: number;
}

/**
 * One row contributed by one table to the per-agent rollup. We compute it
 * in SQL via `json_extract` so SQLite does the heavy lifting.
 */
interface AgentRow {
  record_type: RecordActivityType;
  record_id: string;
  activity_at: string | null;
  agent_thumbprint: string | null;
  agent_public_key: string | null;
  agent_algorithm: string | null;
  agent_sub: string | null;
  agent_iss: string | null;
  client_name: string | null;
  client_version: string | null;
  attribution_tier: string | null;
  /** Populated for `observation` rows via `entities` join; otherwise null. */
  entity_type: string | null;
}

const AGENT_ROWS_SQL = `
SELECT
  'observation' AS record_type,
  o.id AS record_id,
  coalesce(o.observed_at, o.created_at) AS activity_at,
  json_extract(o.provenance, '$.agent_thumbprint') AS agent_thumbprint,
  json_extract(o.provenance, '$.agent_public_key') AS agent_public_key,
  json_extract(o.provenance, '$.agent_algorithm') AS agent_algorithm,
  json_extract(o.provenance, '$.agent_sub') AS agent_sub,
  json_extract(o.provenance, '$.agent_iss') AS agent_iss,
  json_extract(o.provenance, '$.client_name') AS client_name,
  json_extract(o.provenance, '$.client_version') AS client_version,
  json_extract(o.provenance, '$.attribution_tier') AS attribution_tier,
  e.entity_type AS entity_type
FROM observations o
LEFT JOIN entities e ON e.id = o.entity_id
WHERE o.user_id = ?

UNION ALL

SELECT
  'source' AS record_type,
  s.id AS record_id,
  s.created_at AS activity_at,
  json_extract(s.provenance, '$.agent_thumbprint'),
  json_extract(s.provenance, '$.agent_public_key'),
  json_extract(s.provenance, '$.agent_algorithm'),
  json_extract(s.provenance, '$.agent_sub'),
  json_extract(s.provenance, '$.agent_iss'),
  json_extract(s.provenance, '$.client_name'),
  json_extract(s.provenance, '$.client_version'),
  json_extract(s.provenance, '$.attribution_tier'),
  CAST(NULL AS TEXT) AS entity_type
FROM sources s
WHERE s.user_id = ?

UNION ALL

SELECT
  'timeline_event' AS record_type,
  te.id AS record_id,
  te.created_at AS activity_at,
  json_extract(te.provenance, '$.agent_thumbprint'),
  json_extract(te.provenance, '$.agent_public_key'),
  json_extract(te.provenance, '$.agent_algorithm'),
  json_extract(te.provenance, '$.agent_sub'),
  json_extract(te.provenance, '$.agent_iss'),
  json_extract(te.provenance, '$.client_name'),
  json_extract(te.provenance, '$.client_version'),
  json_extract(te.provenance, '$.attribution_tier'),
  CAST(NULL AS TEXT) AS entity_type
FROM timeline_events te
WHERE te.source_id IN (SELECT id FROM sources WHERE user_id = ?)

UNION ALL

SELECT
  'interpretation' AS record_type,
  i.id AS record_id,
  coalesce(i.completed_at, i.started_at, i.created_at) AS activity_at,
  json_extract(i.provenance, '$.agent_thumbprint'),
  json_extract(i.provenance, '$.agent_public_key'),
  json_extract(i.provenance, '$.agent_algorithm'),
  json_extract(i.provenance, '$.agent_sub'),
  json_extract(i.provenance, '$.agent_iss'),
  json_extract(i.provenance, '$.client_name'),
  json_extract(i.provenance, '$.client_version'),
  json_extract(i.provenance, '$.attribution_tier'),
  CAST(NULL AS TEXT) AS entity_type
FROM interpretations i
WHERE i.user_id = ?

UNION ALL

SELECT
  'relationship' AS record_type,
  ro.relationship_key AS record_id,
  ro.observed_at AS activity_at,
  json_extract(ro.provenance, '$.agent_thumbprint'),
  json_extract(ro.provenance, '$.agent_public_key'),
  json_extract(ro.provenance, '$.agent_algorithm'),
  json_extract(ro.provenance, '$.agent_sub'),
  json_extract(ro.provenance, '$.agent_iss'),
  json_extract(ro.provenance, '$.client_name'),
  json_extract(ro.provenance, '$.client_version'),
  json_extract(ro.provenance, '$.attribution_tier'),
  CAST(NULL AS TEXT) AS entity_type
FROM relationship_observations ro
WHERE ro.user_id = ?
`;

function nonEmpty(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = String(v).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normaliseTier(raw: string | null): AgentAttributionTier {
  if (raw && KNOWN_TIERS.has(raw as AgentAttributionTier)) {
    return raw as AgentAttributionTier;
  }
  return "anonymous";
}

function shortThumbprint(tp: string): string {
  return tp.length > 12 ? `${tp.slice(0, 8)}…${tp.slice(-4)}` : tp;
}

function deriveLabel(fields: {
  client_name: string | null;
  client_version: string | null;
  agent_sub: string | null;
  agent_thumbprint: string | null;
}): string {
  if (fields.client_name) {
    return fields.client_version
      ? `${fields.client_name} ${fields.client_version}`
      : fields.client_name;
  }
  if (fields.agent_sub) return fields.agent_sub;
  if (fields.agent_thumbprint) return shortThumbprint(fields.agent_thumbprint);
  return "Anonymous";
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function fetchAgentRows(userId: string): AgentRow[] {
  const db = getSqliteDb();
  const stmt = db.prepare(AGENT_ROWS_SQL);
  return stmt.all(userId, userId, userId, userId, userId) as AgentRow[];
}

function aggregate(rows: AgentRow[]): Map<string, AgentDirectoryEntry> {
  const byKey = new Map<
    string,
    AgentDirectoryEntry & { _lastTierActivity: string | null }
  >();

  for (const row of rows) {
    const fields = {
      agent_thumbprint: nonEmpty(row.agent_thumbprint),
      agent_public_key: nonEmpty(row.agent_public_key),
      agent_algorithm: nonEmpty(row.agent_algorithm),
      agent_sub: nonEmpty(row.agent_sub),
      agent_iss: nonEmpty(row.agent_iss),
      client_name: nonEmpty(row.client_name),
      client_version: nonEmpty(row.client_version),
    };
    const key = deriveAgentKey(fields);
    const tier = normaliseTier(row.attribution_tier);
    const activity = nonEmpty(row.activity_at);

    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        agent_key: key,
        label: deriveLabel(fields),
        tier,
        ...fields,
        first_seen_at: activity,
        last_seen_at: activity,
        total_records: 0,
        record_counts: {},
        _lastTierActivity: activity,
      };
      byKey.set(key, entry);
    }

    entry.total_records += 1;
    entry.record_counts[row.record_type] =
      (entry.record_counts[row.record_type] ?? 0) + 1;

    if (row.record_type === "observation") {
      const et = nonEmpty(row.entity_type);
      if (et) {
        if (!entry.observation_entity_type_counts) {
          entry.observation_entity_type_counts = {};
        }
        entry.observation_entity_type_counts[et] =
          (entry.observation_entity_type_counts[et] ?? 0) + 1;
      }
    }

    entry.first_seen_at = minIso(entry.first_seen_at, activity);
    entry.last_seen_at = maxIso(entry.last_seen_at, activity);

    entry.agent_thumbprint ??= fields.agent_thumbprint;
    entry.agent_public_key ??= fields.agent_public_key;
    entry.agent_algorithm ??= fields.agent_algorithm;
    entry.agent_sub ??= fields.agent_sub;
    entry.agent_iss ??= fields.agent_iss;
    entry.client_name ??= fields.client_name;
    entry.client_version ??= fields.client_version;

    // Tier from the most recent row wins.
    if (
      activity &&
      (!entry._lastTierActivity || activity >= entry._lastTierActivity)
    ) {
      entry.tier = tier;
      entry._lastTierActivity = activity;
    }

    // If we initially labelled from thumbprint but later saw a client name,
    // upgrade to the friendlier label.
    if (
      entry.client_name &&
      entry.label === shortThumbprint(entry.agent_thumbprint ?? "")
    ) {
      entry.label = deriveLabel({
        client_name: entry.client_name,
        client_version: entry.client_version ?? null,
        agent_sub: entry.agent_sub ?? null,
        agent_thumbprint: entry.agent_thumbprint ?? null,
      });
    }
  }

  for (const entry of byKey.values()) {
    delete (entry as { _lastTierActivity?: unknown })._lastTierActivity;
    if (
      entry.observation_entity_type_counts &&
      Object.keys(entry.observation_entity_type_counts).length === 0
    ) {
      delete entry.observation_entity_type_counts;
    }
  }
  return byKey as Map<string, AgentDirectoryEntry>;
}

/** List every agent that has written something for this user. */
export function listAgents(userId: string): ListAgentsResult {
  const rows = fetchAgentRows(userId);
  const byKey = aggregate(rows);
  const agents = [...byKey.values()].sort((a, b) => {
    const lb = b.last_seen_at ?? "";
    const la = a.last_seen_at ?? "";
    return lb.localeCompare(la);
  });
  return { agents, total: agents.length };
}

/** Fetch a single agent by key; `null` when the key is unknown. */
export function getAgent(
  userId: string,
  agentKey: string
): AgentDirectoryEntry | null {
  const rows = fetchAgentRows(userId).filter(
    (r) =>
      deriveAgentKey({
        agent_thumbprint: r.agent_thumbprint,
        agent_sub: r.agent_sub,
        client_name: r.client_name,
        client_version: r.client_version,
      }) === agentKey,
  );
  if (rows.length === 0) return null;
  return aggregate(rows).get(agentKey) ?? null;
}

/**
 * Records written by a specific agent, returned in the same
 * {@link RecordActivityItem} shape the Inspector already renders for the
 * global activity feed. Delegates to {@link listRecentRecordActivity} so
 * we reuse the enrichment joins (entity name, source filename, etc.).
 */
export function listAgentRecords(
  userId: string,
  agentKey: string,
  limit: number,
  offset: number
): { items: RecordActivityItem[]; has_more: boolean; limit: number; offset: number } {
  return listRecentRecordActivity(userId, { limit, offset, agentKey });
}
