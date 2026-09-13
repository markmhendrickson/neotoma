/**
 * Instance skill discovery service.
 *
 * Loads `skill` entities for a user and returns a lightweight projection so
 * callers can surface them at MCP `initialize` time. This is the graph-backed
 * counterpart to the filesystem scan in `NeotomaServer.getAvailableSkills()`:
 * a hosted instance whose skills live in the graph has no `skills/` directory
 * on disk, so the filesystem scan returns nothing and MCP-only clients never
 * learn the instance's skills exist (issue #2046).
 *
 * DESCRIPTIONS ONLY. This service deliberately never returns the `content`
 * body or any script/executable asset. The `initialize` instructions block is
 * already large and there is an explicit compact mode because that weight is a
 * known problem; shipping full SKILL.md bodies to every connection would make
 * it worse for the majority of sessions that use no skills. Agents fetch a
 * body on demand via the documented retrieval path (see
 * {@link INSTANCE_SKILL_FETCH_HINT}). Materializing executable assets is out
 * of scope by design — execution consent is per-artifact and hash-pinned
 * elsewhere.
 *
 * This service is read-only and must never issue writes or side effects.
 */

import { db } from "../../db.js";
import { logger } from "../../utils/logger.js";
import { SKILL_ENTITY_TYPE } from "./seed_schema.js";

/** Minimal projection of a `skill` entity surfaced at session start. */
export interface InstanceSkill {
  entity_id: string;
  /** Canonical skill name — the value to pass to the retrieval path. */
  name: string;
  /** One-sentence description used for intent matching. May be empty. */
  description: string;
}

/**
 * Maximum number of skills rendered into the instructions block. An instance
 * with hundreds of skill rows must not be able to blow up the block.
 */
export const INSTANCE_SKILLS_MAX_COUNT = 25;

/**
 * Maximum total bytes of rendered skill lines in the instructions block.
 * Applied in addition to {@link INSTANCE_SKILLS_MAX_COUNT}; whichever binds
 * first wins.
 */
export const INSTANCE_SKILLS_MAX_BYTES = 4000;

/** Per-skill description cap, so one pathological row cannot dominate the budget. */
const DESCRIPTION_MAX_CHARS = 300;

/**
 * The existing, verified fetch path an agent uses to obtain a skill body.
 *
 * Verified against a live hosted instance: `retrieve_entity_by_identifier`
 * with `entity_type: "skill"` and `by: "name"` resolves a single row whose
 * snapshot carries the full `content` markdown body. `retrieve_entities` with
 * `entity_type: "skill"` also returns bodies but is unbounded, so the
 * by-identifier path is what we direct agents to.
 *
 * Note we key on the snapshot `name` field rather than `canonical_name`:
 * canonical names are not uniformly formatted across instances (some rows are
 * stored bare, others namespaced), whereas `name` is the schema's declared
 * canonical identifier field.
 */
export const INSTANCE_SKILL_FETCH_HINT =
  'retrieve_entity_by_identifier with entity_type "skill", by "name", and identifier set to the skill name';

/**
 * Coerce a snapshot boolean that may have been stored as a real boolean or as
 * a string. Observed live data contains both `true` and `"true"` for these
 * flags, so a strict `=== false` or `=== true` check misclassifies rows.
 *
 * Returns `undefined` when the value is absent or uninterpretable, letting the
 * caller apply its own default.
 */
function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (normalised === "true") return true;
    if (normalised === "false") return false;
  }
  return undefined;
}

/**
 * Return the enabled `skill` entities for `userId`, ordered by name ascending
 * for deterministic output.
 *
 * Scoping: the query filters on `user_id`, exactly as the standing-rules read
 * does. This is load-bearing — an unscoped read on these instances can return
 * HTTP 200 with zero rows rather than an error, so a scoping regression would
 * fail silently and look indistinguishable from "this instance has no skills".
 *
 * Filtering: rows with `enabled === false` are excluded. Rows that omit
 * `enabled` are INCLUDED (treated as enabled), matching the mirror profile's
 * treatment of the flag as opt-out rather than opt-in.
 *
 * `user_invocable` is deliberately NOT filtered on. That flag controls whether
 * a skill appears in the harness slash-command palette, not whether an agent
 * may run it conversationally. A non-user-invocable skill is precisely the one
 * an agent most needs told about, because the user cannot reach it from a menu.
 *
 * Returns an empty array on any error so session initialisation is never
 * blocked by a skills-query failure.
 */
export async function getInstanceSkills(userId: string): Promise<InstanceSkill[]> {
  try {
    const { data, error } = await db
      .from("entities")
      .select("id, canonical_name, entity_snapshots!inner(snapshot)")
      .eq("user_id", userId)
      .eq("entity_type", SKILL_ENTITY_TYPE)
      .is("merged_to_entity_id", null);

    if (error) {
      logger.warn(`[instance_skills] query failed: ${error.message}`);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const skills: InstanceSkill[] = [];

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

      // Skip explicitly disabled skills. Absent `enabled` means enabled.
      if (coerceBoolean(snap["enabled"]) === false) continue;

      // `name` is the schema's canonical identifier field and the key the
      // documented fetch path resolves on. Fall back to canonical_name only
      // when the snapshot omits it.
      const rawName = typeof snap["name"] === "string" ? snap["name"].trim() : "";
      const name = rawName || row.canonical_name;

      // A skill with no resolvable name cannot be fetched, so it is not
      // actionable to surface.
      if (!name) continue;

      const rawDescription =
        typeof snap["description"] === "string" ? snap["description"].trim() : "";
      const description =
        rawDescription.length > DESCRIPTION_MAX_CHARS
          ? `${rawDescription.slice(0, DESCRIPTION_MAX_CHARS).trimEnd()}…`
          : rawDescription;

      skills.push({ entity_id: row.id, name, description });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));

    return skills;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[instance_skills] unexpected error: ${msg}`);
    return [];
  }
}

/**
 * Render the `[INSTANCE SKILLS]` section appended to the MCP instructions
 * block, or `null` when nothing should be appended.
 *
 * Returns `null` for an empty skill list so an instance with no skill rows is
 * a complete no-op: no header, no empty section, no behavioural change.
 *
 * Capping: emits at most {@link INSTANCE_SKILLS_MAX_COUNT} entries and stays
 * within {@link INSTANCE_SKILLS_MAX_BYTES} of rendered entry text, whichever
 * binds first, then appends an explicit "…and N more" line so the truncation
 * is visible rather than silent.
 *
 * @param skills  Projection from {@link getInstanceSkills}.
 * @param compact When true (NEOTOMA_MCP_COMPACT_INSTRUCTIONS), emit only the
 *                names and the fetch hint, omitting descriptions, so the
 *                section stays proportionate to the compact block.
 */
export function renderInstanceSkillsSection(
  skills: InstanceSkill[],
  compact: boolean
): string | null {
  if (skills.length === 0) return null;

  const lines: string[] = [];
  let budget = 0;
  let rendered = 0;

  for (const skill of skills) {
    if (rendered >= INSTANCE_SKILLS_MAX_COUNT) break;

    const line =
      compact || !skill.description ? `- ${skill.name}` : `- ${skill.name} — ${skill.description}`;

    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (rendered > 0 && budget + cost > INSTANCE_SKILLS_MAX_BYTES) break;

    lines.push(line);
    budget += cost;
    rendered += 1;
  }

  const omitted = skills.length - rendered;

  const header =
    "[INSTANCE SKILLS]\n" +
    `This instance stores ${skills.length} skill${skills.length === 1 ? "" : "s"} as \`skill\` ` +
    "entities in the graph. They are available to this session even though no local skills " +
    "directory is present. Descriptions only are listed below; to run one, first fetch its full " +
    `body with ${INSTANCE_SKILL_FETCH_HINT}, then follow that body's instructions.`;

  const footer = omitted > 0 ? `\n…and ${omitted} more (fetch by name as above).` : "";

  return `${header}\n${lines.join("\n")}${footer}`;
}
