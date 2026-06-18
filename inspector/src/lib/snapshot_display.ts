import { humanizeKey } from "./humanize";

const SNAPSHOT_FIELD_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  conversation: {
    conversation_id: "Conversation ID",
    canonical_name: "Stored label (legacy)",
  },
  conversation_message: {
    turn_key: "Turn key",
  },
};

/** Hide redundant snapshot fields in friendly (non-developer) view. */
export function filterSnapshotKeysForDisplay(
  keys: string[],
  snapshot: Record<string, unknown>,
  entityType?: string | null,
  developerView?: boolean,
): string[] {
  if (developerView) return keys;
  if (entityType === "conversation") {
    const hasTitle =
      typeof snapshot.title === "string" && snapshot.title.trim().length > 0;
    if (hasTitle) return keys.filter((k) => k !== "canonical_name");
  }
  return keys;
}

export function snapshotFieldDisplayLabel(
  fieldKey: string,
  entityType?: string | null,
  developerView?: boolean,
): string {
  if (developerView) return fieldKey;
  const overrides = entityType ? SNAPSHOT_FIELD_LABEL_OVERRIDES[entityType] : undefined;
  return overrides?.[fieldKey] ?? humanizeKey(fieldKey);
}
