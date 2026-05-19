import type { RecordActivityType } from "@/types/api";

/** Inspector /search tab ids — one primitive per tab. */
export const SEARCH_PRIMITIVE_KINDS = [
  "entities",
  "entity_snapshots",
  "sources",
  "observations",
  "interpretations",
  "relationships",
  "timeline_events",
] as const;

export type SearchPrimitiveKind = (typeof SEARCH_PRIMITIVE_KINDS)[number];

export const DEFAULT_SEARCH_PRIMITIVE_KIND: SearchPrimitiveKind = "entities";

export const SEARCH_PRIMITIVE_LABELS: Record<SearchPrimitiveKind, string> = {
  entities: "Entities",
  entity_snapshots: "Snapshots",
  sources: "Sources",
  observations: "Observations",
  interpretations: "Interpretations",
  relationships: "Relationships",
  timeline_events: "Timeline",
};

export function isSearchPrimitiveKind(value: string | null | undefined): value is SearchPrimitiveKind {
  return (
    typeof value === "string" &&
    (SEARCH_PRIMITIVE_KINDS as readonly string[]).includes(value)
  );
}

export function recordActivityTypeForKind(
  kind: SearchPrimitiveKind,
): RecordActivityType | null {
  switch (kind) {
    case "observations":
      return "observation";
    case "interpretations":
      return "interpretation";
    case "relationships":
      return "relationship";
    case "timeline_events":
      return "timeline_event";
    default:
      return null;
  }
}

export function usesDedicatedSearchApi(kind: SearchPrimitiveKind): boolean {
  return kind === "entities" || kind === "entity_snapshots" || kind === "sources";
}
