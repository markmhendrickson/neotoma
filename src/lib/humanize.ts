/**
 * Human-readable label helpers shared across Inspector pages.
 *
 * These are intentionally dependency-light so they can be reused from any
 * component without pulling React or schema-aware utilities.
 */

const ACRONYMS = new Set([
  "id",
  "ids",
  "url",
  "urls",
  "api",
  "mcp",
  "http",
  "https",
  "sql",
  "uuid",
  "utc",
  "pdf",
  "csv",
  "json",
  "xml",
  "ui",
  "ux",
]);

/** Convert `snake_case`, `camelCase`, or `PascalCase` to `Sentence case`. */
export function humanizeKey(raw: string | null | undefined): string {
  if (!raw) return "";
  const spaced = String(raw)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!spaced) return "";
  const parts = spaced.split(" ");
  const out = parts.map((part, idx) => {
    const lower = part.toLowerCase();
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    if (idx === 0) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  });
  return out.join(" ");
}

/**
 * Humanize a relationship type (e.g. `REFERS_TO` -> `Refers to`,
 * `PART_OF` -> `Part of`). Falls back to `humanizeKey` for unknown types.
 */
export function humanizeRelationshipType(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return humanizeKey(s);
}

/**
 * Humanize an entity type slug (e.g. `social_post` -> `Social post`).
 * When a schema-provided label is available, prefer it. For example,
 * `agent_message` has schemaLabel `"Chat Message"` which takes precedence
 * over the mechanical slug humanization.
 */
export function humanizeEntityType(
  raw: string | null | undefined,
  schemaLabel?: string | null
): string {
  if (schemaLabel && schemaLabel.trim()) return schemaLabel.trim();
  return humanizeKey(raw);
}

/** Relative time string like `5m`, `3h`, `12d`, or a short date. */
export function relativeTime(ts: string | undefined | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Delay before recomputing {@link relativeTime} for the same ISO timestamp.
 * Returns 0 when the displayed value is a calendar date (stable until midnight).
 */
export function relativeTimeRefreshMs(ts: string | undefined | null): number {
  if (!ts) return 0;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 0;
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return 10_000;
    if (mins < 60) return 30_000;
    if (hrs < 24) return 60_000;
    if (days < 30) return 300_000;
    return 0;
  } catch {
    return 0;
  }
}

/** Absolute, locale-aware date/time string. Returns empty when invalid. */
export function absoluteDateTime(ts: string | undefined | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return "";
  }
}

/**
 * Calendar day bucket label for grouping timelines.
 * Examples: "Today", "Yesterday", "Apr 20, 2026".
 */
export function dayBucketLabel(ts: string | undefined | null): string {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "Unknown";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfYesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: undefined,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const URL_RE = /^(https?:)?\/\//i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d()\-.\s]{7,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export type ValueKind =
  | "null"
  | "empty"
  | "boolean"
  | "number"
  | "date"
  | "url"
  | "email"
  | "phone"
  | "text"
  | "multiline"
  | "array"
  | "object";

/** Infer a display kind for a value. Honors an optional schema type hint. */
export function inferValueKind(
  value: unknown,
  typeHint?: string | null
): ValueKind {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return "empty";
    const hint = (typeHint || "").toLowerCase();
    if (hint === "date" || hint === "datetime" || ISO_DATE_RE.test(s)) return "date";
    if (URL_RE.test(s)) return "url";
    if (EMAIL_RE.test(s)) return "email";
    if (PHONE_RE.test(s) && /\d/.test(s)) return "phone";
    if (s.includes("\n")) return "multiline";
    return "text";
  }
  return "text";
}

/** Truncate a string and append an ellipsis when it exceeds `max`. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Keep at most `maxLines` newline-separated lines; append ellipsis when truncated. */
export function truncateLines(s: string, maxLines: number): string {
  if (maxLines < 1) return "…";
  const normalized = s.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length <= maxLines) return s;
  return `${lines.slice(0, maxLines).join("\n")}…`;
}

/**
 * Compact snapshot field previews: cap explicit line count, then character count.
 * Does not affect expanded / full-text views.
 */
export function compactFieldPreview(
  s: string,
  maxLines = 6,
  maxChars = 400
): string {
  return truncate(truncateLines(s, maxLines), maxChars);
}

/** True when {@link compactFieldPreview} would shorten the string. */
export function isFieldPreviewTruncated(
  s: string,
  maxLines = 6,
  maxChars = 400
): boolean {
  return compactFieldPreview(s, maxLines, maxChars) !== s;
}

/** Short ID hint for copy affordances: `ent_197f7a…`. */
export function shortId(id: string | null | undefined, len = 6): string {
  if (!id) return "";
  const s = String(id).trim();
  if (s.length <= len + 4) return s;
  const underscore = s.indexOf("_");
  if (underscore > 0 && underscore < 6) {
    return `${s.slice(0, underscore + 1)}${s.slice(underscore + 1, underscore + 1 + len)}…`;
  }
  return `${s.slice(0, len)}…`;
}

const PREFIXED_HEX_ID = /^(ent_|src_)([a-z0-9]+)$/i;

/**
 * Compact label for `ent_` / `src_` ids: four characters after the prefix,
 * an ellipsis, then the last four characters (e.g. `ent_493c…2539`).
 * Other strings fall back to a short head ellipsis when long.
 */
export function compactPrefixedId(id: string | null | undefined): string {
  if (id == null || id === "") return "";
  const s = String(id).trim();
  const m = PREFIXED_HEX_ID.exec(s);
  if (!m) return s.length <= 16 ? s : `${s.slice(0, 8)}…`;
  const kind = m[1];
  const body = m[2];
  if (!kind || body == null) return s;
  const prefixLen = kind.length;
  const fullPrefix = s.slice(0, prefixLen);
  if (body.length <= 8) return s;
  return `${fullPrefix}${body.slice(0, 4)}…${body.slice(-4)}`;
}

const SNAPSHOT_TITLE_KEYS = [
  "title",
  "name",
  "subject",
  "summary",
  "label",
  "headline",
  "topic",
] as const;

function snapshotFriendlyTitle(snap: Record<string, unknown>): string | null {
  for (const k of SNAPSHOT_TITLE_KEYS) {
    const v = snap[k];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    if (t.length > 240) return t.slice(0, 237) + "…";
    return t;
  }
  const desc = snap.description;
  if (typeof desc === "string") {
    const t = desc.trim();
    if (t && t.length <= 140) return t.length > 120 ? t.slice(0, 117) + "…" : t;
  }
  return null;
}

/**
 * True when `canonical_name` looks like an internal id (turn keys, bare
 * entity ids) rather than a human-authored label.
 */
export function isLikelyMachineCanonicalName(name: string | null | undefined): boolean {
  if (name == null) return true;
  const s = String(name).trim();
  if (!s) return true;
  if (/^id:turn_key:/i.test(s)) return true;
  if (/^turn_key:/i.test(s)) return true;
  if (/^ent_[a-z0-9]{20,}$/i.test(s)) return true;
  const colons = s.match(/:/g);
  if (colons && colons.length >= 5 && s.length >= 48) return true;
  return false;
}

/** Loose key for comparing identity canonical_name to snapshot display titles. */
function canonicalNameDisplayKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalNameMatchesFriendlyTitle(canonicalName: string, friendly: string): boolean {
  const a = canonicalNameDisplayKey(canonicalName);
  const b = canonicalNameDisplayKey(friendly);
  if (!a || !b) return false;
  return a === b;
}

/**
 * Best-effort headline for entity detail pages and lists: prefers snapshot
 * `name` / `title` (preserving user casing) when it matches the stored
 * identity `canonical_name`, uses human canonical_name when it differs,
 * and falls back when canonical_name is missing or machine-like.
 */
export function entityDisplayHeadline(input: {
  canonical_name?: string | null;
  snapshot?: Record<string, unknown> | null;
  entity_type?: string | null;
  entity_type_label?: string | null;
  entity_id?: string | null;
  id?: string | null;
}): string {
  const snap =
    input.snapshot && typeof input.snapshot === "object" && !Array.isArray(input.snapshot)
      ? (input.snapshot as Record<string, unknown>)
      : {};
  const friendly = snapshotFriendlyTitle(snap);
  const cn = typeof input.canonical_name === "string" ? input.canonical_name.trim() : "";

  if (friendly && cn && canonicalNameMatchesFriendlyTitle(cn, friendly)) {
    return friendly;
  }
  if (cn && !isLikelyMachineCanonicalName(cn)) return cn;
  if (friendly) return friendly;
  if (cn) return cn;

  const eid = String(input.entity_id || input.id || "").trim();
  const typeBit = humanizeEntityType(input.entity_type ?? undefined, input.entity_type_label ?? undefined);
  if (eid) return `${typeBit || "Entity"} · ${shortId(eid, 8)}`;
  return typeBit || "Entity";
}
