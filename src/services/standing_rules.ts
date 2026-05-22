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
 */
export async function getActiveStandingRules(userId: string): Promise<StandingRule[]> {
  try {
    // Join entities + entity_snapshots to get the reduced field values.
    // We select only the columns we need so the payload stays small.
    const { data, error } = await db
      .from("entities")
      .select("id, canonical_name, entity_snapshots!inner(snapshot)")
      .eq("user_id", userId)
      .eq("entity_type", "standing_rule")
      .is("merged_to_entity_id", null);

    if (error) {
      logger.warn(`[standing_rules] query failed: ${error.message}`);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const rules: StandingRule[] = [];

    for (const row of data as Array<{
      id: string;
      canonical_name: string;
      entity_snapshots:
        | { snapshot: Record<string, unknown> }
        | Array<{ snapshot: Record<string, unknown> }>;
    }>) {
      // entity_snapshots can come back as a single object (inner join, one row)
      // or as an array depending on the Supabase client version.
      const snapHolder = Array.isArray(row.entity_snapshots)
        ? row.entity_snapshots[0]
        : row.entity_snapshots;
      const snap = snapHolder?.snapshot ?? {};

      // Skip disabled rules.
      if (snap["enabled"] === false) continue;

      const title = typeof snap["title"] === "string" ? snap["title"] : row.canonical_name;
      const ruleText = typeof snap["rule_text"] === "string" ? snap["rule_text"] : null;

      // Skip rules without usable rule_text.
      if (!ruleText) continue;

      rules.push({
        entity_id: row.id,
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
