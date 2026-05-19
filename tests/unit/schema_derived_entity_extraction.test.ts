/**
 * Unit tests for schema-driven derived entity extraction.
 *
 * Tests cover:
 * - evaluateCondition: all operators
 * - resolveDerivedField: value and template specs
 * - Awaiting-reply task extraction rule: outbound email with question → task created
 * - Awaiting-reply task extraction rule: outbound email without question signals → no task
 * - Inbound email → no awaiting_reply task
 */

import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  resolveDerivedField,
} from "../../src/services/schema_derived_entity_extraction.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe("evaluateCondition", () => {
  describe("op: present", () => {
    it("returns true when field has a non-empty string value", () => {
      expect(
        evaluateCondition({ field: "direction", op: "present" }, { direction: "outbound" })
      ).toBe(true);
    });

    it("returns false when field is null", () => {
      expect(evaluateCondition({ field: "direction", op: "present" }, { direction: null })).toBe(
        false
      );
    });

    it("returns false when field is undefined / missing", () => {
      expect(evaluateCondition({ field: "direction", op: "present" }, {})).toBe(false);
    });

    it("returns false when field is an empty string", () => {
      expect(evaluateCondition({ field: "direction", op: "present" }, { direction: "" })).toBe(
        false
      );
    });
  });

  describe("op: absent", () => {
    it("returns true when field is missing", () => {
      expect(evaluateCondition({ field: "direction", op: "absent" }, {})).toBe(true);
    });

    it("returns false when field has a value", () => {
      expect(
        evaluateCondition({ field: "direction", op: "absent" }, { direction: "outbound" })
      ).toBe(false);
    });
  });

  describe("op: eq", () => {
    it("returns true for exact string match", () => {
      expect(
        evaluateCondition(
          { field: "direction", op: "eq", value: "outbound" },
          { direction: "outbound" }
        )
      ).toBe(true);
    });

    it("returns false for mismatched value", () => {
      expect(
        evaluateCondition(
          { field: "direction", op: "eq", value: "outbound" },
          { direction: "inbound" }
        )
      ).toBe(false);
    });

    it("returns false for missing field", () => {
      expect(evaluateCondition({ field: "direction", op: "eq", value: "outbound" }, {})).toBe(
        false
      );
    });
  });

  describe("op: neq", () => {
    it("returns true when field value differs", () => {
      expect(
        evaluateCondition(
          { field: "direction", op: "neq", value: "outbound" },
          { direction: "inbound" }
        )
      ).toBe(true);
    });

    it("returns false when field value matches", () => {
      expect(
        evaluateCondition(
          { field: "direction", op: "neq", value: "outbound" },
          { direction: "outbound" }
        )
      ).toBe(false);
    });
  });

  describe("op: matches_any_pattern", () => {
    it("returns true when body contains a literal pattern (case-insensitive)", () => {
      expect(
        evaluateCondition(
          {
            field: "body",
            op: "matches_any_pattern",
            patterns: ["please let me know"],
          },
          { body: "Hi Alice, Please let me know your availability." }
        )
      ).toBe(true);
    });

    it("returns true when body ends with a question mark", () => {
      expect(
        evaluateCondition(
          { field: "body", op: "matches_any_pattern", patterns: ["\\?"] },
          { body: "Can you confirm the meeting time?" }
        )
      ).toBe(true);
    });

    it("returns false when body has no matching pattern", () => {
      expect(
        evaluateCondition(
          {
            field: "body",
            op: "matches_any_pattern",
            patterns: ["please let me know", "\\?"],
          },
          { body: "Thanks for the info. Looking forward to working with you." }
        )
      ).toBe(false);
    });

    it("returns false when field is not a string", () => {
      expect(
        evaluateCondition(
          { field: "body", op: "matches_any_pattern", patterns: ["\\?"] },
          { body: 42 }
        )
      ).toBe(false);
    });

    it("returns false when patterns array is empty", () => {
      expect(
        evaluateCondition(
          { field: "body", op: "matches_any_pattern", patterns: [] },
          { body: "Is this working?" }
        )
      ).toBe(false);
    });

    it("returns false when patterns is undefined", () => {
      expect(
        evaluateCondition({ field: "body", op: "matches_any_pattern" }, { body: "Hello?" })
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveDerivedField
// ---------------------------------------------------------------------------

describe("resolveDerivedField", () => {
  it("returns a literal value unchanged", () => {
    expect(resolveDerivedField({ value: "pending" }, {})).toBe("pending");
  });

  it("returns null literal value unchanged", () => {
    expect(resolveDerivedField({ value: null }, {})).toBeNull();
  });

  it("interpolates a single {{field}} template placeholder", () => {
    expect(
      resolveDerivedField(
        { template: "Awaiting reply: {{subject}}" },
        { subject: "Meeting tomorrow" }
      )
    ).toBe("Awaiting reply: Meeting tomorrow");
  });

  it("interpolates multiple placeholders", () => {
    expect(
      resolveDerivedField(
        { template: "{{greeting}} {{name}}" },
        { greeting: "Hello", name: "Alice" }
      )
    ).toBe("Hello Alice");
  });

  it("replaces missing placeholder with empty string", () => {
    expect(resolveDerivedField({ template: "Awaiting reply: {{subject}}" }, {})).toBe(
      "Awaiting reply: "
    );
  });
});

// ---------------------------------------------------------------------------
// email schema derived_entities rule
// ---------------------------------------------------------------------------

describe("email schema derived_entities awaiting-reply rule", () => {
  const emailSchema = ENTITY_SCHEMAS["email"];
  const rule = emailSchema?.schema_definition?.derived_entities?.[0];

  it("email schema has exactly one derived_entities rule", () => {
    expect(emailSchema?.schema_definition?.derived_entities).toHaveLength(1);
  });

  it("rule targets task entity type", () => {
    expect(rule?.derived_entity_type).toBe("task");
  });

  it("rule has relationship_type REFERS_TO", () => {
    expect(rule?.relationship_type).toBe("REFERS_TO");
  });

  // Helper: evaluate all conditions on the rule
  function conditionsMet(payload: Record<string, unknown>): boolean {
    if (!rule) return false;
    return rule.conditions.every((cond) => evaluateCondition(cond, payload));
  }

  describe("outbound email with question-mark body → task should be extracted", () => {
    it("matches when direction=outbound and body contains '?'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Can you review the document?",
        })
      ).toBe(true);
    });

    it("matches when direction=outbound and body contains 'please let me know'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Please let me know what you think.",
        })
      ).toBe(true);
    });

    it("matches when direction=outbound and body contains 'looking forward to hearing'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Looking forward to hearing your feedback.",
        })
      ).toBe(true);
    });

    it("matches when direction=outbound and body contains 'please reply'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Please reply at your earliest convenience.",
        })
      ).toBe(true);
    });

    it("matches when direction=outbound and body contains 'awaiting your response'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Awaiting your response on the proposal.",
        })
      ).toBe(true);
    });

    it("matches when direction=outbound and body contains 'let me know'", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Let me know if you need anything else.",
        })
      ).toBe(true);
    });
  });

  describe("outbound email without question signals → no task", () => {
    it("does not match when direction=outbound but body has no pending-reply signal", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "Thanks for the meeting. I'll follow up next week.",
        })
      ).toBe(false);
    });

    it("does not match when direction=outbound but body is empty", () => {
      expect(
        conditionsMet({
          direction: "outbound",
          body: "",
        })
      ).toBe(false);
    });

    it("does not match when direction=outbound but body is missing", () => {
      expect(conditionsMet({ direction: "outbound" })).toBe(false);
    });
  });

  describe("inbound email → no awaiting_reply task", () => {
    it("does not match when direction=inbound even with question body", () => {
      expect(
        conditionsMet({
          direction: "inbound",
          body: "Can you send me the report?",
        })
      ).toBe(false);
    });
  });

  describe("no direction field → no awaiting_reply task", () => {
    it("does not match when direction field is absent", () => {
      expect(
        conditionsMet({
          body: "Please let me know what you decide.",
        })
      ).toBe(false);
    });
  });

  describe("derived field resolution for title template", () => {
    it("resolves title template with subject field", () => {
      const titleSpec = rule?.derived_fields?.["title"];
      expect(titleSpec).toBeDefined();
      expect(resolveDerivedField(titleSpec!, { subject: "Q3 Budget Approval" })).toBe(
        "Awaiting reply: Q3 Budget Approval"
      );
    });

    it("resolves title template with missing subject to empty suffix", () => {
      const titleSpec = rule?.derived_fields?.["title"];
      expect(resolveDerivedField(titleSpec!, {})).toBe("Awaiting reply: ");
    });

    it("task_type is awaiting_reply", () => {
      const spec = rule?.derived_fields?.["task_type"];
      expect(spec && "value" in spec ? spec.value : undefined).toBe("awaiting_reply");
    });

    it("status is pending", () => {
      const spec = rule?.derived_fields?.["status"];
      expect(spec && "value" in spec ? spec.value : undefined).toBe("pending");
    });

    it("due_context is reply expected", () => {
      const spec = rule?.derived_fields?.["due_context"];
      expect(spec && "value" in spec ? spec.value : undefined).toBe("reply expected");
    });
  });
});
