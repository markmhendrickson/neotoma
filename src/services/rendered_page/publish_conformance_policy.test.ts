import { afterEach, describe, expect, it, vi } from "vitest";

// A stored conformance_policy holding a refused pattern is skipped end to end
// through the publish path; the other rules in the policy still apply.

const POLICY_RULES = [
  { code: "REFUSED_PATTERN", pattern: "^(a+)+$", mode: "require_present", severity: "warn" },
  { code: "ORDINARY_RULE", pattern: "data-required", mode: "require_present", severity: "warn" },
];

vi.mock("../../config.js", () => ({
  config: { apiBase: "https://neotoma.example.com", httpPort: 3000 },
}));

vi.mock("../guest_access_token.js", () => ({
  generateGuestAccessToken: vi.fn(async () => "test-token"),
}));

vi.mock("../entity_queries.js", () => ({
  getEntityWithProvenance: vi.fn(async (id: string) =>
    id === "ent_policy"
      ? { snapshot: { rules: POLICY_RULES } }
      : { snapshot: { html_body: "<p>hello</p>" } }
  ),
}));

vi.mock("../../db.js", () => {
  const chain = (table: string) => {
    const state: { cols: string[] } = { cols: [] };
    const self: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit"]) self[m] = () => self;
    self.eq = (col: string) => {
      state.cols.push(col);
      return self;
    };
    self.maybeSingle = async () => {
      if (table !== "entities") return { data: null, error: null };
      return state.cols.includes("entity_type")
        ? { data: { id: "ent_policy" }, error: null }
        : { data: { id: "ent_page", user_id: "u1", entity_type: "rendered_page" }, error: null };
    };
    return self;
  };
  return { db: { from: (table: string) => chain(table) } };
});

import { publishRenderedPage } from "./publish.js";

afterEach(() => vi.clearAllMocks());

describe("publishRenderedPage with a stored policy holding a refused pattern", () => {
  it("skips the refused rule and still applies the others", async () => {
    const result = await publishRenderedPage(
      { entityId: "ent_page", userId: "u1" },
      async () => "unused"
    );
    const codes = (result.conformance_warnings ?? []).map((w) => w.code);
    expect(codes).not.toContain("REFUSED_PATTERN");
    expect(codes).toContain("ORDINARY_RULE");
  });
});
