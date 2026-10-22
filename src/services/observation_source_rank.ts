/**
 * observation_source_rank.ts
 *
 * The one place an `observation_source_priority` list becomes a rank lookup,
 * shared by the reducer (`src/reducers/observation_reducer.ts`) and legacy
 * lifecycle visibility (`entity_lifecycle_authority.ts`) so the two cannot
 * disagree. Kept free of runtime imports so modules that mock
 * `schema_registry.js` in tests still get the real ranking.
 */

import type { ObservationSourceRankValue } from "./schema_registry.js";

/**
 * Convert an `observation_source_priority` list into a rank lookup where a
 * lower number wins. Values the list does not name are absent from the map
 * and callers rank them last.
 *
 * #2241: when the list does not name `unspecified`, it shares `llm_summary`'s
 * rank. Before #2241 an omitted `observation_source` was stored as
 * `llm_summary`, so existing rows written by callers that omitted the field
 * say `llm_summary`, and the same callers' writes now say `unspecified`. The
 * reducer applies this rank BEFORE recency on `highest_priority` and
 * `most_specific` fields, so ranking `unspecified` last would make a newer
 * omitted-source write lose to an older one. Sharing the tier keeps omission
 * ranked exactly as before and lets recency decide between the two, while the
 * stored label stays honest. A list that names `unspecified` explicitly is
 * honoured as written. Revisit once legacy `llm_summary` defaults can be told
 * apart from explicit ones (the historical backfill).
 */
export function buildObservationSourceRankMap(
  order: readonly ObservationSourceRankValue[]
): Map<string, number> {
  const rank = new Map<string, number>();
  order.forEach((value, index) => {
    rank.set(value, index);
  });
  if (!rank.has("unspecified") && rank.has("llm_summary")) {
    rank.set("unspecified", rank.get("llm_summary")!);
  }
  return rank;
}
