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
/**
 * Message from the most recent failed standing-rules lookup, or null when the
 * last lookup succeeded. Lets the caller distinguish "no rules" from "could
 * not read rules" without changing the array-returning API.
 */
let lastLookupFailure: string | null = null;

/**
 * Standing rules plus whether the lookup itself succeeded. Prefer this over
 * {@link getActiveStandingRules} anywhere the result is shown to an agent or
 * an operator, so a lookup failure is never rendered as an empty policy.
 */
export async function getActiveStandingRulesResult(
  userId: string
): Promise<{ rules: StandingRule[]; lookup_failed: boolean; error?: string }> {
  const rules = await getActiveStandingRules(userId);
  return lastLookupFailure
    ? { rules, lookup_failed: true, error: lastLookupFailure }
    : { rules, lookup_failed: false };
}

export async function getActiveStandingRules(userId: string): Promise<StandingRule[]> {
  // Reset per call: the marker must describe THIS lookup, not a previous one.
  lastLookupFailure = null;
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
      lastLookupFailure = error.message;
      return [];
    }

    if (!data || data.length === 0) {
      return [];
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

    return rules;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[standing_rules] unexpected error: ${msg}`);
    return [];
  }
}
