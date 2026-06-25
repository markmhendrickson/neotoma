import { describe, it, expect } from "vitest";
import {
  isVisible,
  shouldShowInternal,
  isNonPublicTopFolder,
  isIndexExcludedTopFolder,
  NON_PUBLIC_TOP_FOLDERS,
} from "./visibility.js";

describe("shouldShowInternal", () => {
  it("explicit true wins", () => {
    expect(shouldShowInternal({ NEOTOMA_DOCS_SHOW_INTERNAL: "true", NODE_ENV: "production" })).toBe(
      true
    );
  });
  it("explicit false wins", () => {
    expect(
      shouldShowInternal({ NEOTOMA_DOCS_SHOW_INTERNAL: "false", NODE_ENV: "development" })
    ).toBe(false);
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
      isVisible(
        { visibility: "internal" },
        { NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" }
      )
    ).toBe(true);
  });
});

describe("isNonPublicTopFolder", () => {
  it("matches paths under non-public top folders", () => {
    expect(isNonPublicTopFolder("releases/in_progress/foo.md")).toBe(true);
    expect(isNonPublicTopFolder("feature_units/bar.md")).toBe(true);
    expect(isNonPublicTopFolder("plans/draft.md")).toBe(true);
  });
  it("does not match public-surface folders or top-level files", () => {
    expect(isNonPublicTopFolder("foundation/core_identity.md")).toBe(false);
    expect(isNonPublicTopFolder("getting_started/what_is_neotoma.md")).toBe(false);
    expect(isNonPublicTopFolder("NEOTOMA_MANIFEST.md")).toBe(false);
    // `site` is a bundler-only (packaging) exclusion, not a surface exclusion.
    expect(isNonPublicTopFolder("site/pages/en/install.md")).toBe(false);
  });
  it("keeps the set and predicate in sync", () => {
    for (const folder of NON_PUBLIC_TOP_FOLDERS) {
      expect(isNonPublicTopFolder(`${folder}/x.md`)).toBe(true);
    }
  });
});

describe("isIndexExcludedTopFolder", () => {
  it("excludes the non-public folders AND site from the browsable index", () => {
    expect(isIndexExcludedTopFolder("releases/v1.md")).toBe(true);
    expect(isIndexExcludedTopFolder("feature_units/x.md")).toBe(true);
    // site/ is index-excluded here (unlike isNonPublicTopFolder, which keeps it
    // resolvable for direct lookup).
    expect(isIndexExcludedTopFolder("site/pages/en/install.md")).toBe(true);
    expect(isNonPublicTopFolder("site/pages/en/install.md")).toBe(false);
  });
  it("keeps public-surface folders in the index", () => {
    expect(isIndexExcludedTopFolder("foundation/core_identity.md")).toBe(false);
    expect(isIndexExcludedTopFolder("getting_started/what_is_neotoma.md")).toBe(false);
  });
});
