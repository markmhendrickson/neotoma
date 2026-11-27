/**
 * Session index placed at the very start of the MCP instructions.
 *
 * The composed instructions run to well over 100KB. MCP clients truncate long
 * `instructions`, and a tight client has been observed cutting inside the
 * second of several standing rules, so even a leading rules block (up to
 * {@link STANDING_RULES_MAX_BYTES}) is not guaranteed to reach the model, and
 * the `[INSTANCE SKILLS]` catalog is lost entirely when it sits after the base
 * block. This index is the bounded part that survives any reasonable cut: one
 * line per standing rule (title and entity id) and the instance skill names,
 * within {@link INSTRUCTIONS_INDEX_MAX_BYTES}, ending with its own marker. The
 * full rule text and skill descriptions follow it unchanged.
 *
 * Every cap is visible: when the index cannot list everything it states how
 * many rules or skills were left out and how to fetch them.
 */

import type { StandingRule } from "./standing_rules.js";
import { sanitizeStandingRuleInline } from "./standing_rules.js";
import { INSTANCE_SKILL_FETCH_HINT } from "./skills/instance_skills.js";

/**
 * Cap, in UTF-8 bytes, on the whole index including its opening and closing
 * markers. 2,048 bytes is small enough that no client we know of cuts inside
 * it (observed cuts land several KB in), and large enough for a header, the
 * fetch hints, about six rule lines with ids and a dozen skill names.
 */
export const INSTRUCTIONS_INDEX_MAX_BYTES = 2048;

/** Opening line of the index. */
export const INSTRUCTIONS_INDEX_START_MARKER = "[SESSION INDEX]";

/** Closing line of the index; always the last line, inside the budget. */
export const INSTRUCTIONS_INDEX_END_MARKER = "[END SESSION INDEX]";

/** Longest rule title shown in the index, in UTF-8 bytes. */
const INDEX_TITLE_MAX_BYTES = 80;

/** Longest skill name shown in the index, in UTF-8 bytes. */
const INDEX_SKILL_NAME_MAX_BYTES = 64;

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Clip `s` to at most `max` UTF-8 bytes on a code-point boundary. */
function clipUtf8(s: string, max: number): string {
  if (utf8Bytes(s) <= max) return s;
  let out = "";
  let used = 0;
  for (const ch of s) {
    const n = utf8Bytes(ch);
    if (used + n > max - 3) break;
    out += ch;
    used += n;
  }
  return `${out}...`;
}

export interface InstructionsIndexInput {
  /** Rules in priority order, as rendered in `[STANDING RULES]`. */
  rules: StandingRule[];
  rulesLookupFailed: boolean;
  /** Instance skill names, as rendered in `[INSTANCE SKILLS]`. */
  skillNames: string[];
  skillsLookupFailed: boolean;
}

/**
 * Render the `[SESSION INDEX]` block, or `null` when there is no rule and no
 * instance skill to list, so an instance without either serves instructions
 * byte-identical to before the index existed. A failed lookup alone also
 * yields `null`: the full unavailable notice still leads the instructions.
 */
export function renderInstructionsIndex(input: InstructionsIndexInput): string | null {
  const rules = input.rulesLookupFailed ? [] : input.rules;
  const skills = input.skillsLookupFailed ? [] : input.skillNames;
  if (rules.length === 0 && skills.length === 0) return null;

  const ruleLines = rules.map((rule) => {
    const title = clipUtf8(sanitizeStandingRuleInline(rule.title), INDEX_TITLE_MAX_BYTES);
    return `- ${title} (${sanitizeStandingRuleInline(rule.entity_id)})`;
  });
  const skillNames = skills.map((name) =>
    clipUtf8(sanitizeStandingRuleInline(name), INDEX_SKILL_NAME_MAX_BYTES)
  );

  const render = (rulesShown: number, skillsShown: number): string => {
    const lines: string[] = [
      INSTRUCTIONS_INDEX_START_MARKER,
      `Index only, capped at ${INSTRUCTIONS_INDEX_MAX_BYTES} bytes; full text follows below.`,
    ];
    if (rules.length > 0) {
      lines.push(
        `Standing rules (${rules.length}, priority order; full text in [STANDING RULES] below, ` +
          "or retrieve_entity_snapshot by entity_id):"
      );
      lines.push(...ruleLines.slice(0, rulesShown));
      const omitted = rules.length - rulesShown;
      if (omitted > 0) {
        lines.push(
          `- ${omitted} more rule${omitted === 1 ? "" : "s"} not listed here; read them below or ` +
            'retrieve_entities with entity_type "standing_rule".'
        );
      }
    } else if (input.rulesLookupFailed) {
      lines.push("Standing rules: could not be read; see [STANDING RULES] below.");
    }
    if (skills.length > 0) {
      const omitted = skills.length - skillsShown;
      const listed = skillNames.slice(0, skillsShown).join(", ");
      lines.push(
        `Instance skills (${skills.length}; fetch one with ${INSTANCE_SKILL_FETCH_HINT}): ` +
          (listed.length > 0 ? listed : "(none listed here)") +
          (omitted > 0
            ? `; ${omitted} more not listed here, see [INSTANCE SKILLS] below or ` +
              'retrieve_entities with entity_type "skill".'
            : "")
      );
    } else if (input.skillsLookupFailed) {
      lines.push("Instance skills: could not be read; see [INSTANCE SKILLS] below.");
    }
    lines.push(INSTRUCTIONS_INDEX_END_MARKER);
    return lines.join("\n");
  };

  // Rules first (they are the must-follow content), then skill names, each
  // added only while the whole block, omission lines included, fits.
  let rulesShown = 0;
  while (
    rulesShown < rules.length &&
    utf8Bytes(render(rulesShown + 1, 0)) <= INSTRUCTIONS_INDEX_MAX_BYTES
  ) {
    rulesShown += 1;
  }
  let skillsShown = 0;
  while (
    skillsShown < skills.length &&
    utf8Bytes(render(rulesShown, skillsShown + 1)) <= INSTRUCTIONS_INDEX_MAX_BYTES
  ) {
    skillsShown += 1;
  }
  return render(rulesShown, skillsShown);
}

/**
 * `instructions` with a leading `[SESSION INDEX]` block removed, or unchanged
 * when it does not start with one. For readers that want the sections after
 * the index, such as a check that the full rules block leads what follows.
 */
export function stripInstructionsIndex(instructions: string): string {
  if (!instructions.startsWith(`${INSTRUCTIONS_INDEX_START_MARKER}\n`)) return instructions;
  const end = instructions.indexOf(`\n${INSTRUCTIONS_INDEX_END_MARKER}`);
  if (end < 0) return instructions;
  return instructions.slice(end + INSTRUCTIONS_INDEX_END_MARKER.length + 1).replace(/^\n\n/, "");
}
