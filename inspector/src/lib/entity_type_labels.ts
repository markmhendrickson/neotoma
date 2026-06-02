import { humanizeEntityType } from "./humanize";

/** Neotoma entity ids use the `ent_` prefix plus hex. */
export function isEntityIdSegment(segment: string): boolean {
  return /^ent_[0-9a-f]+$/i.test(segment.trim());
}

/** Canonical list URL for one entity type (e.g. `/entities/task`). */
export function entityTypeListPath(entityType: string): string {
  return `/entities/${encodeURIComponent(entityType.trim())}`;
}

/** Entity type slug from `/entities/<type>` when the segment is not an entity id. */
export function parseEntityTypeFromListPath(pathname: string): string | null {
  const match = pathname.match(/^\/entities\/([^/]+)$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]!);
  if (!slug || isEntityIdSegment(slug) || slug === "correct") return null;
  return slug;
}

const PLURAL_ENTITY_TYPE_LABELS: Record<string, string> = {
  crypto_transaction: "Crypto transactions",
  tax_filing: "Tax filings",
  fixed_cost: "Fixed costs",
  daily_triage: "Daily triages",
  person: "People",
  company: "Companies",
};

function pluralizeEnglishWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (lower.endsWith("y") && word.length > 1 && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies";
  }
  if (/(?:s|x|z|ch|sh)$/i.test(lower)) {
    return word + "es";
  }
  if (lower.endsWith("s")) return word;
  return word + "s";
}

/** Human-readable plural label for an entity type (e.g. `task` → `Tasks`). */
export function pluralizeEntityTypeLabel(
  entityType: string,
  schemaLabel?: string | null,
): string {
  const trimmed = entityType.trim();
  if (PLURAL_ENTITY_TYPE_LABELS[trimmed]) {
    return PLURAL_ENTITY_TYPE_LABELS[trimmed]!;
  }
  const singular = humanizeEntityType(trimmed, schemaLabel);
  if (!singular) return humanizeEntityType(trimmed) || trimmed;
  const parts = singular.split(/\s+/);
  if (parts.length === 0) return singular;
  const lastIndex = parts.length - 1;
  parts[lastIndex] = pluralizeEnglishWord(parts[lastIndex]!);
  return parts.join(" ");
}
