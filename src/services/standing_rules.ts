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
 * Cap on rendered rule text in the instructions prose.
 *
 * Deliberately far larger than {@link INSTANCE_SKILLS_MAX_BYTES}: a skills
 * section is a CATALOG (names to fetch later), whereas a standing rule IS the
 * instruction. There is no "fetch the rest" step for a rule, so a budget tight
 * enough to drop one changes what the agent is told to do.
 */
export const STANDING_RULES_MAX_BYTES = 24000;

/**
 * Render the `[STANDING RULES]` section appended to the MCP instructions
 * block, or `null` when nothing should be appended.
 *
 * Why this exists: rules were delivered ONLY via `serverInfo._neotoma`, which
 * general MCP clients ignore — they surface `instructions` to the model and
 * drop unknown `serverInfo` keys. On a shared client instance that left three
 * enabled rules reaching no session, while two of them *appeared* to arrive
 * because a human had typed their titles into the instance policy's prose
 * (#2187). Hand-written mentions are not delivery; this renderer is.
 *
 * Rules are emitted IN FULL. Truncating an individual rule would hand the
 * agent a policy that reads as complete but silently stops mid-instruction —
 * worse than a visible omission, which is why over-budget rules are dropped
 * whole and counted in a trailing notice rather than clipped.
 *
 * @param rules   Projection from {@link getActiveStandingRulesResult}, already
 *                ordered by priority. Order is preserved, so a budget cut
 *                drops the lowest-priority rules rather than arbitrary ones.
 */
export function renderStandingRulesSection(rules: StandingRule[]): string | null {
  if (rules.length === 0) return null;

  const lines: string[] = [];
  let budget = 0;
  let rendered = 0;

  for (const rule of rules) {
    const title = rule.title.trim();
    const text = rule.rule_text.trim();
    const scope = rule.scope?.trim();
    // Scope is shown because a rule's applicability is part of the rule: an
    // agent told to apply an instance-wide rule to one entity type, or the
    // reverse, misapplies it in a way the rule text alone will not reveal.
    const entry = scope ? `### ${title}\n(scope: ${scope})\n${text}` : `### ${title}\n${text}`;

    const cost = Buffer.byteLength(entry, "utf8") + 2;
    // Always emit the first (highest-priority) rule, even if it alone exceeds
    // the budget: a section announcing rules and then listing none is strictly
    // worse than one oversized rule.
    if (rendered > 0 && budget + cost > STANDING_RULES_MAX_BYTES) break;

    lines.push(entry);
    budget += cost;
    rendered += 1;
  }

  const omitted = rules.length - rendered;

  const header =
    "[STANDING RULES]\n" +
    `This instance has ${rules.length} standing rule${rules.length === 1 ? "" : "s"} in force, ` +
    "listed below in priority order. They are operator-set instructions for THIS instance and " +
    "apply from the first turn of this session — you do not need to be reminded of them again, " +
    "and the user does not need to restate them. Where a rule constrains an action you are " +
    "about to take, follow the rule. Where a rule conflicts with a general habit of yours, the " +
    "rule wins. These are also available verbatim in `serverInfo._neotoma.standing_rules`.";

  // Name the dropped rules rather than only counting them: an agent that knows
  // a rule exists can retrieve it, whereas a bare count is unactionable.
  const footer =
    omitted > 0
      ? `\n\n…and ${omitted} further rule${omitted === 1 ? "" : "s"} omitted for length: ` +
        rules
          .slice(rendered)
          .map((r) => r.title.trim())
          .join("; ") +
        ". Retrieve them with `retrieve_entities` (entity_type: standing_rule) before acting in " +
        "the areas they cover."
      : "";

  return `${header}\n\n${lines.join("\n\n")}${footer}`;
}
