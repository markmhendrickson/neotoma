/**
 * Anti-regression lint: ONE source for the relationship-type vocabulary
 * (#1972 / G25).
 *
 * This is the criterion that keeps the fix fixed. The original defect was not
 * that one copy of the vocabulary was wrong — it was that there were SIXTEEN
 * copies and only one of them (`validTypes` in `services/relationships.ts`)
 * enforced anything, so fifteen could each be wrong with no test failing. One
 * of them was: `docs/developer/mcp/tool_descriptions.yaml`, loaded into the
 * live MCP tool descriptions at server boot, told every LLM client the
 * vocabulary was 8 types while the schema beside it said 28. The parity test
 * written for #1972 did not catch it, because that test inspected
 * `inputSchema.properties.relationship_type.enum` and never the description
 * string a model actually reads.
 *
 * Without a lint of this shape the enum simply grows back one PR at a time.
 *
 * WHAT IT CHECKS: no file outside the seed list may restate the vocabulary as a
 * closed set — five or more distinct type names packed into a 400-character
 * window. The window is what separates a restatement from legitimate use: a doc
 * explaining PART_OF in one paragraph and DEPENDS_ON three paragraphs later is
 * teaching two edges, while one line listing eight of them is advertising a
 * closed set that goes stale the moment someone registers a type.
 *
 * WHAT IT CANNOT CATCH, stated so nobody assumes more than it does:
 *   - a copy written with different names than the seeded ones;
 *   - a copy assembled at runtime from a data file;
 *   - a copy in a repository other than this one (the inspector's fetch is
 *     covered by code review, not by this lint).
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILT_IN_RELATIONSHIP_TYPES } from "../../src/services/relationship_types/seed_registry.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * The ONE file allowed to enumerate the vocabulary: the seed list, which is
 * where the vocabulary now lives as data. Plus this test, which necessarily
 * names some of them to do its job, and the fail-then-pass test whose whole
 * subject is the thirteen new ones.
 */
const ALLOWED = new Set([
  "src/services/relationship_types/seed_registry.ts",
  "tests/contract/relationship_type_single_source.test.ts",
  "tests/services/relationship_type_registration.test.ts",
  // The subsystem reference: a per-type semantics table documenting what each
  // BUILT-IN means. It is exempt because it explicitly frames itself as
  // non-exhaustive and points at list_relationship_types first — the table
  // teaches meaning, it does not advertise a closed set. Exempting it is a
  // judgement, and the framing sentence above the table is what makes it safe.
  "docs/subsystems/relationships.md",
  // Both rewritten in this change to assert against the registry rather than a
  // static enum; they name specific types to assert on specific behaviour.
  "tests/contract/relationship_type_enum_parity.test.ts",
  "tests/contract/openapi_schema.test.ts",
]);

/**
 * Paths where a historical enumeration is a RECORD of what the vocabulary was,
 * not an advertisement of what it is. Changing these would falsify a report.
 */
const HISTORICAL_PREFIXES = [
  "docs/reports/",
  "docs/proposals/",
  "docs/releases/",
  "docs/foundation/",
  "docs/architecture/architectural_decisions.md",
  "CHANGELOG.md",
];

/**
 * Names too ambiguous to count even inside a window: `created_by` is a field on
 * nearly every schema and `references` is an English word, so both cluster in
 * prose that has nothing to do with the vocabulary.
 */
const AMBIGUOUS = new Set(["created_by", "references"]);

/** The full seeded vocabulary. */
const ALL_NAMES = BUILT_IN_RELATIONSHIP_TYPES.map((t) => t.relationship_type);

/** The subset the density scan counts. */
const NAMES = ALL_NAMES.filter((n) => !AMBIGUOUS.has(n));


function trackedFiles(): string[] {
  // git ls-files, so untracked scratch files and node_modules never appear.
  return execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);
}

function isExempt(path: string): boolean {
  if (ALLOWED.has(path)) return true;
  if (HISTORICAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  // Generated locale site pages follow from docs/site/pages/en/*; they are
  // regenerated, not hand-maintained, so linting them duplicates the source.
  if (path.startsWith("site_pages/")) return true;
  if (path.startsWith("dist/")) return true;
  return false;
}

/** Files whose content plausibly carries an enumeration. */
const SCANNED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".yaml",
  ".yml",
  ".json",
  ".md",
  ".mdx",
];

describe("relationship-type vocabulary has ONE source (#1972)", () => {
  /**
   * A DENSE enumeration: five or more distinct type names inside a 400-character
   * window. That is the signature of a vocabulary being restated as a closed
   * set, and it is what every one of the sixteen copies looked like.
   *
   * The window is what separates a restatement from legitimate use. A doc that
   * explains PART_OF in one paragraph and DEPENDS_ON three paragraphs later is
   * teaching two edges; a line reading "PART_OF / CORRECTS / REFERS_TO /
   * SETTLES / DUPLICATE_OF / DEPENDS_ON / SUPERSEDES / EMBEDS" is advertising a
   * closed set that will be wrong the moment someone registers a type.
   *
   * Five, not three, because three names in one sentence is a plausible
   * "for example" and this lint must not fail on prose it should not govern —
   * a lint people disable is worse than no lint.
   */
  const WINDOW = 400;
  const DENSITY_THRESHOLD = 5;

  function denseEnumerations(content: string): string[] {
    const hits: Array<{ index: number; name: string }> = [];
    for (const name of NAMES) {
      const re = new RegExp(`\\b${name}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        hits.push({ index: m.index, name });
      }
    }
    hits.sort((a, b) => a.index - b.index);

    for (let i = 0; i < hits.length; i++) {
      const window = new Set<string>();
      for (let j = i; j < hits.length && hits[j].index - hits[i].index <= WINDOW; j++) {
        window.add(hits[j].name);
      }
      if (window.size >= DENSITY_THRESHOLD) return [...window];
    }
    return [];
  }

  it("no file outside the seed list restates the vocabulary as a closed set", () => {
    const offenders: Array<{ file: string; found: string[] }> = [];

    for (const file of trackedFiles()) {
      if (isExempt(file)) continue;
      if (!SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;

      let content: string;
      try {
        content = readFileSync(join(REPO_ROOT, file), "utf-8");
      } catch {
        continue;
      }

      const found = denseEnumerations(content);
      if (found.length > 0) offenders.push({ file, found });
    }

    expect(
      offenders.map((o) => `${o.file} (${o.found.length}: ${o.found.slice(0, 8).join(", ")})`),
      "These files restate the relationship-type vocabulary as a closed set. It lives in " +
        "src/services/relationship_types/seed_registry.ts and is read at runtime via " +
        "list_relationship_types — point at the tool instead of copying the list."
    ).toEqual([]);
  });

  it("the seed list is the single literal, and it carries all 28 built-ins", () => {
    // Guards the other direction: a "fix" that satisfies the lint by shrinking
    // the vocabulary would break every existing edge of a dropped type.
    expect(ALL_NAMES.length).toBe(28);
    for (const canonical of ["DEPENDS_ON", "PART_OF", "REFERS_TO", "DUPLICATE_OF"]) {
      expect(ALL_NAMES, `${canonical} must remain in the built-in vocabulary`).toContain(canonical);
    }
    // Both casings survive: collapsing the near-duplicates is a separate change
    // with real migration cost against existing edges.
    expect(ALL_NAMES).toContain("part_of");
    expect(ALL_NAMES).toContain("depends_on");
  });
});
