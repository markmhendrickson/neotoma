import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocsViewerIndex } from "../../frontend/src/site/docs_viewer_manifest";
import {
  DOCS_CLAIM_PATTERNS,
  LIVE_PAGE_CLAIM_PATTERNS,
  LIVE_PAGE_EXTRA_CLAIMS,
  TELEMETRY_REQUIRED_FRAGMENTS,
  findClaimProblems,
} from "../../scripts/docs_viewer/claim_patterns";
import { LINT_RULES, errorsOf, lintDoc } from "../../scripts/docs_viewer/lint";
import { type RenderContext, parseDoc } from "../../scripts/docs_viewer/render";

const root = join(__dirname, "..", "..");
const FULL_TELEMETRY =
  "The CLI checks the npm registry about once a day; the stdio MCP server checks when a session starts (off with NO_UPDATE_NOTIFIER=1), and the registry sees ordinary connection metadata such as the address.";
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

  it("does not ban as-of wording, negated claims or fully qualified telemetry claims", () => {
    for (const ok of [
      "A snapshot can be read as of a past time for one entity.",
      "There is no as-of query across the whole record.",
      "The database does not enforce append-only writes.",
      "There is no time travel across the record.",
      "Export writes current state; observation history is not part of the export.",
      "Events are not hash-chained.",
      `There is no telemetry. ${FULL_TELEMETRY}`,
      "Links to [install](https://neotoma.io/install) and [evaluate](https://neotoma.io/evaluate) are fine.",
      "MIT © the authors ↔ arrows are text.",
    ]) {
      expect(rules(doc(ok)), ok).toEqual([]);
    }
  });

  it("flags the widened claims, each on its own", () => {
    for (const bad of [
      "The log is append-only.",
      "Events are hash-chained.",
      "The event log uses a hash chain.",
      "Each event stores previous_event_hash.",
      "A tamper-evident record.",
      "Corrections win over later writes.",
      "The correction wins.",
      "Corrections always override later writes.",
    ]) {
      expect(rules(doc(bad)), bad).toContain("omitted-claim");
    }
  });

  it("only exempts a negation near the claim, in the same clause", () => {
    expect(rules(doc("The database log is append-only and we never lose data."))).toContain(
      "omitted-claim"
    );
    expect(rules(doc("We never lose data, and the log is append-only."))).toContain(
      "omitted-claim"
    );
    expect(rules(doc("The log is not append-only."))).toEqual([]);
    expect(rules(doc("Nothing here is time travel; there is no replay."))).toContain(
      "omitted-claim"
    );
  });

  it("requires the full telemetry wording, the same fragments the live pages need", () => {
    expect(
      rules(doc("No telemetry; the CLI checks the npm registry (--no-update-check)."))
    ).toContain("telemetry");
    expect(rules(doc(`No telemetry. ${FULL_TELEMETRY}`))).toEqual([]);
  });

  it("reports line numbers in the source file, after front matter", () => {
    const c = ctx();
    const md =
      "---\ntitle: T\n---\n# T\n\nA summary sentence.\n\nApplies to main.\n\nThe state layer.\n";
    const f = lintDoc(parseDoc(c.sourcePath, md), c).find((x) => x.rule === "retired-noun");
    expect(f?.line).toBe(10);
  });
});

describe("docs viewer lint: forbidden-terms contexts", () => {
  const passes: [string, string][] = [
    [
      "a lead-in and its list",
      '**Forbidden synonyms:**\n\n- "state layer" (retired category noun)\n- "memory layer"',
    ],
    [
      "an allow-listed heading",
      '## Forbidden terms in code and docs\n\n- "memory layer", "state layer" and "deterministic state": say "system of record"',
    ],
    ["inline code in a forbidden list", "**Forbidden synonyms:**\n\n- `state layer`"],
    [
      "the retired-phrase sentence",
      'The phrase "your agents forget" is also retired as a framing.',
    ],
    ["an Avoid list of examples", 'Avoid:\n\n- "Neotoma is the memory layer for your agents."'],
    ["a marked fenced line", "```text\nForbidden: state layer, memory layer\n```"],
  ];
  for (const [label, body] of passes) {
    it(`exempts ${label}`, () => expect(rules(doc(body))).toEqual([]));
  }
  const fails: [string, string][] = [
    [
      "an unquoted term in a forbidden list",
      "**Forbidden synonyms:**\n\n- state layer as the name of the category",
    ],
    ["a quoted term outside any context", 'Neotoma is a "state layer" for agents.'],
    ["inline code outside any context", "Neotoma is the `state layer` for agents."],
    ["a heading that is not exactly allow-listed", '## Forbidden-ish terms\n\n- "state layer"'],
    ["a list after an ordinary paragraph", 'Some terms:\n\n- "state layer"'],
    [
      "a paragraph (not a list) under a forbidden heading",
      '## Forbidden terms\n\nWe call it a "state layer".',
    ],
    [
      "the second list after a lead-in",
      '**Forbidden synonyms:**\n\n- "data layer"\n\nText.\n\n- "state layer"',
    ],
    [
      "a section after the forbidden heading ends",
      '## Forbidden terms\n\n- "data layer"\n\n## Usage\n\n- "state layer"',
    ],
    ["a mermaid label", "```mermaid\nflowchart LR\n  a[State Layer] --> b\n```"],
    [
      "a retired-phrase sentence naming two phrases",
      'The phrase "your agents forget" is retired; so is "memory layer".',
    ],
  ];
  for (const [label, body] of fails) {
    it(`still flags ${label}`, () => expect(rules(doc(body))).toContain("retired-noun"));
  }
});

describe("docs viewer lint: Agent Instructions", () => {
  it("does not lint (or render) a trailing Agent Instructions section", () => {
    expect(
      rules(
        doc(
          "Text.\n\n## Agent Instructions\n\n### Forbidden patterns\n\n- Calling it a state layer\n\n```\nno lang\n```"
        )
      )
    ).toEqual([]);
  });
  it("still lints an Agent Instructions section that is not the last section", () => {
    expect(
      rules(doc("Text.\n\n## Agent Instructions\n\nThe state layer.\n\n## More\n\nText."))
    ).toContain("retired-noun");
  });
});

describe("shared claim patterns", () => {
  it("is the single list behind the lint and the export validator", () => {
    const lint = readFileSync(join(root, "scripts/docs_viewer/lint.ts"), "utf-8");
    const validator = readFileSync(join(root, "scripts/docs_viewer/validate_export.ts"), "utf-8");
    expect(lint).toContain('from "./claim_patterns"');
    expect(validator).toContain('from "./claim_patterns"');
    // Section 3g of the site export validator uses the shared live list and telemetry fragments.
    const site = readFileSync(join(root, "scripts/validate_site_export.ts"), "utf-8");
    expect(site).toContain('from "./docs_viewer/claim_patterns"');
    expect(site).toContain("LIVE_PAGE_CLAIM_PATTERNS");
    expect(site).toContain("telemetryProblems(");
    expect(site).not.toMatch(/const (RETIRED_META_PHRASES|OMITTED_CLAIMS)\b/);
    expect(site).not.toMatch(/NO_UPDATE_NOTIFIER=1\/\.test/);
  });

  it("makes the live-page list a superset of the docs list, with every extra named", () => {
    const live = new Map(LIVE_PAGE_CLAIM_PATTERNS.map((p) => [p.name, p]));
    for (const p of DOCS_CLAIM_PATTERNS) {
      expect(live.get(p.name)?.re.source, p.name).toBe(p.re.source);
    }
    const docsNames = new Set(DOCS_CLAIM_PATTERNS.map((p) => p.name));
    for (const p of LIVE_PAGE_EXTRA_CLAIMS) {
      expect(p.name.startsWith("live-"), p.name).toBe(true);
      expect(docsNames.has(p.name)).toBe(false);
    }
    expect(new Set(LIVE_PAGE_CLAIM_PATTERNS.map((p) => p.name)).size).toBe(
      LIVE_PAGE_CLAIM_PATTERNS.length
    );
  });

  it("flags on live pages everything a docs page is flagged for", () => {
    for (const text of [
      "Corrections always override later writes.",
      "Hosted Neotoma pricing starts at ten dollars.",
      "Buy a hosted instance today.",
      "Managed Neotoma runs for you.",
      "Supports time travel across the record.",
      "Events are hash-chained.",
    ]) {
      const docsHits = findClaimProblems(text).length;
      expect(docsHits, text).toBeGreaterThan(0);
      expect(findClaimProblems(text, LIVE_PAGE_CLAIM_PATTERNS).length, text).toBeGreaterThanOrEqual(
        docsHits
      );
    }
    // And the live extras are stricter than docs.
    expect(findClaimProblems("The database does not enforce append-only writes.")).toEqual([]);
    expect(
      findClaimProblems(
        "The database does not enforce append-only writes.",
        LIVE_PAGE_CLAIM_PATTERNS
      ).length
    ).toBe(1);
  });

  it("names the four telemetry fragments the live pages require", () => {
    expect(TELEMETRY_REQUIRED_FRAGMENTS.map((f) => f.label)).toEqual([
      "the npm registry",
      "NO_UPDATE_NOTIFIER=1",
      "the check when a session starts",
      "connection metadata",
    ]);
    // Without the session-start check, a docs page fails exactly as a live page does.
    expect(
      findClaimProblems(
        "No telemetry. The CLI checks the npm registry (NO_UPDATE_NOTIFIER=1 turns it off); the registry sees connection metadata."
      ).map((f) => f.id)
    ).toEqual(["telemetry"]);
  });

  it("finds a telemetry claim unless every shared fragment follows it", () => {
    expect(findClaimProblems("No telemetry.").map((f) => f.id)).toEqual(["telemetry"]);
    expect(findClaimProblems(`No telemetry. ${FULL_TELEMETRY}`)).toEqual([]);
    for (const f of TELEMETRY_REQUIRED_FRAGMENTS) {
      const without = FULL_TELEMETRY.replace(f.re, "x");
      expect(
        findClaimProblems(`No telemetry. ${without}`).map((x) => x.id),
        f.label
      ).toEqual(["telemetry"]);
    }
  });

  it("stays linear on pathological input", () => {
    const inputs = [
      "append-only ".repeat(20_000),
      "not ".repeat(50_000) + "append-only",
      "no telemetry ".repeat(15_000),
      "export ".repeat(30_000),
      "hosted neotoma ".repeat(15_000),
    ];
    for (const text of inputs) {
      const t0 = performance.now();
      findClaimProblems(text, LIVE_PAGE_CLAIM_PATTERNS);
      expect(performance.now() - t0, text.slice(0, 20)).toBeLessThan(1000);
    }
  });
});
