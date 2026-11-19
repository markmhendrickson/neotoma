import { describe, it, expect } from "vitest";
import {
  renderStandingRulesSection,
  STANDING_RULES_MAX_BYTES,
  type StandingRule,
} from "../../src/services/standing_rules.js";
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
    expect(out).not.toContain("yyyy");
    expect(out).toMatch(/### Dropped Rule \(entity_id: 2\): body omitted for size; fetch the full text/);
    expect(out).toContain("1 rule above had its body omitted for size: Dropped Rule");
  });
});

describe("renderStandingRulesSection budget (fail closed)", () => {
  const entriesBytes = (out: string) => {
    const body = out.slice(out.indexOf("\n\n") + 2);
    const footerAt = body.search(/\n\n\d+ rules? above had/);
    return Buffer.byteLength(footerAt >= 0 ? body.slice(0, footerAt) : body, "utf8");
  };

  it("replaces an oversized FIRST rule with a one-line notice instead of emitting it", () => {
    const out = renderStandingRulesSection([
      { entity_id: "ent_huge", title: "Huge", rule_text: "z".repeat(50000), priority: 1 },
    ])!;
    expect(out).not.toContain("z".repeat(100));
    const notice = out.split("\n").find((l) => l.startsWith("### Huge"));
    expect(notice).toBeDefined();
    expect(notice).toContain("body omitted for size");
    expect(notice).toContain("retrieve_entity_snapshot (entity_id: ent_huge)");
    expect(out).toContain("1 rule above had its body omitted for size: Huge");
  });

  it("an oversized first rule cannot hide later rules or the omission notice", () => {
    const out = renderStandingRulesSection([
      { entity_id: "a", title: "Huge first", rule_text: "z".repeat(30000), priority: 9 },
      { entity_id: "b", title: "Second", rule_text: "second body", priority: 5 },
      { entity_id: "c", title: "Third", rule_text: "third body", priority: 1 },
    ])!;
    expect(out).toContain("second body");
    expect(out).toContain("third body");
    expect(out).toContain("### Huge first (entity_id: a): body omitted for size");
    expect(out).toContain("1 rule above had its body omitted for size: Huge first");
    expect(out.indexOf("Huge first")).toBeLessThan(out.indexOf("second body"));
  });

  it("reserves room so later rules are always at least named", () => {
    const rules: StandingRule[] = Array.from({ length: 5 }, (_, i) => ({
      entity_id: `r${i}`,
      title: `Rule ${i}`,
      rule_text: String(i).repeat(7000),
      priority: 10 - i,
    }));
    const out = renderStandingRulesSection(rules)!;
    for (const r of rules) expect(out).toContain(`### ${r.title} (entity_id: ${r.entity_id})`);
    expect(entriesBytes(out)).toBeLessThanOrEqual(STANDING_RULES_MAX_BYTES);
    expect(out).toMatch(/\d+ rules above had their bodies omitted for size/);
  });

  it("counts the cap in UTF-8 bytes, not UTF-16 code units", () => {
    // 9000 three-byte characters: 9000 code units, 27000 bytes. A
    // code-unit count would let it through; a byte count must not.
    const out = renderStandingRulesSection([
      { entity_id: "u", title: "Wide", rule_text: "\u20ac".repeat(9000), priority: 1 },
    ])!;
    expect(out).not.toContain("\u20ac".repeat(10));
    expect(out).toContain("### Wide (entity_id: u): body omitted for size");
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
