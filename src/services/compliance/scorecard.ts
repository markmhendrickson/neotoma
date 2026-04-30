/**
 * Aggregates per-turn compliance (`conversation_turn` / legacy aliases) into
 * the Inspector scorecard JSON. Single source for GET /admin/compliance/scorecard.
 */

import { getSqliteDb } from "../../repositories/sqlite/sqlite_client.js";

const TS_EPOCH = "1970-01-01T00:00:00.000Z";

const RELATIVE_RE = /^(\d+)(h|d)$/i;

const GROUP_BY_VALUES = new Set([
  "model+harness",
  "model",
  "harness",
  "profile",
  "model+harness+profile",
]);

export interface ComplianceScorecardParams {
  since?: string;
  until?: string;
  group_by?: string;
  min_turns?: number;
  min_backfill_rate?: number;
  top_missed_steps?: number;
  include_synthetic?: boolean;
  /** Reference instant for relative windows (tests inject). */
  ref_ms?: number;
}

export interface ComplianceCell {
  model: string;
  harness: string;
  profile: string;
  total_turns: number;
  backfilled_turns: number;
  backfill_rate: number;
  estimated_turns: number;
  estimated: boolean;
  daily_total: Record<string, number>;
  daily_backfill_rate: Record<string, number>;
  top_missed_steps: Array<{ step: string; count: number }>;
}

export interface ComplianceScorecard {
  generated_at: string;
  window: { since: string | null; until: string | null };
  group_by: string;
  cells: ComplianceCell[];
  summary: {
    total_turns: number;
    backfilled_turns: number;
    backfill_rate: number;
    estimated_turns: number;
    cell_count: number;
    top_missed_steps: Array<{ step: string; count: number }>;
  };
  estimated: boolean;
}

type TurnRow = {
  snapshot_json: string | null;
  activity_at: string;
};

function cleanString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function activityExpr(aliasE: string, aliasEs: string): string {
  return `max(
    ifnull(nullif(trim(${aliasEs}.last_observation_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(${aliasE}.updated_at), ''), '${TS_EPOCH}'),
    ifnull(nullif(trim(${aliasE}.created_at), ''), '${TS_EPOCH}')
  )`;
}

const TURNS_IN_WINDOW_SQL = `
SELECT
  es.snapshot AS snapshot_json,
  ${activityExpr("e", "es")} AS activity_at
FROM entities e
LEFT JOIN entity_snapshots es ON es.entity_id = e.id
WHERE e.user_id = ?
  AND e.entity_type IN ('conversation_turn', 'turn_compliance', 'turn_activity')
  AND (e.merged_to_entity_id IS NULL OR trim(ifnull(e.merged_to_entity_id, '')) = '')
  AND ${activityExpr("e", "es")} >= ?
  AND ${activityExpr("e", "es")} <= ?
`;

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function utcDay(iso: string): string {
  const s = cleanString(iso);
  if (!s) return "1970-01-01";
  const d = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return "1970-01-01";
    return new Date(t).toISOString().slice(0, 10);
  } catch {
    return "1970-01-01";
  }
}

function parseRelativeDurationMs(input: string): number {
  const m = input.trim().match(RELATIVE_RE);
  if (!m) return 7 * 86400000;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === "h" ? n * 3600000 : n * 86400000;
}

function parseInstantStart(input: string, fallback: number): number {
  const day = input.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (day) {
    const t = Date.parse(`${day[1]}T00:00:00.000Z`);
    return Number.isNaN(t) ? fallback : t;
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? fallback : t;
}

function parseInstantEnd(input: string, fallback: number): number {
  const day = input.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (day) {
    const t = Date.parse(`${day[1]}T23:59:59.999Z`);
    return Number.isNaN(t) ? fallback : t;
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? fallback : t;
}

export function resolveScorecardWindow(
  sinceRaw: string | undefined,
  untilRaw: string | undefined,
  refMs: number,
): { sinceIso: string; untilIso: string; sinceLabel: string | null; untilLabel: string | null } {
  const untilMs = untilRaw?.trim() ? parseInstantEnd(untilRaw.trim(), refMs) : refMs;
  const sinceMs = sinceRaw?.trim()
    ? RELATIVE_RE.test(sinceRaw.trim())
      ? untilMs - parseRelativeDurationMs(sinceRaw.trim())
      : parseInstantStart(sinceRaw.trim(), untilMs - 7 * 86400000)
    : untilMs - 7 * 86400000;

  const sinceIso = new Date(Math.min(sinceMs, untilMs)).toISOString();
  const untilIso = new Date(Math.max(sinceMs, untilMs)).toISOString();
  return {
    sinceIso,
    untilIso,
    sinceLabel: sinceRaw?.trim() || null,
    untilLabel: untilRaw?.trim() || null,
  };
}

type MutableCell = {
  model: string;
  harness: string;
  profile: string;
  /** Distinct values for dimensions not part of the group key (for display). */
  altHarness: Set<string>;
  altModel: Set<string>;
  altProfile: Set<string>;
  total: number;
  backfilled: number;
  dailyTotal: Record<string, number>;
  dailyBackfilled: Record<string, number>;
  missed: Map<string, number>;
};

function groupKey(
  groupBy: string,
  model: string,
  harness: string,
  profile: string,
): string {
  switch (groupBy) {
    case "model":
      return `m:${model}`;
    case "harness":
      return `h:${harness}`;
    case "profile":
      return `p:${profile}`;
    case "model+harness+profile":
      return `m:${model}|h:${harness}|p:${profile}`;
    case "model+harness":
    default:
      return `m:${model}|h:${harness}`;
  }
}

function parseGroupKey(groupBy: string, key: string): { model: string; harness: string; profile: string } {
  const out = { model: "(unknown)", harness: "(unknown)", profile: "(unset)" };
  for (const part of key.split("|")) {
    const idx = part.indexOf(":");
    if (idx < 1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === "m") out.model = v || out.model;
    if (k === "h") out.harness = v || out.harness;
    if (k === "p") out.profile = v || out.profile;
  }
  return out;
}

function pickDisplay(primary: string, alt: Set<string>, inGroupKey: boolean): string {
  if (inGroupKey) return primary || "(unknown)";
  if (alt.size === 0) return "*";
  const distinct = new Set(alt);
  if (distinct.size === 1) return [...distinct][0]!;
  return "*";
}

function topMissed(m: Map<string, number>, n: number): Array<{ step: string; count: number }> {
  const arr = [...m.entries()].map(([step, count]) => ({ step, count }));
  arr.sort((a, b) => (b.count !== a.count ? b.count - a.count : a.step.localeCompare(b.step)));
  return arr.slice(0, Math.max(0, n));
}

export function buildComplianceScorecard(
  userId: string,
  params: ComplianceScorecardParams = {},
): ComplianceScorecard {
  const refMs = params.ref_ms ?? Date.now();
  const { sinceIso, untilIso, sinceLabel, untilLabel } = resolveScorecardWindow(
    params.since,
    params.until,
    refMs,
  );

  const groupBy = params.group_by && GROUP_BY_VALUES.has(params.group_by) ? params.group_by : "model+harness";
  const minTurns = Math.max(0, params.min_turns ?? 0);
  const minBackfillRate = params.min_backfill_rate;
  const topN = Math.min(50, Math.max(1, params.top_missed_steps ?? 5));
  const includeSynthetic = params.include_synthetic === true;

  const db = getSqliteDb();
  const rows = db.prepare(TURNS_IN_WINDOW_SQL).all(userId, sinceIso, untilIso) as TurnRow[];

  const cells = new Map<string, MutableCell>();

  for (const row of rows) {
    const snap = parseJsonObject(row.snapshot_json);
    const model = cleanString(snap.model) || "(unknown)";
    const harness = cleanString(snap.harness) || "(unknown)";
    const profile =
      cleanString(snap.instruction_profile) ||
      cleanString((snap.instruction_diagnostics as Record<string, unknown>)?.profile) ||
      "(unset)";

    if (!includeSynthetic) {
      const h = harness.toLowerCase();
      if (h.includes("synthetic") || h.includes("eval-harness")) continue;
    }

    const status = cleanString(snap.status);
    const isBackfilled = status === "backfilled_by_hook";
    const day = utcDay(row.activity_at);
    const missedArr = Array.isArray(snap.missed_steps) ? (snap.missed_steps as unknown[]) : [];

    const key = groupKey(groupBy, model, harness, profile);
    let cell = cells.get(key);
    if (!cell) {
      const dims = parseGroupKey(groupBy, key);
      cell = {
        model: dims.model,
        harness: dims.harness,
        profile: dims.profile,
        altHarness: new Set(),
        altModel: new Set(),
        altProfile: new Set(),
        total: 0,
        backfilled: 0,
        dailyTotal: {},
        dailyBackfilled: {},
        missed: new Map(),
      };
      cells.set(key, cell);
    }
    if (!groupBy.includes("model")) cell.altModel.add(model);
    if (!groupBy.includes("harness")) cell.altHarness.add(harness);
    if (!groupBy.includes("profile")) cell.altProfile.add(profile);

    cell.total += 1;
    if (isBackfilled) cell.backfilled += 1;
    cell.dailyTotal[day] = (cell.dailyTotal[day] ?? 0) + 1;
    if (isBackfilled) {
      cell.dailyBackfilled[day] = (cell.dailyBackfilled[day] ?? 0) + 1;
    }
    for (const stepRaw of missedArr) {
      const step = cleanString(stepRaw);
      if (!step) continue;
      cell.missed.set(step, (cell.missed.get(step) ?? 0) + 1);
    }
  }

  const summaryMissed = new Map<string, number>();
  let sumTotal = 0;
  let sumBack = 0;

  const outCells: ComplianceCell[] = [];
  for (const c of cells.values()) {
    if (c.total < minTurns) continue;
    const rate = c.total > 0 ? c.backfilled / c.total : 0;
    if (minBackfillRate !== undefined && rate < minBackfillRate) continue;

    sumTotal += c.total;
    sumBack += c.backfilled;
    for (const [step, count] of c.missed) {
      summaryMissed.set(step, (summaryMissed.get(step) ?? 0) + count);
    }

    const dailyBackfillRate: Record<string, number> = {};
    const days = [...new Set([...Object.keys(c.dailyTotal), ...Object.keys(c.dailyBackfilled)])].sort();
    for (const d of days) {
      const tot = c.dailyTotal[d] ?? 0;
      dailyBackfillRate[d] = tot > 0 ? (c.dailyBackfilled[d] ?? 0) / tot : 0;
    }

    outCells.push({
      model: pickDisplay(c.model, c.altModel, groupBy.includes("model")),
      harness: pickDisplay(c.harness, c.altHarness, groupBy.includes("harness")),
      profile: pickDisplay(c.profile, c.altProfile, groupBy.includes("profile")),
      total_turns: c.total,
      backfilled_turns: c.backfilled,
      backfill_rate: rate,
      estimated_turns: 0,
      estimated: false,
      daily_total: { ...c.dailyTotal },
      daily_backfill_rate: dailyBackfillRate,
      top_missed_steps: topMissed(c.missed, topN),
    });
  }

  outCells.sort((a, b) => {
    const m = a.model.localeCompare(b.model);
    if (m !== 0) return m;
    const h = a.harness.localeCompare(b.harness);
    if (h !== 0) return h;
    return a.profile.localeCompare(b.profile);
  });

  const summaryRate = sumTotal > 0 ? sumBack / sumTotal : 0;

  return {
    generated_at: new Date(refMs).toISOString(),
    window: { since: sinceLabel, until: untilLabel },
    group_by: groupBy,
    cells: outCells,
    summary: {
      total_turns: sumTotal,
      backfilled_turns: sumBack,
      backfill_rate: summaryRate,
      estimated_turns: 0,
      cell_count: outCells.length,
      top_missed_steps: topMissed(summaryMissed, topN),
    },
    estimated: false,
  };
}
