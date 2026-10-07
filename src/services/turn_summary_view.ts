/**
 * Turn-summary view model and its plain-text rendering.
 *
 * One structure, two renderers: `buildTurnSummaryCard()` produces the data
 * the in-chat MCP Apps card (`ui://neotoma/turn-summary`) draws, and
 * `renderTurnSummaryFallbackText()` turns that same structure into the
 * markdown block clients without MCP Apps support show instead. Labels,
 * icons, group order, truncation and links are all decided here, once, so the
 * card and the text cannot drift and the model never composes the summary
 * itself — it relays `fallback_text` verbatim.
 *
 * Pure: no I/O, no clock, no request context.
 */

/** Chat bookkeeping types never shown in the summary. */
export const TURN_SUMMARY_BOOKKEEPING_TYPES: ReadonlySet<string> = new Set([
  "conversation",
  "conversation_message",
  "agent_message",
]);

/** Header icon and product name, shared by card and text. */
export const TURN_SUMMARY_HEADER_ICON = "🧠";
export const TURN_SUMMARY_HEADER_TITLE = "Neotoma";

/** Default number of entity rows shown across all groups before "N more". */
export const TURN_SUMMARY_DEFAULT_MAX_ITEMS = 5;

/** Longest entity label rendered before it is cut with an ellipsis. */
const MAX_LABEL_LENGTH = 80;

export type TurnSummaryGroupKey = "created" | "updated" | "retrieved" | "ambiguous";

/** Group order and labels. The card and the text both iterate this list. */
export const TURN_SUMMARY_GROUPS: ReadonlyArray<{ key: TurnSummaryGroupKey; label: string }> = [
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
  { key: "retrieved", label: "Retrieved" },
  { key: "ambiguous", label: "Ambiguous" },
];

/**
 * Per-entity-type icon. Mirrors the emoji vocabulary the MCP display rule has
 * always used, so the server-rendered summary reads the same as the
 * hand-written one it replaces.
 */
const ENTITY_TYPE_ICONS: Record<string, string> = {
  task: "✅",
  contact: "👤",
  person: "👤",
  company: "🏢",
  organization: "🏢",
  event: "📅",
  calendar_event: "📅",
  email_message: "✉️",
  receipt: "🧾",
  invoice: "🧾",
  transaction: "💸",
  note: "📝",
  location: "📍",
  place: "📍",
  file_asset: "📎",
  research: "🔍",
  analysis: "🔍",
  issue: "🐛",
};
export const TURN_SUMMARY_DEFAULT_ENTITY_ICON = "🗂️";

export function iconForEntityType(entityType: string): string {
  return ENTITY_TYPE_ICONS[entityType] ?? TURN_SUMMARY_DEFAULT_ENTITY_ICON;
}

/** An entity as the summary computation hands it to the view. */
export type TurnSummaryViewEntity = {
  entity_id: string;
  entity_type: string;
  /** Human-readable label (title / name). Falls back to entity_type. */
  label?: string | null;
  /** identity_rule for ambiguous (heuristic-merge) entries. */
  identity_rule?: string | null;
};

export type TurnSummaryCardItem = {
  entity_id: string;
  entity_type: string;
  /** Sanitized display label (control characters stripped, length-capped). */
  label: string;
  icon: string;
  /** Inspector link for the entity, or null when no origin is known. */
  url: string | null;
  /** Trailing explanation, e.g. why an entry is ambiguous. */
  note: string | null;
};

export type TurnSummaryCardGroup = {
  key: TurnSummaryGroupKey;
  label: string;
  /** Full count for the group, including rows hidden by truncation. */
  count: number;
  /** Rows shown for the group (may be fewer than `count`). */
  items: TurnSummaryCardItem[];
};

export type TurnSummaryCard = {
  header: {
    icon: string;
    title: string;
    /** Which Neotoma answered: instance name, else host, else null. */
    instance: string | null;
    conversation_label: string | null;
    conversation_url: string | null;
  };
  /** Non-empty groups only, in TURN_SUMMARY_GROUPS order. */
  groups: TurnSummaryCardGroup[];
  total_count: number;
  shown_count: number;
  /** Present when rows were truncated. */
  more: { count: number; label: string; url: string | null } | null;
  /** Present when issue entities were flagged this turn and need review. */
  issues: { count: number; label: string; url: string | null } | null;
};

export type BuildTurnSummaryCardInput = {
  created: TurnSummaryViewEntity[];
  updated: TurnSummaryViewEntity[];
  retrieved: TurnSummaryViewEntity[];
  ambiguous: TurnSummaryViewEntity[];
  /** Public origin of the Inspector/app, e.g. `https://neotoma.example.com`. */
  origin?: string | null;
  /** Operator-facing instance name; preferred over the origin host. */
  instance_name?: string | null;
  conversation_entity_id?: string | null;
  conversation_label?: string | null;
  turn_number?: number | null;
  max_items?: number;
  /** Issue entities flagged this turn (drives the review note). */
  issues_count?: number;
};

/**
 * Strip characters that could disturb a terminal or a markdown renderer:
 * C0/C1 control characters (including ESC, so no ANSI sequences survive),
 * bidirectional overrides, and line breaks. Collapses whitespace and caps the
 * length.
 */
export function sanitizeTurnSummaryLabel(value: string, maxLength = MAX_LABEL_LENGTH): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Escape the markdown characters that could break a link, open emphasis or
 * code, or be read as HTML. Underscore is left alone: intraword underscores
 * (snake_case types, identity rules) do not trigger emphasis, and escaping
 * them would print stray backslashes in terminals that show raw markdown.
 */
function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*[\]<>]/g, (ch) => `\\${ch}`);
}

function normalizeOrigin(origin: string | null | undefined): string | null {
  const trimmed = origin?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function hostOf(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function entityUrl(origin: string | null, entityId: string): string | null {
  if (!origin || !entityId) return null;
  return `${origin}/entities/${encodeURIComponent(entityId)}`;
}

function conversationUrl(
  origin: string | null,
  conversationEntityId: string | null | undefined,
  turnNumber?: number | null
): string | null {
  if (!origin || !conversationEntityId) return null;
  const base = `${origin}/conversations/${encodeURIComponent(conversationEntityId)}`;
  return typeof turnNumber === "number" && Number.isFinite(turnNumber) && turnNumber > 0
    ? `${base}#msg-${turnNumber}`
    : base;
}

function toItem(
  entity: TurnSummaryViewEntity,
  groupKey: TurnSummaryGroupKey,
  origin: string | null
): TurnSummaryCardItem {
  const rawLabel = typeof entity.label === "string" ? sanitizeTurnSummaryLabel(entity.label) : "";
  // entity_type is schema-registered and user-definable, so it is cleaned
  // like any other free text before it reaches a terminal or the card.
  const entityType = sanitizeTurnSummaryLabel(String(entity.entity_type ?? ""), 60) || "entity";
  const rule =
    groupKey === "ambiguous" && typeof entity.identity_rule === "string"
      ? sanitizeTurnSummaryLabel(entity.identity_rule, 60)
      : "";
  return {
    entity_id: entity.entity_id,
    entity_type: entityType,
    label: rawLabel || entityType,
    icon: iconForEntityType(entity.entity_type),
    url: entityUrl(origin, entity.entity_id),
    note:
      groupKey === "ambiguous"
        ? rule
          ? `heuristic match via identity_rule "${rule}"`
          : "heuristic match"
        : null,
  };
}

/**
 * Build the card data. Bookkeeping types are dropped defensively, an entity
 * listed under `ambiguous` is removed from `created`/`updated` (never
 * double-listed), and at most `max_items` rows are kept across all groups in
 * group order; a group that is shown keeps its full count, and a group with
 * no rows left in the budget is not shown at all (its rows count toward
 * "N more").
 */
export function buildTurnSummaryCard(input: BuildTurnSummaryCardInput): TurnSummaryCard {
  const origin = normalizeOrigin(input.origin);
  const maxItems =
    typeof input.max_items === "number" && input.max_items >= 0
      ? Math.floor(input.max_items)
      : TURN_SUMMARY_DEFAULT_MAX_ITEMS;

  const visible = (list: TurnSummaryViewEntity[]) =>
    (list ?? []).filter((e) => e && !TURN_SUMMARY_BOOKKEEPING_TYPES.has(e.entity_type));

  const ambiguous = visible(input.ambiguous);
  const ambiguousIds = new Set(ambiguous.map((e) => e.entity_id));
  const byGroup: Record<TurnSummaryGroupKey, TurnSummaryViewEntity[]> = {
    created: visible(input.created).filter((e) => !ambiguousIds.has(e.entity_id)),
    updated: visible(input.updated).filter((e) => !ambiguousIds.has(e.entity_id)),
    retrieved: visible(input.retrieved),
    ambiguous,
  };

  let budget = maxItems;
  let total = 0;
  let shown = 0;
  const groups: TurnSummaryCardGroup[] = [];
  for (const { key, label } of TURN_SUMMARY_GROUPS) {
    const entries = byGroup[key];
    if (entries.length === 0) continue;
    const take = Math.min(budget, entries.length);
    budget -= take;
    total += entries.length;
    shown += take;
    if (take === 0) continue;
    groups.push({
      key,
      label,
      count: entries.length,
      items: entries.slice(0, take).map((e) => toItem(e, key, origin)),
    });
  }

  const conversationLabel =
    typeof input.conversation_label === "string" && input.conversation_label.trim()
      ? sanitizeTurnSummaryLabel(input.conversation_label, 120)
      : null;
  const instanceName =
    typeof input.instance_name === "string" && input.instance_name.trim()
      ? sanitizeTurnSummaryLabel(input.instance_name, 60)
      : null;

  const hidden = total - shown;
  const moreUrl = conversationUrl(origin, input.conversation_entity_id, input.turn_number);
  return {
    header: {
      icon: TURN_SUMMARY_HEADER_ICON,
      title: TURN_SUMMARY_HEADER_TITLE,
      instance: instanceName ?? hostOf(origin),
      conversation_label: conversationLabel,
      conversation_url: conversationUrl(origin, input.conversation_entity_id),
    },
    groups,
    total_count: total,
    shown_count: shown,
    more:
      hidden > 0
        ? {
            count: hidden,
            label: moreUrl ? "full activity in Inspector" : "open this conversation in Inspector",
            url: moreUrl,
          }
        : null,
    issues: buildIssuesNote(input.issues_count, origin),
  };
}

function buildIssuesNote(
  count: number | undefined,
  origin: string | null
): TurnSummaryCard["issues"] {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  return {
    count: n,
    label: `${n} ${n === 1 ? "issue" : "issues"} flagged this turn — review in Inspector`,
    url: origin ? `${origin}/issues` : null,
  };
}

function renderLink(text: string, url: string | null): string {
  return url ? `[${text}](${url})` : text;
}

/**
 * Render the card as a markdown block safe for terminals and chat. Returns ""
 * when the turn touched nothing besides chat bookkeeping.
 *
 * Shape:
 *   🧠 Neotoma · <instance> — [<conversation>](<url>)
 *   **Created (N)**
 *   - <icon> <label> ([<entity_type>](<url>))
 *   ...
 *   … N more — [full activity in Inspector](<url>)
 *   🐛 [N issues flagged this turn — review in Inspector](<url>)
 */
export function renderTurnSummaryFallbackText(card: TurnSummaryCard): string {
  if (card.total_count === 0) return "";
  const lines: string[] = [];

  let header = `${card.header.icon} ${card.header.title}`;
  if (card.header.instance) header += ` · ${escapeMarkdown(card.header.instance)}`;
  if (card.header.conversation_label) {
    header += ` — ${renderLink(escapeMarkdown(card.header.conversation_label), card.header.conversation_url)}`;
  }
  lines.push(header);

  for (const group of card.groups) {
    lines.push(`**${group.label} (${group.count})**`);
    for (const item of group.items) {
      const typeRef = renderLink(escapeMarkdown(item.entity_type), item.url);
      let line = `- ${item.icon} ${escapeMarkdown(item.label)} (${typeRef})`;
      if (item.note) line += ` — ${escapeMarkdown(item.note)}`;
      lines.push(line);
    }
  }

  if (card.more) {
    const target = card.more.url ? renderLink(card.more.label, card.more.url) : card.more.label;
    lines.push(`… ${card.more.count} more — ${target}`);
  }

  if (card.issues) {
    lines.push(`${iconForEntityType("issue")} ${renderLink(card.issues.label, card.issues.url)}`);
  }

  return lines.join("\n");
}
