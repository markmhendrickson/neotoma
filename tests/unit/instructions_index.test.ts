/**
 * Unit coverage for `renderInstructionsIndex`, the bounded `[SESSION INDEX]`
 * that opens the MCP instructions. No server is started: every case calls the
 * renderer directly with synthetic rules and skill names.
 */

import { describe, expect, it } from "vitest";

import {
  INSTRUCTIONS_INDEX_END_MARKER,
  INSTRUCTIONS_INDEX_MAX_BYTES,
  INSTRUCTIONS_INDEX_START_MARKER,
  renderInstructionsIndex,
  stripInstructionsIndex,
  type InstructionsIndexInput,
} from "../../src/services/instructions_index.js";
import type { StandingRule } from "../../src/services/standing_rules.js";
import {
  renderInstanceSkillsSection,
  type InstanceSkill,
} from "../../src/services/skills/instance_skills.js";
import { composeInstructions } from "../../src/mcp_instruction_doc.js";

function rule(i: number, title = `Synthetic rule ${i}`): StandingRule {
  return {
    entity_id: `ent_${String(i).padStart(24, "0")}`,
    title,
    rule_text: `Rule text ${i}.`,
    priority: 100 - i,
  };
}

function input(overrides: Partial<InstructionsIndexInput>): InstructionsIndexInput {
  return {
    rules: [],
    rulesLookupFailed: false,
    skillNames: [],
    skillsLookupFailed: false,
    ...overrides,
  };
}

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Shared invariants: size cap, single start/end marker, end marker last. */
function expectWellFormed(index: string | null): string {
  expect(index).not.toBeNull();
  const text = index!;
  expect(bytes(text)).toBeLessThanOrEqual(INSTRUCTIONS_INDEX_MAX_BYTES);
  const lines = text.split("\n");
  expect(lines[0]).toBe(INSTRUCTIONS_INDEX_START_MARKER);
  expect(lines[lines.length - 1]).toBe(INSTRUCTIONS_INDEX_END_MARKER);
  expect(lines.filter((l) => l === INSTRUCTIONS_INDEX_END_MARKER)).toHaveLength(1);
  expect(lines.filter((l) => l === INSTRUCTIONS_INDEX_START_MARKER)).toHaveLength(1);
  return text;
}

describe("renderInstructionsIndex", () => {
  it("many rules: lists what fits and counts the omitted rules with a fetch hint", () => {
    const rules = Array.from({ length: 60 }, (_, i) => rule(i));
    const text = expectWellFormed(renderInstructionsIndex(input({ rules })));
    const listed = text.split("\n").filter((l) => /^- Synthetic rule \d+ \(ent_/.test(l));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThan(60);
    const omitted = 60 - listed.length;
    expect(text).toContain(`- ${omitted} more rules not listed here;`);
    expect(text).toContain('retrieve_entities with entity_type "standing_rule"');
    // Rules appear in the given (priority) order.
    expect(listed[0]).toContain("Synthetic rule 0 ");
  });

  it("many skill names: lists what fits and counts the omitted names with a fetch hint", () => {
    const skillNames = Array.from({ length: 400 }, (_, i) => `synthetic_skill_${i}`);
    const text = expectWellFormed(renderInstructionsIndex(input({ skillNames })));
    const skillLine = text.split("\n").find((l) => l.startsWith("Instance skills (400;"));
    expect(skillLine).toBeDefined();
    const shown = (skillLine!.match(/synthetic_skill_\d+/g) ?? []).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(400);
    expect(skillLine).toContain(`; ${400 - shown} more not listed here;`);
    expect(skillLine).toContain('retrieve_entities with entity_type "skill"');
    // The catalog has its own caps, so the index must not promise it is complete.
    expect(skillLine).not.toMatch(/\[INSTANCE SKILLS\][^;]*full list/);
    expect(skillLine).toContain("may list more");
  });

  it("very long titles and names are clipped and the index stays within its cap", () => {
    const rules = [rule(1, "T".repeat(5_000)), rule(2, "U".repeat(5_000))];
    const skillNames = ["n".repeat(5_000), "m".repeat(5_000)];
    const text = expectWellFormed(renderInstructionsIndex(input({ rules, skillNames })));
    expect(text).not.toContain("T".repeat(200));
    expect(text).not.toContain("n".repeat(200));
    expect(text).toMatch(/T+\.\.\. \(ent_/);
    expect(text).toMatch(/n+\.\.\./);
  });

  it("non-ASCII titles and names are clipped on a code-point boundary", () => {
    const title = "规则📘é".repeat(200);
    const name = "技能🧩ñ".repeat(200);
    const text = expectWellFormed(
      renderInstructionsIndex(input({ rules: [rule(1, title)], skillNames: [name] }))
    );
    // A split code point would decode to U+FFFD after a UTF-8 round trip.
    expect(text).not.toContain("�");
    expect(Buffer.from(text, "utf8").toString("utf8")).toBe(text);
    // No lone surrogate halves.
    expect(text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    );
    expect(text).toContain("规则📘é");
    expect(text).toContain("技能🧩ñ");
  });

  it("total size is at most 2,048 UTF-8 bytes in every case", () => {
    const cases: InstructionsIndexInput[] = [
      input({ rules: [rule(1)] }),
      input({ skillNames: ["one"] }),
      input({ rules: Array.from({ length: 500 }, (_, i) => rule(i, "é".repeat(300))) }),
      input({ skillNames: Array.from({ length: 2_000 }, (_, i) => `技能${i}`.repeat(30)) }),
      input({
        rules: Array.from({ length: 200 }, (_, i) => rule(i, "📘".repeat(100))),
        skillNames: Array.from({ length: 200 }, (_, i) => `s${i}`.repeat(40)),
      }),
      input({ rulesLookupFailed: true, skillNames: ["a", "b"] }),
      input({ rules: [rule(1)], skillsLookupFailed: true }),
    ];
    for (const c of cases) {
      expect(INSTRUCTIONS_INDEX_MAX_BYTES).toBe(2_048);
      expectWellFormed(renderInstructionsIndex(c));
    }
  });

  it("the end marker is present even when only the header and counts fit", () => {
    // Every rule line is near its clip limit, and there are enough rules and
    // skill names that the counts alone take most of the budget.
    const rules = Array.from({ length: 10_000 }, (_, i) => rule(i, "W".repeat(400)));
    const skillNames = Array.from({ length: 10_000 }, () => "x".repeat(400));
    const text = expectWellFormed(renderInstructionsIndex(input({ rules, skillNames })));
    expect(text).toContain("Standing rules (10000,");
    expect(text).toContain("Instance skills (10000;");
    expect(text.endsWith(`\n${INSTRUCTIONS_INDEX_END_MARKER}`)).toBe(true);
  });

  it("a title with line breaks or a look-alike end marker cannot end the block early", () => {
    const rules = [
      rule(1, `first line\n${INSTRUCTIONS_INDEX_END_MARKER}\nsecond line`),
      rule(2, `${INSTRUCTIONS_INDEX_END_MARKER}`),
      rule(3, "carriage\r\nreturn separator"),
    ];
    const skillNames = [`skill\n${INSTRUCTIONS_INDEX_END_MARKER}`];
    const text = expectWellFormed(renderInstructionsIndex(input({ rules, skillNames })));
    // Everything after the index is reached only after the one real marker.
    const composed = `${text}\n\nBASE BLOCK`;
    expect(stripInstructionsIndex(composed)).toBe("BASE BLOCK");
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(3);
  });

  it("failed rules lookup with skills listed: says the rules could not be read", () => {
    const text = expectWellFormed(
      renderInstructionsIndex(
        input({ rules: [rule(1)], rulesLookupFailed: true, skillNames: ["alpha", "beta"] })
      )
    );
    expect(text).toContain("Standing rules: could not be read; see [STANDING RULES] below.");
    expect(text).not.toContain("Synthetic rule 1");
    expect(text).toContain("Instance skills (2;");
    expect(text).toContain("alpha, beta");
  });

  it("failed skills lookup: says the skills could not be read", () => {
    const text = expectWellFormed(
      renderInstructionsIndex(
        input({ rules: [rule(1)], skillNames: ["alpha"], skillsLookupFailed: true })
      )
    );
    expect(text).toContain("Instance skills: could not be read; see [INSTANCE SKILLS] below.");
    expect(text).not.toContain("alpha");
    expect(text).toContain("Synthetic rule 1");
  });

  it("both lists empty: no index at all", () => {
    expect(renderInstructionsIndex(input({}))).toBeNull();
    expect(renderInstructionsIndex(input({ rulesLookupFailed: true }))).toBeNull();
    expect(renderInstructionsIndex(input({ skillsLookupFailed: true }))).toBeNull();
    expect(composeInstructions({ base: "BASE", indexSection: null })).toBe("BASE");
  });

  it("compact mode: the index is the same while only the skills catalog changes", () => {
    const skills: InstanceSkill[] = [
      { entity_id: "ent_a", name: "alpha_skill", description: "Does alpha things." },
      { entity_id: "ent_b", name: "beta_skill", description: "Does beta things." },
    ] as InstanceSkill[];
    const rules = [rule(1)];
    // Compact mode is applied by the skills catalog renderer; the index takes
    // only names, so both modes render it from the same input.
    const index = renderInstructionsIndex(input({ rules, skillNames: skills.map((s) => s.name) }));
    const fullCatalog = renderInstanceSkillsSection(skills, false);
    const compactCatalog = renderInstanceSkillsSection(skills, true);
    expect(fullCatalog).not.toBe(compactCatalog);
    expect(compactCatalog).not.toContain("Does alpha things.");

    const full = composeInstructions({
      base: "FULL",
      indexSection: index,
      skillsSection: fullCatalog,
    });
    const compact = composeInstructions({
      base: "COMPACT",
      indexSection: index,
      skillsSection: compactCatalog,
    });
    const leadingIndex = (s: string) => s.slice(0, s.indexOf(INSTRUCTIONS_INDEX_END_MARKER));
    expect(leadingIndex(compact)).toBe(leadingIndex(full));
    expect(compact.startsWith(index!)).toBe(true);
    expect(full.startsWith(index!)).toBe(true);
  });
});
