/**
 * Unit tests for the breaking-change documentation gate
 * (`scripts/validate_breaking_changes_documented.js`).
 *
 * The gate fails a release when the OpenAPI breaking-change diff reports a
 * breaking change but the supplement's "Breaking changes" section is missing,
 * empty, or a "none" placeholder. This is the #1841 trap: v0.18.0 tightened the
 * `observation_source` enum (a real OpenAPI break) yet shipped with a supplement
 * declaring `## Breaking changes\n- None.`.
 *
 * The breaking-change detector is dependency-injected so these tests never
 * touch git, openapi.yaml, or the filesystem.
 */

import { describe, expect, it } from "vitest";

import {
  evaluate,
  extractBreakingSection,
  sectionIsEmpty,
  // @ts-expect-error — plain .js script, no type declarations
} from "../../scripts/validate_breaking_changes_documented.js";

const TAG = "v9.9.9";

const ONE_BREAKING = [
  {
    kind: "narrowed-enum",
    key: "components.schemas.Observation.observation_source",
    detail: 'enum lost values: "cboe_live".',
  },
];

function supplementWith(breakingSection: string): string {
  return [
    "Summary line.",
    "",
    "## Highlights",
    "- Something nice.",
    "",
    "## Breaking changes",
    breakingSection,
    "",
    "## Security hardening",
    "No security-sensitive surfaces touched.",
    "",
  ].join("\n");
}

describe("validate:breaking-changes gate", () => {
  it("passes when there are NO breaking changes, regardless of the supplement", () => {
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => [],
        readSupplement: () => supplementWith("- None."),
      }
    );
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
  });

  it("passes when breaking changes exist AND are documented", () => {
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () =>
          supplementWith(
            "- **observation_source enum tightened.** Custom v0.17 labels (e.g. `cboe_live`) must move to the free-form `data_source` field. Invalid values now return `VALIDATION_ERROR`."
          ),
      }
    );
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
  });

  it("FAILS (exit 1) when breaking changes exist but the section says 'No breaking changes.'", () => {
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () => supplementWith("No breaking changes."),
      }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/breaking change/i);
  });

  it("FAILS (exit 1) when breaking changes exist but the section is '- None.' (the #1841 trap)", () => {
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () => supplementWith("- None. Every new surface is opt-in."),
      }
    );
    // "- None. Every new surface is opt-in." is NOT a pure placeholder line,
    // so it counts as documented prose. The strict trap is a bare "- None.".
    // Confirm a bare "- None." fails:
    const strict = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () => supplementWith("- None."),
      }
    );
    expect(strict.ok).toBe(false);
    expect(strict.code).toBe(1);
    // The prose-bearing variant is treated as documented (non-empty).
    expect(result.ok).toBe(true);
  });

  it("FAILS (exit 1) when the 'Breaking changes' section is entirely missing", () => {
    const noSection = [
      "Summary line.",
      "",
      "## Highlights",
      "- Something nice.",
      "",
      "## Security hardening",
      "No security-sensitive surfaces touched.",
      "",
    ].join("\n");
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () => noSection,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
  });

  it("errors (exit 2) when the supplement file is absent", () => {
    const result = evaluate(
      { tag: TAG, base: "v0.0.0", head: "HEAD" },
      {
        detectBreaking: () => ONE_BREAKING,
        readSupplement: () => null,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe(2);
    expect(result.message).toMatch(/supplement not found/i);
  });
});

describe("extractBreakingSection", () => {
  it("returns null when the heading is missing", () => {
    expect(extractBreakingSection("## Highlights\n- x\n")).toBeNull();
  });

  it("captures only the section body up to the next heading", () => {
    const md = "## Breaking changes\n- a\n- b\n\n## Next\n- c\n";
    expect(extractBreakingSection(md)).toBe("- a\n- b\n");
  });
});

describe("sectionIsEmpty", () => {
  it.each(["", "- None.", "None", "No breaking changes.", "- N/A", "  none  "])(
    "treats %j as empty",
    (body) => {
      expect(sectionIsEmpty(body)).toBe(true);
    }
  );

  it("treats real prose as non-empty", () => {
    expect(sectionIsEmpty("- **Enum tightened.** Move to data_source.")).toBe(false);
  });

  it("treats null (missing section) as empty", () => {
    expect(sectionIsEmpty(null)).toBe(true);
  });
});
