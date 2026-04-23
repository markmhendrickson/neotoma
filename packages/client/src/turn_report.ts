/**
 * Helpers for rendering the mandatory `🧠 Neotoma` turn report.
 *
 * The report contract is declared in the consumer-repo rule
 * `neotoma_turn_lifecycle.mdc` and echoes the display rule in the server
 * instructions. Agents MUST include this section in every user-visible
 * reply. This helper formats the markdown from structured data so callers
 * don't have to assemble it by hand.
 *
 * Groups:
 *   - `Conversation` — mandatory. Always rendered, containing the turn's
 *     stored `conversation`, user `conversation_message`, and (after reply is
 *     composed) assistant `conversation_message` entities (or legacy
 *     `agent_message` for pre-v0.6 data). Surfacing this bookkeeping
 *     is an explicit requirement — agents must show the conversational data
 *     persisted this turn.
 *   - `Reads` / `Created` / `Updated` — optional non-bookkeeping groups.
 *   - `Issues` — populated from diagnoses with non-`ok` severity.
 *   - `Repairs` — applied auto-repairs from `applyRepairs`.
 *
 * Every entity bullet includes a markdown link to the Neotoma Inspector
 * detail page for that entity (`<base>/entities/<entity_id>`). Callers can
 * override the base via `inspectorBaseUrl`; the default is
 * `http://localhost:5174` (the Inspector SPA's dev port).
 */

import type { Diagnosis } from "./diagnose.js";

export interface TurnReportEntity {
  /** The stable Neotoma entity_id. Required so the Inspector link resolves. */
  entityId?: string;
  /** Optional emoji override; falls back to the schema-type default. */
  emoji?: string;
  /** Short human-readable label (title, name, or descriptive fragment). */
  label: string;
  /** Neotoma entity_type (e.g. "task", "conversation_message"). */
  entityType: string;
}

export interface TurnReportConversationGroup {
  conversation?: TurnReportEntity;
  userMessage?: TurnReportEntity;
  assistantMessage?: TurnReportEntity;
}

export interface TurnReportRepairEntry {
  /** Short description of what was repaired. */
  label: string;
  /** Optional id of the stored `neotoma_repair` entity for link resolution. */
  repairEntityId?: string;
  /** Severity tag carried from the underlying diagnosis. */
  severity?: "ok" | "warning" | "error";
}

export interface TurnReportInput {
  /**
   * Mandatory conversation bookkeeping group. Agents always surface the
   * stored conversation/message entities so the user can inspect exactly
   * what was persisted this turn.
   */
  conversation?: TurnReportConversationGroup;
  created?: TurnReportEntity[];
  updated?: TurnReportEntity[];
  retrieved?: TurnReportEntity[];
  diagnoses?: Diagnosis[];
  repairs?: TurnReportRepairEntry[];
  /** Override for the Inspector base URL. Resolution order documented below. */
  inspectorBaseUrl?: string;
}

/**
 * Resolve the Inspector base URL. Prefers explicit argument, then
 * `NEOTOMA_INSPECTOR_URL`, then `NEOTOMA_FRONTEND_URL`, then the default
 * dev port `http://localhost:5174`.
 */
export function resolveInspectorBaseUrl(explicit?: string): string {
  if (explicit && explicit.length > 0) return stripTrailingSlash(explicit);
  const env =
    (typeof process !== "undefined" ? process.env : undefined) ??
    ({} as NodeJS.ProcessEnv);
  const fromEnv =
    env.NEOTOMA_INSPECTOR_URL ||
    env.NEOTOMA_FRONTEND_URL ||
    "http://localhost:5174";
  return stripTrailingSlash(fromEnv);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function renderTurnReport(input: TurnReportInput): string {
  const baseUrl = resolveInspectorBaseUrl(input.inspectorBaseUrl);

  const lines: string[] = [];
  lines.push("---");
  lines.push("");
  lines.push("🧠 Neotoma");
  lines.push("");

  const conversation = input.conversation ?? {};
  const convoEntities: TurnReportEntity[] = [
    conversation.userMessage,
    conversation.assistantMessage,
    conversation.conversation,
  ].filter((e): e is TurnReportEntity => Boolean(e));

  if (convoEntities.length > 0) {
    lines.push(`Conversation (${convoEntities.length})`);
    for (const e of convoEntities) {
      lines.push(`- ${formatEntityBullet(e, baseUrl)}`);
    }
    lines.push("");
  }

  const created = input.created ?? [];
  const updated = input.updated ?? [];
  const retrieved = input.retrieved ?? [];

  const anySubstantive =
    created.length > 0 || updated.length > 0 || retrieved.length > 0;

  if (anySubstantive) {
    if (retrieved.length > 0) {
      lines.push(`Reads (${retrieved.length})`);
      for (const e of retrieved) lines.push(`- ${formatEntityBullet(e, baseUrl)}`);
      lines.push("");
    }
    if (created.length > 0) {
      lines.push(`Created (${created.length})`);
      for (const e of created) lines.push(`- ${formatEntityBullet(e, baseUrl)}`);
      lines.push("");
    }
    if (updated.length > 0) {
      lines.push(`Updated (${updated.length})`);
      for (const e of updated) lines.push(`- ${formatEntityBullet(e, baseUrl)}`);
      lines.push("");
    }
  } else if (convoEntities.length > 0) {
    lines.push("No other durable facts read or written this turn.");
    lines.push("");
  } else {
    lines.push("No durable facts read or written this turn.");
    lines.push("");
  }

  const issues = (input.diagnoses ?? []).filter((d) => d.severity !== "ok");
  if (issues.length > 0) {
    lines.push(`Issues (${issues.length})`);
    for (const d of issues) {
      lines.push(`- ${formatIssueBullet(d)}`);
    }
    lines.push("");
  }

  const repairs = input.repairs ?? [];
  if (repairs.length > 0) {
    lines.push(`Repairs (${repairs.length})`);
    for (const r of repairs) {
      const prefix = r.severity === "error" ? "🔴" : r.severity === "warning" ? "🟡" : "🛠️";
      const link = r.repairEntityId
        ? ` ([inspect](${baseUrl}/entities/${r.repairEntityId}))`
        : "";
      lines.push(`- ${prefix} ${r.label}${link} (\`neotoma_repair\`)`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

function formatEntityBullet(entity: TurnReportEntity, baseUrl: string): string {
  const emoji = entity.emoji ?? pickDefaultEmoji(entity.entityType);
  const link = entity.entityId
    ? ` ([inspect](${baseUrl}/entities/${entity.entityId}))`
    : " (no id — see Issues)";
  return `${emoji} ${entity.label}${link} (\`${entity.entityType}\`)`;
}

function formatIssueBullet(diagnosis: Diagnosis): string {
  const prefix = diagnosis.severity === "error" ? "🔴" : "🟡";
  const parts = [`${prefix} ${diagnosis.message} (\`${diagnosis.id}\`)`];

  if (diagnosis.immediateMeaning) {
    parts.push(`Immediate: ${diagnosis.immediateMeaning}`);
  }
  if (diagnosis.ongoingRisk) {
    parts.push(`If unresolved: ${diagnosis.ongoingRisk}`);
  }
  if (diagnosis.recommendedResolution) {
    parts.push(`Recommended resolution: ${diagnosis.recommendedResolution}`);
  }

  return parts.join(" — ");
}

function pickDefaultEmoji(entityType: string): string {
  const map: Record<string, string> = {
    task: "✅",
    contact: "👤",
    person: "👤",
    company: "🏢",
    event: "📅",
    email_message: "✉️",
    receipt: "🧾",
    invoice: "🧾",
    transaction: "💸",
    note: "📝",
    location: "📍",
    place: "📍",
    file_asset: "📎",
    research: "🔍",
    competitive_analysis: "🔍",
    market_research: "🔍",
    legal_research: "🔍",
    technical_research: "🔍",
    report: "🔍",
    product_feedback: "💬",
    neotoma_repair: "🛠️",
    conversation: "🧵",
    conversation_message: "💬",
    // Legacy alias kept so historical rows stored under `agent_message`
    // still render with the chat-message emoji.
    agent_message: "💬",
  };
  return map[entityType] ?? "🗂️";
}
