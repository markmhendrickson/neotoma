/**
 * Regression test for issue #325: plan `body` field description was
 * insufficient, causing agents to store content in `overview`/`goals`
 * instead of `body`.
 *
 * Verifies that the body field description in PLAN_FIELD_SPECS explicitly:
 * - calls `body` the primary long-form content field
 * - warns against splitting content into `overview` or `goals`
 * - mentions that the field is rendered as the document body in the mirror
 */
import { describe, expect, it } from "vitest";
import { PLAN_FIELD_SPECS } from "../../src/services/plans/seed_schema.js";

describe("plan seed schema — body field description (issue #325)", () => {
  it("declares body as the primary long-form content field", () => {
    const bodySpec = PLAN_FIELD_SPECS.find((f) => f.name === "body");
    expect(bodySpec).toBeDefined();
    expect(bodySpec!.description).toMatch(/primary/i);
    expect(bodySpec!.description).toMatch(/long.form content/i);
  });

  it("warns against splitting content into overview or goals", () => {
    const bodySpec = PLAN_FIELD_SPECS.find((f) => f.name === "body")!;
    expect(bodySpec.description).toMatch(/overview/);
    expect(bodySpec.description).toMatch(/goals/);
    expect(bodySpec.description).toMatch(/do not split/i);
  });

  it("mentions the markdown mirror rendering", () => {
    const bodySpec = PLAN_FIELD_SPECS.find((f) => f.name === "body")!;
    expect(bodySpec.description).toMatch(/mirror/i);
  });
});
