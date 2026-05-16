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
  it("unset + non-production shows internal", () => {
    expect(shouldShowInternal({ NODE_ENV: "development" })).toBe(true);
    expect(shouldShowInternal({ NODE_ENV: "test" })).toBe(true);
    expect(shouldShowInternal({})).toBe(true);
  });
});

describe("isVisible", () => {
  it("public docs are always visible", () => {
    expect(isVisible({ visibility: "public" }, { NODE_ENV: "production" })).toBe(true);
    expect(isVisible({ visibility: "public" }, { NEOTOMA_DOCS_SHOW_INTERNAL: "false" })).toBe(true);
  });
  it("internal docs gated by shouldShowInternal", () => {
    expect(isVisible({ visibility: "internal" }, { NODE_ENV: "production" })).toBe(false);
    expect(isVisible({ visibility: "internal" }, { NODE_ENV: "development" })).toBe(true);
    expect(
      isVisible({ visibility: "internal" }, { NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" }),
    ).toBe(true);
  });
});
