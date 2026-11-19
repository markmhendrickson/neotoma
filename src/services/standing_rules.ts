/**
 * Standing rules service.
 *
 * Loads `standing_rule` entities for a user and returns them in priority
 * order so callers can inject them into agent context at session start.
 *
 * A "standing rule" is a persistent agent instruction stored in Neotoma.
 * Rules with `enabled: false` in their snapshot are excluded. Rules are
 * ordered by `priority` descending (highest first); ties are broken by
 * `canonical_name` ascending for deterministic output.
 *
 * This service is read-only and must never issue writes or side effects.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";

/** Minimal projection of a `standing_rule` entity injected at session start. */
export interface StandingRule {
  entity_id: string;
  title: string;
  rule_text: string;
  scope?: string;
  priority: number;
}

/**
 * Standing rules plus whether the lookup itself succeeded. Prefer this over
 * {@link getActiveStandingRules} anywhere the result is shown to an agent or
 * an operator, so a lookup failure is never rendered as an empty policy.
 */
export async function getActiveStandingRulesResult(
  userId: string
): Promise<{ rules: StandingRule[]; lookup_failed: boolean; error?: string }> {
  return lookupActiveStandingRules(userId);
}

/**
 * Return all active `standing_rule` entities for `userId`, ordered by
 * priority descending then canonical_name ascending.
 *
 * Returns an empty array on any error so session initialisation is never
 * blocked by a rules-query failure.
 *
 * IMPORTANT: an empty array is ambiguous on its own — it means either "this
 * user has no standing rules" or "the lookup failed". Those are very different
 * conditions: the first is normal, the second is a silent policy bypass, and
 * conflating them is exactly why #2131 went unnoticed. Callers that surface
 * standing rules to an agent should use {@link getActiveStandingRulesResult}
 * and report the failure rather than presenting it as an empty policy.
 */
export async function getActiveStandingRules(userId: string): Promise<StandingRule[]> {
  return (await lookupActiveStandingRules(userId)).rules;
}

/**
 * Single implementation shared by {@link getActiveStandingRules} and
 * {@link getActiveStandingRulesResult}. The failure signal is carried on this
 * call's own return value, not on module-level state: an earlier version of
 * this function recorded failure on a shared mutable variable that was reset
 * and read across `await` boundaries, which let one concurrent caller's
 * result leak into another's under interleaved `initialize` requests for
 * different users (MCP sessions run concurrently). Returning `{ rules,
 * lookup_failed, error? }` directly from this call keeps each invocation's
 * outcome local to that invocation.
 */
async function lookupActiveStandingRules(
  userId: string
): Promise<{ rules: StandingRule[]; lookup_failed: boolean; error?: string }> {
  try {
    // Read the reduced field values straight off entity_snapshots. This used
    // to join from `entities` with the PostgREST embedded-resource hint
    // `entity_snapshots!inner(snapshot)`, which only the Supabase backend
    // understands: libSQL forwards it into SQL and fails with
    // `unrecognized token: "!"`. Because this function swallows errors to
    // avoid blocking session init, that failure was silent and every session
    // on a libSQL instance received zero standing rules while storage and
    // retrieval both reported success (#2131).
    //
    // entity_snapshots already carries entity_id, canonical_name, user_id and
    // entity_type, so no join is needed for what we return.
    const { data, error } = await db
      .from("entity_snapshots")
      .select("entity_id, canonical_name, snapshot")
      .eq("user_id", userId)
      .eq("entity_type", "standing_rule");

    // entity_snapshots carries no merge pointer, so exclude merged-away rules
    // with a second bounded lookup rather than dropping the filter. A failure
    // here must not suppress rules: fall back to injecting everything found,
    // since a stale merged rule is a lesser harm than no rules at all.
    let mergedAway = new Set<string>();
    if (!error && data && (data as unknown[]).length > 0) {
      const { data: mergedRows, error: mergedErr } = await db
        .from("entities")
        .select("id, merged_to_entity_id")
        .eq("user_id", userId)
        .eq("entity_type", "standing_rule");
      if (mergedErr) {
        logger.warn(
          `[standing_rules] merge-filter lookup failed (${mergedErr.message}); injecting unfiltered`
        );
      } else if (mergedRows) {
        mergedAway = new Set(
          (mergedRows as Array<{ id: string; merged_to_entity_id: string | null }>)
            .filter((r) => r.merged_to_entity_id != null)
            .map((r) => r.id)
        );
      }
    }

    if (error) {
      // error, not warn: a failed lookup means no rule reaches the session,
      // which is a policy bypass rather than a degraded read.
      logger.error(
        `[standing_rules] LOOKUP FAILED — no rules will be injected this session ` +
          `(this is NOT the same as having no rules configured): ${error.message}`
      );
      return { rules: [], lookup_failed: true, error: error.message };
    }

    if (!data || data.length === 0) {
      return { rules: [], lookup_failed: false };
    }

    const rules: StandingRule[] = [];

    for (const row of data as Array<{
      entity_id: string;
      canonical_name: string;
      snapshot: Record<string, unknown> | string | null;
    }>) {
      // Backends differ on whether a JSON column arrives parsed or as text.
      let snap: Record<string, unknown> = {};
      if (typeof row.snapshot === "string") {
        try {
          snap = JSON.parse(row.snapshot) as Record<string, unknown>;
        } catch {
          continue;
        }
      } else if (row.snapshot && typeof row.snapshot === "object") {
        snap = row.snapshot;
      }

      // Skip rules merged into another entity.
      if (mergedAway.has(row.entity_id)) continue;

      // Skip disabled rules.
      if (snap["enabled"] === false) continue;

      const title = typeof snap["title"] === "string" ? snap["title"] : row.canonical_name;
      const ruleText = typeof snap["rule_text"] === "string" ? snap["rule_text"] : null;

      // Skip rules without usable rule_text.
      if (!ruleText) continue;

      rules.push({
        entity_id: row.entity_id,
        title,
        rule_text: ruleText,
        scope: typeof snap["scope"] === "string" ? snap["scope"] : undefined,
        priority: typeof snap["priority"] === "number" ? snap["priority"] : 0,
      });
    }

    // Sort: priority descending, then title ascending for deterministic order.
    rules.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.title.localeCompare(b.title);
    });

    return { rules, lookup_failed: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[standing_rules] unexpected error: ${msg}`);
    // A thrown exception is a failed lookup, not an empty one. Report it the
    // same way a `{ error }`-shaped query result is reported, so callers see
    // `lookup_failed` rather than a bare empty array they cannot distinguish
    // from "this user has no rules".
    return { rules: [], lookup_failed: true, error: msg };
  }
}

/**
 * Cap, in UTF-8 bytes, on the rule entries rendered into the instructions
 * prose.
 *
 * Deliberately far larger than {@link INSTANCE_SKILLS_MAX_BYTES}: a skills
 * section is a CATALOG (names to fetch later), whereas a standing rule IS the
 * instruction. The cap applies to EVERY rule, the first included: a rule whose
 * full entry does not fit is replaced by a one-line notice, so no single rule
 * can push later rules or the omission notice out of the payload.
 */
export const STANDING_RULES_MAX_BYTES = 24000;

/**
 * Scope guidance, emitted as the first line after the section tag. It stands
 * on its own (it does not depend on anything after it) and sits ahead of every
 * rule, so a client that truncates the payload anywhere after the opening
 * lines still tells the agent how to apply whatever rules it did receive.
 */
export const STANDING_RULES_SCOPE_GUIDANCE =
  "Scope: rules with global or empty scope apply to every request. Rules with any other " +
  "scope apply only when the current context matches that scope.";

/** Longest rule title quoted in an omission notice, in UTF-8 bytes. */
const OMITTED_TITLE_MAX_BYTES = 200;

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Clip `s` to at most `max` UTF-8 bytes on a code-point boundary. */
function clipUtf8(s: string, max: number): string {
  if (utf8Bytes(s) <= max) return s;
  let out = "";
  let used = 0;
  for (const ch of s) {
    const n = utf8Bytes(ch);
    if (used + n > max - 3) break;
    out += ch;
    used += n;
  }
  return `${out}...`;
}

function renderRuleEntry(rule: StandingRule): string {
  const title = rule.title.trim();
  const text = rule.rule_text.trim();
  const scope = rule.scope?.trim();
  // Scope is shown because a rule's applicability is part of the rule: an
  // agent told to apply an instance-wide rule to one entity type, or the
  // reverse, misapplies it in a way the rule text alone will not reveal.
  const head = `### ${title} (entity_id: ${rule.entity_id})`;
  return scope ? `${head}\n(scope: ${scope})\n${text}` : `${head}\n${text}`;
}

/**
 * One complete line standing in for a rule whose body did not fit. It names
 * the rule and says where the full text is, so the omission is actionable.
 */
function renderOmittedRuleNotice(rule: StandingRule): string {
  const title = clipUtf8(rule.title.trim(), OMITTED_TITLE_MAX_BYTES);
  return (
    `### ${title} (entity_id: ${rule.entity_id}): body omitted for size; fetch the full text ` +
    `with retrieve_entity_snapshot (entity_id: ${rule.entity_id}) before acting in its area.`
  );
}

/**
 * Render the `[STANDING RULES]` section placed ahead of the MCP instructions
 * block, or `null` when there are no rules.
 *
 * Why this exists: rules were delivered ONLY via `serverInfo._neotoma`, which
 * general MCP clients ignore. They surface `instructions` to the model and
 * drop unknown `serverInfo` keys (#2187). Hand-written mentions in policy
 * prose are not delivery; this renderer is.
 *
 * Budget, fail closed: each rule is emitted in full when its entry fits in
 * what is left of {@link STANDING_RULES_MAX_BYTES} after reserving a notice
 * line for every later rule. Otherwise it is replaced by a one-line notice.
 * A rule body is never clipped mid-text, and no rule (the first included) can
 * hide a later rule or the closing omission notice.
 *
 * @param rules   Projection from {@link getActiveStandingRulesResult}, already
 *                ordered by priority. Order is preserved.
 */
export function renderStandingRulesSection(rules: StandingRule[]): string | null {
  if (rules.length === 0) return null;

  const notices = rules.map(renderOmittedRuleNotice);
  const noticeCosts = notices.map((n) => utf8Bytes(n) + 2);
  // reserveAfter[i] = bytes needed to emit notices for every rule after i.
  const reserveAfter: number[] = new Array(rules.length).fill(0);
  for (let i = rules.length - 2; i >= 0; i--) {
    reserveAfter[i] = reserveAfter[i + 1] + noticeCosts[i + 1];
  }

  const lines: string[] = [];
  const omittedTitles: string[] = [];
  let used = 0;

  rules.forEach((rule, i) => {
    const entry = renderRuleEntry(rule);
    const cost = utf8Bytes(entry) + 2;
    if (used + cost + reserveAfter[i] <= STANDING_RULES_MAX_BYTES) {
      lines.push(entry);
      used += cost;
    } else {
      // Notices are emitted even past the cap: hiding a rule's existence is
      // the outcome this budget exists to prevent.
      lines.push(notices[i]);
      used += noticeCosts[i];
      omittedTitles.push(clipUtf8(rule.title.trim(), OMITTED_TITLE_MAX_BYTES));
    }
  });

  const header =
    "[STANDING RULES]\n" +
    `${STANDING_RULES_SCOPE_GUIDANCE}\n` +
    `This instance has ${rules.length} standing rule${rules.length === 1 ? "" : "s"} in force, ` +
    "listed below in priority order. They are operator-set instructions for THIS instance and " +
    "apply from the first turn of this session. You do not need to be reminded of them again, " +
    "and the user does not need to restate them. Where a rule constrains an action you are " +
    "about to take, follow the rule. Where a rule conflicts with a general habit of yours, the " +
    "rule wins. These are also available verbatim in `serverInfo._neotoma.standing_rules`.";

  const footer =
    omittedTitles.length > 0
      ? `\n\n${omittedTitles.length} rule${omittedTitles.length === 1 ? "" : "s"} above had ` +
        `${omittedTitles.length === 1 ? "its body" : "their bodies"} omitted for size: ` +
        omittedTitles.join("; ") +
        ". Fetch the full text with `retrieve_entity_snapshot` before acting in the areas they cover."
      : "";

  return `${header}\n\n${lines.join("\n\n")}${footer}`;
}
