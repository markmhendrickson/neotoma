import { describe, it, expect } from "vitest";
import { renderStandingRulesSection, type StandingRule } from "../../src/services/standing_rules.js";
import { prependClientInstructionsSection } from "../../src/mcp_instruction_doc.js";

const rules: StandingRule[] = [
  { entity_id: "ent_a", title: "Workflow catalogs describe operator goals and reusable procedures",
    rule_text: "Present catalog workflows around independently initiable operator goals.",
    scope: "shared-instance", priority: 2 },
  { entity_id: "ent_b", title: "Rendered pages use the shared page template",
    rule_text: "EVERY rendered_page on this instance uses the shared page template.",
    scope: "shared-instance", priority: 2 },
  { entity_id: "ent_c", title: "Meeting recap pages link their full transcript",
    rule_text: "EVERY meeting recap rendered_page MUST link the full transcript.",
    scope: "shared-instance", priority: 2 },
];

describe("renderStandingRulesSection", () => {
  it("emits all three rules with full text", () => {
    const out = renderStandingRulesSection(rules)!;
    for (const r of rules) {
      expect(out, `missing title: ${r.title}`).toContain(r.title);
      expect(out, `missing body: ${r.title}`).toContain(r.rule_text);
    }
    expect(out).toContain("3 standing rules in force");
    expect(out).toContain("(scope: shared-instance)");
  });
  it("returns null for no rules so instructions stay byte-identical", () => {
    expect(renderStandingRulesSection([])).toBeNull();
  });
  it("drops whole over-budget rules and names them, never clipping mid-rule", () => {
    const big: StandingRule[] = [
      { entity_id: "1", title: "Kept", rule_text: "x".repeat(23000), priority: 9 },
      { entity_id: "2", title: "Dropped Rule", rule_text: "y".repeat(5000), priority: 1 },
    ];
    const out = renderStandingRulesSection(big)!;
    expect(out).toContain("x".repeat(23000));
    expect(out).not.toContain("y".repeat(5000));
    expect(out).toContain("1 further rule omitted for length: Dropped Rule");
  });
  it("still emits a single oversized rule rather than an empty section", () => {
    const out = renderStandingRulesSection([
      { entity_id: "1", title: "Huge", rule_text: "z".repeat(50000), priority: 1 },
    ])!;
    expect(out).toContain("z".repeat(50000));
  });
});

describe("prependClientInstructionsSection", () => {
  it("leaves instructions byte-identical when there is no section", () => {
    expect(prependClientInstructionsSection("base", null)).toBe("base");
    expect(prependClientInstructionsSection("base", "   ")).toBe("base");
  });
  it("puts the section ahead of the instructions, where truncation cannot reach it", () => {
    const out = prependClientInstructionsSection("b".repeat(150000), "[STANDING RULES]\nrule");
    expect(out.startsWith("[STANDING RULES]\nrule\n\n")).toBe(true);
  });
});
