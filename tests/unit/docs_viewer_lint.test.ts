import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocsViewerIndex } from "../../frontend/src/site/docs_viewer_manifest";
import { findClaimProblems } from "../../scripts/docs_viewer/claim_patterns";
import { LINT_RULES, errorsOf, lintDoc } from "../../scripts/docs_viewer/lint";
import { type RenderContext, parseDoc } from "../../scripts/docs_viewer/render";

const root = join(__dirname, "..", "..");
const FIXTURE = "tests/fixtures/docs_viewer/clean.md";
const files = new Set([
  "docs/api/rest_api.md",
  "docs/developer/cli_reference.md",
  "docs/foundation/core_identity.md",
  "docs/img/diagram.png",
]);
const dirs = new Set(["packages", "docs"]);

const ctx = (sourcePath = "docs/developer/x.md"): RenderContext => ({
  sourcePath,
  commit: "0123456789abcdef0123456789abcdef01234567",
  index: buildDocsViewerIndex([]),
  pathKind: (p) => (files.has(p) ? "file" : dirs.has(p) ? "dir" : null),
});

/** A document that passes, with `body` appended under its own section. */
function doc(body: string): string {
  return `# Title\n\nA summary sentence.\n\nApplies to v0.25.0 and main.\n\n## Section\n\n${body}\n`;
}

function rules(md: string, opts: { fileSize?: (p: string) => number | null } = {}): string[] {
  const c = ctx();
  return lintDoc(parseDoc(c.sourcePath, md), c, opts).map((f) => f.rule);
}

describe("docs viewer lint", () => {
  it("passes the clean fixture with no findings at all", () => {
    const md = readFileSync(join(root, FIXTURE), "utf-8");
    const c = ctx(FIXTURE);
    expect(lintDoc(parseDoc(FIXTURE, md), c)).toEqual([]);
  });

  it("passes the base document used by every case below", () => {
    expect(rules(doc("Plain text."))).toEqual([]);
  });

  const cases: [rule: string, body: string][] = [
    ["retired-noun", "Neotoma is a memory layer for agents."],
    ["retired-noun", "The state layer keeps records."],
    ["retired-noun", "Your agents forget everything."],
    ["retired-noun", "It provides deterministic state for agents."],
    ["retired-noun", "```mermaid\nflowchart LR\n  a[State Layer] --> b\n```"],
    ["omitted-claim", "Corrections always win over later writes."],
    ["omitted-claim", "The database is append-only and enforced."],
    ["omitted-claim", "An immutable audit trail of every change."],
    ["omitted-claim", "Supports time-travel queries."],
    ["omitted-claim", "You can replay any historical state."],
    ["omitted-claim", "Export includes the full history."],
    ["omitted-claim", "Hosted Neotoma is available for teams."],
    ["omitted-claim", "A unified platform for agents."],
    ["omitted-claim", "Multi-operator authority is built in."],
    ["telemetry", "Neotoma sends no telemetry."],
    ["telemetry", "Transport: local stdio (no network egress)."],
    ["retired-route-link", "See [integrations](https://neotoma.io/integrations)."],
    ["dead-link", "See [local install](../foundation/local_install.md)."],
    ["dead-link", "See [outside](../../../../etc/passwd)."],
    ["blocked-link", "Click [here](javascript:alert(1))."],
    ["fence-language", "```\nneotoma status\n```"],
    ["heading-depth", "#### Too deep"],
    ["raw-html", "Run `neotoma` with <command> and go."],
    ["raw-html", "<div>block</div>"],
    ["details", "<details>\n<summary>More</summary>\n\nHidden.\n\n</details>"],
    ["github-alert", "> [!NOTE]\n> Read this."],
    ["task-list", "- [ ] Do the thing\n- [x] Done"],
    ["status-emoji", "| Host | Status |\n| --- | --- |\n| Cursor | ✅ |"],
    ["status-emoji", "Status: :white_check_mark: shipped."],
    ["image-alt", "![](../img/diagram.png)"],
    ["image-source", "![diagram](https://example.com/remote.png)"],
  ];

  for (const [rule, body] of cases) {
    it(`flags ${rule}: ${JSON.stringify(body.slice(0, 50))}`, () => {
      expect(rules(doc(body))).toContain(rule);
      expect(LINT_RULES[rule].severity).toBe("error");
    });
  }

  it("flags an oversized image", () => {
    expect(rules(doc("![diagram](../img/diagram.png)"), { fileSize: () => 5_000_000 })).toContain(
      "image-source"
    );
    expect(rules(doc("![diagram](../img/diagram.png)"), { fileSize: () => 50_000 })).toEqual([]);
  });

  it("warns, but does not fail, on a missing applicability line and a missing summary", () => {
    const c = ctx();
    const findings = lintDoc(parseDoc(c.sourcePath, "# Title\n\n## Scope\n\nText.\n"), c);
    expect(findings.map((f) => f.rule).sort()).toEqual([
      "missing-applicability",
      "missing-summary",
    ]);
    expect(errorsOf(findings)).toEqual([]);
  });

  it("does not ban as-of wording, negated claims, inline-code identifiers or qualified telemetry claims", () => {
    for (const ok of [
      "A snapshot can be read as of a past time for one entity.",
      "There is no as-of query across the whole record.",
      "The database does not enforce append-only writes.",
      "Export writes current state; observation history is not part of the export.",
      "Name the forbidden term as `state layer` in the vocabulary.",
      "There is no telemetry; the CLI update check queries the npm registry (turn it off with --no-update-check).",
      "Links to [install](https://neotoma.io/install) and [evaluate](https://neotoma.io/evaluate) are fine.",
      "MIT © the authors ↔ arrows are text.",
    ]) {
      expect(rules(doc(ok)), ok).toEqual([]);
    }
  });

  it("reports line numbers in the source file, after front matter", () => {
    const c = ctx();
    const md =
      "---\ntitle: T\n---\n# T\n\nA summary sentence.\n\nApplies to main.\n\nThe state layer.\n";
    const f = lintDoc(parseDoc(c.sourcePath, md), c).find((x) => x.rule === "retired-noun");
    expect(f?.line).toBe(10);
  });
});

describe("shared claim patterns", () => {
  it("is the single list behind the lint and the export validator", () => {
    const lint = readFileSync(join(root, "scripts/docs_viewer/lint.ts"), "utf-8");
    const validator = readFileSync(join(root, "scripts/docs_viewer/validate_export.ts"), "utf-8");
    expect(lint).toContain('from "./claim_patterns"');
    expect(validator).toContain('from "./claim_patterns"');
  });

  it("finds a telemetry claim only when the update check is not named nearby", () => {
    expect(findClaimProblems("No telemetry.").map((f) => f.id)).toEqual(["telemetry"]);
    expect(findClaimProblems("No telemetry. The update check contacts the npm registry.")).toEqual(
      []
    );
  });
});
