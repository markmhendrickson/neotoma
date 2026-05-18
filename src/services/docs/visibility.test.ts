import { describe, it, expect } from "vitest";
import { isVisible, shouldShowInternal } from "./visibility.js";

describe("shouldShowInternal", () => {
  it("explicit true wins", () => {
    expect(shouldShowInternal({ NEOTOMA_DOCS_SHOW_INTERNAL: "true", NODE_ENV: "production" })).toBe(true);
  });
  it("explicit false wins", () => {
    expect(shouldShowInternal({ NEOTOMA_DOCS_SHOW_INTERNAL: "false", NODE_ENV: "development" })).toBe(false);
  });
  it("unset + production hides internal", () => {
    expect(shouldShowInternal({ NODE_ENV: "production" })).toBe(false);
  });
  it("unset fails closed in all environments", () => {
    expect(shouldShowInternal({ NODE_ENV: "development" })).toBe(false);
    expect(shouldShowInternal({ NODE_ENV: "test" })).toBe(false);
    expect(shouldShowInternal({ NODE_ENV: "staging" })).toBe(false);
    expect(shouldShowInternal({})).toBe(false);
  });
});

describe("isVisible", () => {
  it("public docs are always visible", () => {
    expect(isVisible({ visibility: "public" }, { NODE_ENV: "production" })).toBe(true);
    expect(isVisible({ visibility: "public" }, { NEOTOMA_DOCS_SHOW_INTERNAL: "false" })).toBe(true);
  });
  it("internal docs gated by shouldShowInternal", () => {
    expect(isVisible({ visibility: "internal" }, { NODE_ENV: "production" })).toBe(false);
    expect(isVisible({ visibility: "internal" }, { NODE_ENV: "development" })).toBe(false);
    expect(
      isVisible({ visibility: "internal" }, { NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" }),
    ).toBe(true);
  });
});
