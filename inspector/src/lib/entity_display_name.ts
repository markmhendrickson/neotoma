/**
 * Human-readable display label for an entity in the Inspector.
 *
 * The entity list, search, and board views previously rendered
 * `canonical_name || snapshot.name || snapshot.title`. That is wrong whenever
 * canonical_name is an *identity key* rather than a label — e.g. on the
 * Bottega8 leads graph a contact's canonical_name is `contact:<name>` or, once
 * keyed on LinkedIn URL (issue #2018), `contact:https://www.linkedin.com/...`.
 * Rendering canonical-first surfaced those keys (and, earlier, emoji) as the
 * person's name.
 *
 * This mirrors the shared `getEntityDisplayName` precedence
 * (src/shared/entity_display_name.ts): prefer real snapshot fields over the
 * canonical key, and lead with `name` for person-like types so a contact shows
 * "Rani Sweis", not their job title "Chief Creative". Kept as a small
 * Inspector-local copy because the Inspector build has no path alias to the
 * top-level shared module.
 */

/** Entity types representing a person — name is the label, title is a role. */
const PERSON_LIKE_TYPES: ReadonlySet<string> = new Set(["contact", "person", "lead"]);

interface DisplayInput {
  entity_type?: string | null;
  canonical_name?: string | null;
  snapshot?: Record<string, unknown> | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Resolve the best display label. Falls back to canonical_name, then the
 * provided `fallback` (typically a truncated id), then an em dash.
 */
export function entityDisplayName(entity: DisplayInput, fallback?: string): string {
  const snap = entity.snapshot ?? {};
  const name = str(snap.name);
  const title = str(snap.title);
  const type = entity.entity_type ?? "";

  if (PERSON_LIKE_TYPES.has(type)) {
    if (name) return name;
    if (title) return title;
  } else {
    if (title) return title;
    if (name) return name;
  }

  return str(entity.canonical_name) ?? fallback ?? "—";
}
