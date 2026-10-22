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
 * Per-skill name cap. A name is a kebab-case identifier, so anything near
 * this length is already malformed; the cap exists so a pathological row
 * cannot dominate the budget, not as a validity judgement.
 */
const NAME_MAX_CHARS = 80;

/**
 * The shape a skill name is allowed to take: a kebab-case identifier,
 * optionally namespaced with `:` or `/` the way plugin- and directory-scoped
 * skills already are elsewhere in this codebase.
 *
 * Names get a whitelist where descriptions get an escaper because they are
 * different kinds of value. A name is an identifier the agent is told to pass
 * back to the fetch path, so a name that cannot round-trip through that path
 * is not useful to surface; constraining it to the character set identifiers
 * actually use removes the entire injection question for this field rather
 * than trying to neutralise it character by character. A description is
 * free-form human prose and cannot be whitelisted without mangling ordinary
 * text, so it is sanitised instead (see {@link sanitiseDescription}).
 */
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9]+(?:[-_.:/][a-zA-Z0-9]+)*$/;

/**
 * Characters stripped from any graph text before it reaches the instructions
 * block.
 *
 * The instructions block is prose an agent consumes as instructions, so a
 * `skill` row's text is untrusted input crossing into a control surface. Any
 * principal who can write a skill row would otherwise be writing directly
 * into every connecting agent's instruction channel.
 *
 * Covers, in order: C0 controls including CR and LF (forge a new line, and
 * from there a new bullet, heading or section), DEL and C1 controls, the
 * bidirectional formatting overrides (U+202A-202E, U+2066-2069) that let
 * displayed text differ from stored text, the zero-width and word-joiner
 * characters (U+200B-200F, U+2060) that hide content inside an otherwise
 * innocuous string, line/paragraph separators (U+2028-2029) that terminate a
 * line for many renderers, and the BOM/zero-width-no-break space (U+FEFF).
 */
const CONTROL_AND_BIDI =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;

/**
 * Markdown metacharacters that carry structural meaning at the start of a
 * line: headings, list bullets, blockquotes, fences and horizontal rules.
 *
 * Only the leading run matters. Because newlines are already stripped before
 * this is applied, a description cannot reach the start of a line except at
 * the point where the renderer itself places it — which is after the `- ` or
 * `— ` the renderer wrote. Stripping the leading run there stops a
 * description from continuing the renderer's own bullet into a new structure.
 */
const LEADING_MARKDOWN_STRUCTURE = /^[\s>#*+\-=_`~|[\]]+/;

/**
 * Tokens that carry authority or structure even in the MIDDLE of a line, and
 * so survive being collapsed onto one.
 *
 * Flattening to a single line defeats the structural attacks — a forged
 * heading or list item needs to start a line to mean anything. These do not.
 * `[SECTION]` is this instruction block's own convention for a section header
 * (`[ONBOARDING]`, `[INSTANCE SKILLS]`), so a description containing
 * `[SYSTEM]` is speaking the block's native dialect of authority regardless of
 * where on the line it sits; a code fence mid-line can still open a block that
 * swallows everything after it in a renderer that is more permissive than
 * ours. Both are replaced with a visibly-neutered form rather than deleted, so
 * a human reading the block can see that a row tried this.
 */
const INLINE_AUTHORITY_TOKENS: Array<[RegExp, string]> = [
  // Bracketed all-caps runs: the block's own section-header convention.
  [/\[([A-Z][A-Z0-9 _-]{2,})\]/g, "($1)"],
  // Code fences and their inline-HTML cousins.
  [/```+/g, "'''"],
  [/<\/?[a-zA-Z][^>]*>/g, ""],
  // Heading markers. Inert as markdown once flattened mid-line, but this
  // block is read by an agent skimming for structure, not by a markdown
  // parser, and `##` reads as a heading to that reader wherever it sits.
  [/(^|\s)#{1,6}(?=\s)/g, "$1"],
];

/**
 * Normalise untrusted graph text into a single inert line of display text.
 *
 * Four steps, each closing a different escape: strip the characters that can
 * forge structure or hide content, collapse the remaining whitespace runs to
 * single spaces so the text cannot be spread across visual lines by tabs or
 * exotic spaces, strip leading markdown structure so the text cannot continue
 * the renderer's bullet into a heading, fence or list of its own, and neuter
 * the tokens that still carry authority once flattened onto a single line
 * (see {@link INLINE_AUTHORITY_TOKENS}).
 *
 * What is deliberately NOT done: interior markdown is left alone. A
 * description reading `use the **fast** path` should render as written; the
 * injection risk is structural (new lines, new sections, new directives), not
 * emphasis. Backslash-escaping every metacharacter would corrupt ordinary
 * prose to defend against a threat that collapsing to one line has already
 * removed.
 */
function sanitiseDisplayText(value: string): string {
  let out = value
    .replace(CONTROL_AND_BIDI, " ")
    .replace(/\s+/g, " ")
    .replace(LEADING_MARKDOWN_STRUCTURE, "");

  for (const [pattern, replacement] of INLINE_AUTHORITY_TOKENS) {
    out = out.replace(pattern, replacement);
  }

  return out.trim();
}

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
 * Returns a THREE-state result, because absent and malformed are different
 * facts and the caller must treat them differently:
 *
 * - `"absent"`  — the field is not set. The schema treats `enabled` as
 *   opt-out, so this follows the documented default and the skill is shown.
 * - `true` / `false` — the field parsed.
 * - `"malformed"` — the field is set to something this function cannot read.
 *
 * `"malformed"` exists because `enabled` is the field that carries the safety
 * meaning for this surface: it is how an operator says "do not show this
 * skill to agents". A value we cannot parse is a value whose intent we do not
 * know, and the restrictive reading of an unknown intent on a disable switch
 * is to keep the skill hidden. Folding malformed into the default-enabled
 * branch would mean a typo in a disable flag silently re-exposes a skill the
 * operator believed suppressed — the failure mode is one-directional, so the
 * safe branch is the one that fails closed.
 */
type EnabledState = boolean | "absent" | "malformed";

function coerceEnabled(value: unknown): EnabledState {
  if (value === undefined || value === null) return "absent";
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (normalised === "") return "absent";
    if (normalised === "true") return true;
    if (normalised === "false") return false;
  }
  return "malformed";
}

/** Outcome of a skill lookup, carrying the failure signal on the return value. */
export interface InstanceSkillsResult {
  skills: InstanceSkill[];
  /**
   * True when the read could not be completed. An empty `skills` with this set
   * means "unknown", not "none" — see {@link getInstanceSkillsResult}.
   */
  lookup_failed: boolean;
  error?: string;
}

/**
 * Read the enabled `skill` entities for `userId` and report whether the read
 * succeeded.
 *
 * Scoping: the query filters on `user_id`. This is load-bearing — an unscoped
 * read on these instances can return HTTP 200 with zero rows rather than an
 * error, so a scoping regression would fail silently and look
 * indistinguishable from "this instance has no skills".
 *
 * The query is deliberately backend-portable, and this is the whole reason the
 * shape looks more roundabout than a join would. It previously selected
 * `entity_snapshots!inner(snapshot)` from `entities`, a PostgREST
 * embedded-resource hint that only Supabase understands: libSQL forwards it
 * into SQL and fails with `unrecognized token: "!"`. Because this function
 * swallows errors to avoid blocking session init, that failure was totally
 * silent — every session on a local instance received zero instance skills
 * while the mocked unit tests all passed. That is the same defect twice
 * repaired elsewhere in this codebase (#2131 for standing rules, #1975 for
 * instance policy), and `tests/unit/db_driver_contract.test.ts` asserts the
 * old shape is a syntax error to the driver rather than unsupported sugar.
 *
 * `entity_snapshots` already carries `entity_id`, `canonical_name`, `user_id`
 * and `entity_type`, so no join is needed for what we return. It carries no
 * merge pointer, so merged-away rows are excluded by a second bounded lookup
 * against `entities`, mirroring standing rules.
 *
 * Filtering: rows with `enabled` parsing to false are excluded, and so are
 * rows whose `enabled` is set to something unparseable (see
 * {@link coerceEnabled} for why malformed fails closed). Rows that omit
 * `enabled` are INCLUDED, matching the mirror profile's treatment of the flag
 * as opt-out rather than opt-in.
 *
 * `user_invocable` is deliberately NOT filtered on. That flag controls whether
 * a skill appears in the harness slash-command palette, not whether an agent
 * may run it conversationally. A non-user-invocable skill is precisely the one
 * an agent most needs told about, because the user cannot reach it from a menu.
 *
 * Never throws: session initialisation must not be blocked by a skills-query
 * failure. The failure is reported on `lookup_failed` instead of being
 * flattened into an empty list.
 */
export async function getInstanceSkillsResult(userId: string): Promise<InstanceSkillsResult> {
  try {
    const { data, error } = await db
      .from("entity_snapshots")
      .select("entity_id, canonical_name, snapshot")
      .eq("user_id", userId)
      .eq("entity_type", SKILL_ENTITY_TYPE);

    if (error) {
      logger.warn(`[instance_skills] query failed: ${error.message}`);
      return { skills: [], lookup_failed: true, error: error.message };
    }

    if (!data || (data as unknown[]).length === 0) {
      return { skills: [], lookup_failed: false };
    }

    // entity_snapshots carries no merge pointer, so exclude merged-away rows
    // with a second bounded lookup rather than dropping the filter. A failure
    // here must not suppress skills: fall back to listing everything found,
    // since a stale merged skill is a lesser harm than no skills at all.
    let mergedAway = new Set<string>();
    {
      const { data: mergedRows, error: mergedErr } = await db
        .from("entities")
        .select("id, merged_to_entity_id")
        .eq("user_id", userId)
        .eq("entity_type", SKILL_ENTITY_TYPE);
      if (mergedErr) {
        logger.warn(
          `[instance_skills] merge-filter lookup failed (${mergedErr.message}); listing unfiltered`
        );
      } else if (mergedRows) {
        mergedAway = new Set(
          (mergedRows as Array<{ id: string; merged_to_entity_id: string | null }>)
            .filter((r) => r.merged_to_entity_id != null)
            .map((r) => r.id)
        );
      }
    }

    const skills: InstanceSkill[] = [];

    for (const row of data as Array<{
      entity_id: string;
      canonical_name: string | null;
      snapshot: Record<string, unknown> | string | null;
    }>) {
      if (mergedAway.has(row.entity_id)) continue;

      // The snapshot column comes back parsed on one backend and as raw JSON
      // text on the other, so normalise both rather than assuming either.
      let snap: Record<string, unknown> = {};
      if (typeof row.snapshot === "string") {
        try {
          snap = JSON.parse(row.snapshot) as Record<string, unknown>;
        } catch {
          // A row whose snapshot will not parse tells us nothing about the
          // skill, including whether it is enabled. Skip it rather than
          // surface a skill we cannot describe or confirm is enabled.
          continue;
        }
      } else if (row.snapshot && typeof row.snapshot === "object") {
        snap = row.snapshot;
      }

      // Skip disabled skills, and skills whose `enabled` we cannot read.
      const enabled = coerceEnabled(snap["enabled"]);
      if (enabled === false) continue;
      if (enabled === "malformed") {
        logger.warn(
          `[instance_skills] skipping skill with unreadable "enabled" value (entity ${row.entity_id})`
        );
        continue;
      }

      // `name` is the schema's canonical identifier field and the key the
      // documented fetch path resolves on. Fall back to canonical_name only
      // when the snapshot omits it.
      const rawName = typeof snap["name"] === "string" ? snap["name"] : "";
      const candidate = sanitiseDisplayText(rawName || row.canonical_name || "");

      // A name is an identifier, not prose, so it is validated rather than
      // escaped: a name that does not look like one cannot be passed back to
      // the fetch path, so surfacing it would advertise a skill the agent
      // cannot actually retrieve — and it is exactly the shape a row would
      // take if it were trying to smuggle text into the instruction block.
      if (!candidate || candidate.length > NAME_MAX_CHARS || !SKILL_NAME_PATTERN.test(candidate)) {
        if (candidate) {
          logger.warn(
            `[instance_skills] skipping skill with non-identifier name (entity ${row.entity_id})`
          );
        }
        continue;
      }

      const rawDescription = typeof snap["description"] === "string" ? snap["description"] : "";
      const cleanedDescription = sanitiseDisplayText(rawDescription);
      const description =
        cleanedDescription.length > DESCRIPTION_MAX_CHARS
          ? `${cleanedDescription.slice(0, DESCRIPTION_MAX_CHARS).trimEnd()}…`
          : cleanedDescription;

      skills.push({ entity_id: row.entity_id, name: candidate, description });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));

    return { skills, lookup_failed: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[instance_skills] unexpected error: ${msg}`);
    return { skills: [], lookup_failed: true, error: msg };
  }
}

/**
 * Return the enabled `skill` entities for `userId`, ordered by name ascending.
 *
 * IMPORTANT: an empty array is ambiguous on its own — it means either "this
 * instance has no skills" or "the lookup failed". Callers that surface skills
 * to an agent should use {@link getInstanceSkillsResult} and report the
 * failure rather than presenting it as an empty list, which is the same
 * conflation that let #2131 go unnoticed.
 */
export async function getInstanceSkills(userId: string): Promise<InstanceSkill[]> {
  return (await getInstanceSkillsResult(userId)).skills;
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

    // In full mode an undescribed skill is marked rather than rendered bare,
    // so an agent scanning the list can tell "nobody wrote a description" from
    // "descriptions are switched off". In compact mode every line is bare by
    // construction, so the marker would be noise on every row.
    const line = compact
      ? `- ${skill.name}`
      : `- ${skill.name} — ${skill.description || "(no description)"}`;

    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (rendered > 0 && budget + cost > INSTANCE_SKILLS_MAX_BYTES) break;

    lines.push(line);
    budget += cost;
    rendered += 1;
  }

  const omitted = skills.length - rendered;

  // The header states what is actually on the page below it. Compact mode
  // renders bare names, so claiming descriptions are listed would misdescribe
  // the output in precisely the mode where the reader has least context.
  const listed = compact
    ? "Names only are listed below"
    : "Names and descriptions only are listed below";

  const header =
    "[INSTANCE SKILLS]\n" +
    `This instance stores ${skills.length} skill${skills.length === 1 ? "" : "s"} as \`skill\` ` +
    "entities in the graph. They are available to this session even though no local skills " +
    `directory is present. ${listed}. Match ordinary user intent against this catalog; the user ` +
    "does not need to say Neotoma, Ateles, a skill name, or an entity id. If one skill clearly " +
    "matches the authorized instance context, select it; if several could match, clarify only " +
    `that ambiguity. To run one, first fetch its full body with ${INSTANCE_SKILL_FETCH_HINT}, ` +
    "then follow that body's constraints, execution steps, and readback requirements.";

  const footer = omitted > 0 ? `\n…and ${omitted} more (fetch by name as above).` : "";

  return `${header}\n${lines.join("\n")}${footer}`;
}
