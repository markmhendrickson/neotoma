/** Matches Neotoma local / unauthenticated dev API user. */
export const LOCAL_DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

export function formatInspectorUserId(userId: string): string {
  return userId === LOCAL_DEV_USER_ID ? "Local user" : userId;
}

export function formatInspectorUserBadge(
  email: string | undefined | null,
  userId: string,
  sharedGraph?: boolean
): string {
  const trimmed = email?.trim();
  if (trimmed) return trimmed;
  // #2228 residual: under shared-graph, missing email means unknown signer —
  // never substitute the graph principal (that re-mislabels identity).
  if (sharedGraph) return "Unknown identity — sign in again";
  return formatInspectorUserId(userId);
}

/**
 * #2228: under shared-graph mode, `user_id` is the graph being operated on,
 * NOT the signed-in person — the id must never be labeled in a way that lets
 * it read as the viewer's own identity. Shared by the Settings page and the
 * sidebar footer, the two surfaces that display this id.
 */
export function inspectorUserIdLabel(sharedGraph: boolean | undefined): string {
  return sharedGraph ? "Graph User ID" : "User ID";
}

/** Same rule as {@link inspectorUserIdLabel}, for the tooltip/detail variant. */
export function inspectorUserIdDetailLabel(sharedGraph: boolean | undefined): string {
  return sharedGraph ? "Shared graph User ID" : "User ID";
}

/**
 * Relationship types are NOT hardcoded here (#1972 / G25).
 *
 * This was a 28-member literal — one of sixteen copies of the same vocabulary,
 * any of which could drift from the enforcement point with no test failing.
 * The vocabulary is now a runtime registry; call `list_relationship_types` and
 * render what comes back.
 *
 * DELIBERATELY NO HARDCODED FALLBACK. Falling back to a static list on fetch
 * failure would silently restore exactly the bug this change removes — the UI
 * would look fine while offering a vocabulary the server does not have. Render
 * an error instead.
 */
export const RELATIONSHIP_TYPES_SOURCE_TOOL = "list_relationship_types" as const;

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  contact: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  person: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  transaction: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  receipt: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  invoice: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  task: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  event: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  note: "bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-200",
  document: "bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-200",
  conversation: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  agent_message: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  company: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  location: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  property: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
};

export const DEFAULT_ENTITY_COLOR = "bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200";

export function getEntityTypeColor(entityType: string): string {
  return ENTITY_TYPE_COLORS[entityType] ?? DEFAULT_ENTITY_COLOR;
}
