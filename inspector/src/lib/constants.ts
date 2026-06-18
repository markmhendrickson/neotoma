/** Matches Neotoma local / unauthenticated dev API user. */
export const LOCAL_DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

export function formatInspectorUserId(userId: string): string {
  return userId === LOCAL_DEV_USER_ID ? "Local user" : userId;
}

export function formatInspectorUserBadge(email: string | undefined | null, userId: string): string {
  const trimmed = email?.trim();
  if (trimmed) return trimmed;
  return formatInspectorUserId(userId);
}

export const RELATIONSHIP_TYPES = [
  "PART_OF",
  "CORRECTS",
  "REFERS_TO",
  "SETTLES",
  "DUPLICATE_OF",
  "DEPENDS_ON",
  "SUPERSEDES",
  "EMBEDS",
  "works_at",
  "owns",
  "manages",
  "part_of",
  "related_to",
  "depends_on",
  "references",
  "transacted_with",
  "member_of",
  "reports_to",
  "located_at",
  "created_by",
  "funded_by",
  "acquired_by",
  "subsidiary_of",
  "partner_of",
  "competitor_of",
  "supplies_to",
  "contracted_with",
  "invested_in",
] as const;

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
