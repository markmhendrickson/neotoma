/**
 * Seed the built-in relationship-type vocabulary (#1972 / G25).
 *
 * These 28 names were, until this change, a hardcoded `Set` in
 * `../relationships.ts` plus fifteen hand-maintained copies elsewhere. They are
 * now DATA, and this file is the single literal that remains — the one the
 * anti-regression lint (`tests/contract/relationship_type_single_source.test.ts`)
 * exempts. Every other copy in the tree was deleted; if one comes back, that
 * lint fails.
 *
 * ── SAFETY CONTRACT ────────────────────────────────────────────────────────
 *
 * Copied verbatim in spirit from `schema_registry_bootstrap.ts`: strictly
 * ADDITIVE, never overwrites, downgrades, or re-activates over an existing
 * registration. Only types with NO effective registration are seeded. An
 * operator who deliberately deregistered a built-in type, or re-registered it
 * with different metadata, must not have that reverted on the next redeploy —
 * and because this registry is append-only, a re-seed would otherwise write a
 * NEWER row that silently wins.
 *
 * Boot-safety: best-effort, never blocks startup. The caller wraps this in
 * try/catch, matching the other boot-time seeders in `src/actions.ts`.
 */

import { relationshipTypeRegistry } from "./registry.js";
import type { RelationshipTypeDefinition } from "./registry.js";

interface BuiltInRelationshipType extends RelationshipTypeDefinition {
  relationship_type: string;
}

/**
 * The built-in vocabulary. Both casings are present and both stay: `PART_OF`
 * and `part_of` are distinct members, as are `DEPENDS_ON` and `depends_on`.
 * Collapsing those near-duplicates is a separate change with real migration
 * cost against existing edges, and nothing here removes anything.
 *
 * `acyclic` is set ONLY on the two types whose semantics are a hierarchy.
 * Everything else is left unflagged, which means the cycle check does not run
 * for it — see the `acyclic` field docs in registry.ts for why a type-blind
 * check was worse than no check.
 */
export const BUILT_IN_RELATIONSHIP_TYPES: BuiltInRelationshipType[] = [
  {
    relationship_type: "PART_OF",
    description: "Structural containment: the source is a component of the target.",
    acyclic: true,
  },
  {
    relationship_type: "CORRECTS",
    description: "The source supersedes or amends the target with a correction.",
  },
  {
    relationship_type: "REFERS_TO",
    description: "The source mentions or cites the target.",
  },
  {
    relationship_type: "SETTLES",
    description: "The source resolves or discharges the target.",
  },
  {
    relationship_type: "DUPLICATE_OF",
    description: "The source and target describe the same thing.",
    symmetric: true,
  },
  {
    relationship_type: "DEPENDS_ON",
    description: "The source cannot proceed until the target is satisfied.",
    acyclic: true,
  },
  {
    relationship_type: "SUPERSEDES",
    description: "The source replaces the target as the current version.",
  },
  {
    relationship_type: "EMBEDS",
    description:
      "A container entity embeds an asset entity: source = container (post, document), " +
      "target = asset (image, attachment).",
  },
  { relationship_type: "works_at", description: "A person works at an organization." },
  { relationship_type: "owns", description: "The source owns the target." },
  { relationship_type: "manages", description: "The source manages the target." },
  { relationship_type: "part_of", description: "Lowercase variant of PART_OF." },
  { relationship_type: "related_to", description: "Generic association.", symmetric: true },
  { relationship_type: "depends_on", description: "Lowercase variant of DEPENDS_ON." },
  { relationship_type: "references", description: "The source references the target." },
  { relationship_type: "transacted_with", description: "A transaction occurred between the two." },
  { relationship_type: "member_of", description: "The source is a member of the target group." },
  { relationship_type: "reports_to", description: "Reporting line from source to target." },
  { relationship_type: "located_at", description: "The source is located at the target place." },
  { relationship_type: "created_by", description: "The source was created by the target." },
  { relationship_type: "funded_by", description: "The source was funded by the target." },
  { relationship_type: "acquired_by", description: "The source was acquired by the target." },
  { relationship_type: "subsidiary_of", description: "The source is a subsidiary of the target." },
  { relationship_type: "partner_of", description: "Partnership between the two.", symmetric: true },
  {
    relationship_type: "competitor_of",
    description: "Competitive relationship.",
    symmetric: true,
  },
  { relationship_type: "supplies_to", description: "The source supplies the target." },
  { relationship_type: "contracted_with", description: "A contract exists between the two." },
  { relationship_type: "invested_in", description: "The source has invested in the target." },
];

export interface RelationshipTypeSeedSummary {
  /** Types newly registered because nothing was registered for them. */
  registered: string[];
  /** Types left untouched because an effective registration already exists. */
  preserved: string[];
  /** Types that failed to seed (non-fatal; boot continues). */
  failed: Array<{ relationship_type: string; error: string }>;
}

/**
 * Register every built-in relationship type that has no effective global
 * registration. Idempotent: a second run reports every type as `preserved` and
 * issues no writes.
 */
export async function seedBuiltInRelationshipTypes(): Promise<RelationshipTypeSeedSummary> {
  const summary: RelationshipTypeSeedSummary = { registered: [], preserved: [], failed: [] };

  // One read for the whole seed pass, rather than one per type. This is also
  // what makes the pass ADDITIVE: a type that has ANY effective row — active
  // or deliberately deactivated — is skipped outright.
  let existing: Set<string>;
  try {
    const rows = await relationshipTypeRegistry.list({ include_deactivated: true });
    existing = new Set(rows.map((r) => r.relationship_type));
  } catch (err) {
    // No registry to read means nothing to preserve; attempt every type and let
    // per-type failures accumulate below rather than aborting the boot seeder.
    existing = new Set();
    void err;
  }

  for (const builtIn of BUILT_IN_RELATIONSHIP_TYPES) {
    if (existing.has(builtIn.relationship_type)) {
      summary.preserved.push(builtIn.relationship_type);
      continue;
    }
    try {
      const { relationship_type, ...definition } = builtIn;
      await relationshipTypeRegistry.register({
        relationship_type,
        ...definition,
        scope: "global",
        // Seeded rows are attributed to the instance itself, not to a user.
        created_by: null,
        // The built-in vocabulary CONTAINS the grandfathered case pairs
        // (PART_OF/part_of, DEPENDS_ON/depends_on). The case-collision guard
        // exists to stop NEW near-duplicates, not to reject the two the
        // substrate already shipped.
        allow_case_variant: true,
        // A stable version string keeps a concurrent double-seed colliding on
        // the UNIQUE index rather than writing two rows a millisecond apart.
        registry_version: "builtin-1.0",
      });
      summary.registered.push(relationship_type);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // A UNIQUE-index collision means a concurrent boot won the race and the
      // type IS registered — that is a success, not a failure.
      if (/unique|duplicate|already exists|constraint/i.test(message)) {
        summary.preserved.push(builtIn.relationship_type);
        continue;
      }
      summary.failed.push({ relationship_type: builtIn.relationship_type, error: message });
    }
  }

  return summary;
}
