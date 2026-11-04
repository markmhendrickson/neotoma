import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "../../frontend/src/i18n/LocaleContext";
import { describe, expect, it } from "vitest";
import { NeotomaOnePager } from "../../frontend/src/components/onepager/NeotomaOnePager";
import { isRetiredRoute, resolveDestination } from "../../frontend/src/site/route_retirement";
import { DOCS_VIEWER_INDEX } from "../../frontend/src/site/docs_viewer_manifest";
import { dedupeJsonLd, headMetaText, jsonLdBlocks } from "../../scripts/site_html";
import { pageText } from "../../scripts/docs_viewer/validate_export";
import {
  DOCS_CLAIM_PATTERNS,
  LIVE_PAGE_CLAIM_PATTERNS,
  SERVED_PAGE_STATEMENTS,
  findClaimProblems,
} from "../../scripts/docs_viewer/claim_patterns";
import { resolveSeoMetadata } from "../../frontend/src/site/seo_metadata";
import { REPO_VERSION } from "../../frontend/src/site/site_data";
import {
  EVALUATE_SUBPAGE_EN,
  EVALUATE_SUBPAGE_ES,
} from "../../frontend/src/i18n/locales/evaluate_subpage_strings";

/**
 * Guards for served-site statements a prior shipping-commit claims check found wrong. Each one
 * states current behaviour in plain words, so it is easy to relax
 * when the product behaviour changes. scripts/validate_site_export.ts repeats the page-level checks on the
 * built HTML. Revert-check: put any retired statement back into its source and the matching test goes red.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf-8");

describe("one-pager sheets 02 to 04", () => {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(NeotomaOnePager)))
  );
  const text = pageText(markup).replace(/\s+/g, " ");
  const examples = read("frontend", "src", "components", "onepager", "source_examples.ts");
  it("renders source-bearing illustrative calls with variable IDs", () => {
    for (const cmd of [
      'neotoma --api-only --base-url "$NEOTOMA_URL" --json store',
      "--file-path invoice.pdf",
      "--file-path due-date-email.txt",
      "--operation getEntitySnapshot",
    ]) {
      expect(text, cmd).toContain(cmd);
    }
    expect(text).toContain("Set INVOICE_ID to that returned ID, not the invoice number.");
    expect(text).toContain("$INVOICE_ID");
    expect(text).not.toMatch(
      /ids are from one run|\$ neotoma (store|corrections|entities|observations)\b/i
    );
    expect(text).toContain("Gmail MCP");
    expect(text).toContain("Neotoma MCP");
    expect(text).toContain("Observation history retains the original October 22 date");
    expect(text).not.toContain("Read the store response for the actual entity ID");
    expect(text).toContain('"$NEOTOMA_URL/store"');
    expect(text).not.toContain('"$NEOTOMA_URL/correct"');
    expect(examples).toContain("Authorization: Bearer $NEOTOMA_TOKEN");
  });
  it("limits shared reads to a configured instance and matching entry or profile", () => {
    expect(text).toContain("same instance and data profile");
    expect(text).toContain("separate entries can use separate databases");
    expect(text).not.toMatch(
      /what one agent stored is what the next one reads|agents connected to the same instance read the same record/i
    );
  });
});

describe("/install", () => {
  const effects = read("docs", "topics", "install", "system-changes.md");
  const body = read("frontend", "src", "components", "install", "install_page_body.tsx");

  it("discloses complete local effects in the linked source reader before actions", () => {
    expect(body.indexOf("/install/system-changes/")).toBeLessThan(body.indexOf("<ToolInstall showPermissionsPreflight />"));
    for (const detail of [
      "two local SQLite databases",
      "~/.cursor/mcp.json",
      "neotoma init --interactive",
      "Claude Code plugin with five hooks",
      "Twelve Claude Code skills",
      ".claude/settings.local.json",
      ".cursor/allowlist.json",
      "~/.codex/config.toml",
      "Bash(neotoma:*)",
      "--skip-permissions",
      "sources_prod/",
      "logs_prod/",
      "events.prod.log",
      "npm_check_update",
      "NO_UPDATE_NOTIFIER=1",
      "without interactive confirmation",
      "NEOTOMA_DATA_DIR",
    ]) expect(effects, detail).toContain(detail);
    expect(effects).toMatch(/Cursor[^\n]*`neotoma \*`[^\n]*including reset/);
    expect(effects).toMatch(/Codex[^\n]*`neotoma \*`[^\n]*including reset/);
    expect(effects).toContain("Claude Code setup example");
    expect(effects).not.toContain("writes two MCP entries, CLI instruction files for Claude Code, Cursor, and Codex in the project, and the host permission rules above");
  });
  it("points at blocks that exist", () => {
    expect(body).toContain("<ToolInstall showPermissionsPreflight />");
    expect(read("frontend", "src", "components", "onepager", "ToolInstall.tsx"))
      .toContain("<PermissionsPreflight harness={preflightHost} />");
  });
  it("uses neutral WebPage metadata for the selected-host install flow", () => {
    const steps = resolveSeoMetadata("/install").jsonLd.flatMap((e) =>
      e["@type"] === "HowTo" ? (e["step"] as { text: string }[]) : []
    );
    expect(steps).toHaveLength(0);
    expect(resolveSeoMetadata("/install").jsonLd.some((e) => e["@type"] === "WebPage")).toBe(true);
  });
  it("keeps remaining setup-specific HowTo routes pinned", () => {
    const routes = [
      "/neotoma-with-claude-connect-desktop",
      "/neotoma-with-codex-connect-local-stdio",
    ];
    for (const route of routes) {
      const steps = resolveSeoMetadata(route).jsonLd.flatMap((entry) =>
        entry["@type"] === "HowTo" ? (entry.step as { text: string }[]) : []
      );
      expect(steps.length, route).toBeGreaterThan(0);
      const text = steps.map((step) => step.text).join(" ");
      expect(text, route).toContain(`npm install -g neotoma@${REPO_VERSION}`);
      expect(text, route).not.toMatch(/npm install -g neotoma(?:['\s]|$)/);
      expect(text, route).not.toContain("setup --tool openclaw");
    }
    const desktop = resolveSeoMetadata("/neotoma-with-claude-connect-desktop")
      .jsonLd.flatMap((entry) =>
        entry["@type"] === "HowTo" ? (entry.step as { text: string }[]) : []
      )
      .map((step) => step.text)
      .join(" ");
    expect(desktop).toContain("neotoma setup --tool claude-desktop --install-scope user");
  });
});

describe("legal prose wrapping", () => {
  it("wraps inline references without changing list-nested pre blocks", () => {
    const css = read("frontend", "src", "index.css");
    expect(css).toMatch(/\.post-prose :where\(p, li\) code:not\(pre code\)/);
    expect(css).toMatch(/\.mdx-site-page-content pre \{[^}]*overflow-x-auto/);
  });
});

describe("/evaluate below the first screen and the agent instructions page", () => {
  const retired =
    /reconstruct|state layer|replay|conflict detection|deterministic state evolution|audit trail|inference variance|log archaeology|context janitor|shadow-mode|non-destructive|memory guarantees/i;
  it("carries none of the retired comparison, facets or reconstruct wording in either locale", () => {
    for (const [name, pack] of [
      ["EN", EVALUATE_SUBPAGE_EN],
      ["ES", EVALUATE_SUBPAGE_ES],
    ] as const) {
      // The scorecard template stays English in both packs and is checked as text like the rest.
      expect(JSON.stringify(pack), name).not.toMatch(retired);
      expect("taxHeading" in pack, name).toBe(false);
      expect("comparesHeading" in pack, name).toBe(false);
    }
  });
  it("renders no comparison, tax or memory-guarantees section", () => {
    const page = read("frontend", "src", "components", "subpages", "EvaluatePage.tsx");
    expect(page).not.toMatch(
      /taxHeading|comparesHeading|memory-guarantees|non-destructive-testing/
    );
  });
  it("sends agents to the README and known limitations, not to retired pages", () => {
    const page = read(
      "frontend",
      "src",
      "components",
      "subpages",
      "EvaluateAgentInstructionsPage.tsx"
    );
    expect(page).not.toMatch(
      /reconstruct|memory-guarantees|non-destructive-testing|shadow-mode|shadow mode/i
    );
    expect(page).toContain("docs/known_limitations.md");
    // /architecture is a retired redirect stub; link the GitHub file directly.
    expect(page).not.toContain('href="/architecture"');
    expect(page).toContain("docs/architecture/architecture.md");
    expect(read("frontend", "src", "components", "subpages", "EvaluatePage.tsx")).not.toMatch(
      /localizePath\("\/architecture"/
    );
    expect(read("frontend", "src", "components", "SiteTailpiece.tsx")).not.toMatch(
      /href: "\/(architecture|faq|docs|api|mcp|cli)"/
    );
    const nav =
      read("frontend", "src", "site", "site_data.ts") +
      read("src", "services", "root_landing", "site_nav.ts");
    expect(nav).not.toContain("Where the tax shows up");
    expect(read("frontend", "src", "site", "site_data.ts")).not.toContain("ingest -> reconstruct");
  });
});

describe("404 page and the old shell footer", () => {
  it("do not offer the memory guarantees page", () => {
    const notFound = read("frontend", "src", "components", "NotFound.tsx");
    expect(notFound).not.toMatch(/Memory guarantees|state guarantees|memory-guarantees/i);
    expect(read("frontend", "src", "components", "SiteTailpiece.tsx")).not.toMatch(
      /MemoryGuarantees|memory-guarantees/
    );
  });
});

describe("skills and sandbox", () => {
  it("retitle the skills pages, drop the dead links and say record, not memory", () => {
    expect(resolveSeoMetadata("/skills").title).not.toMatch(/Agent Memory/i);
    expect(resolveSeoMetadata("/skills").description).not.toMatch(/memory/i);
    for (const slug of ["remember-email", "remember-calendar"]) {
      expect(resolveSeoMetadata(`/skills/${slug}`).description, slug).not.toMatch(/memory/i);
    }
    const catalog = read("frontend", "src", "site", "skills_catalog.ts");
    expect(catalog).not.toMatch(/googleworkspace\/mcp-|persistent memory/);
    const index = read("frontend", "src", "components", "subpages", "SkillsIndexPage.tsx");
    expect(index).not.toMatch(/markNZed|teach your agent to remember|Neotoma memory/);
    expect(index).toContain("github.com/markmhendrickson/neotoma/tree/main/skills");
    // The page every skill links to as a related skill is generated, so the internal link resolves.
    expect(resolveSeoMetadata("/skills/recover-sqlite-database").title).toContain(
      "Recover SQLite Database"
    );
    expect(
      read("frontend", "src", "components", "subpages", "SandboxLandingPage.tsx")
    ).not.toContain("your memory to persist");
  });
});

describe("markdown mirrors of retired pages", () => {
  it("are redirect stubs that go where the source page goes", () => {
    for (const source of [
      "/auditable-change-log",
      "/replayable-timeline",
      "/deterministic-memory",
      "/memory-guarantees",
    ]) {
      expect(isRetiredRoute(source), source).toBe(true);
      expect(isRetiredRoute(`/markdown${source}`), `/markdown${source}`).toBe(true);
      expect(resolveDestination(`/markdown${source}`).url).toBe(resolveDestination(source).url);
    }
  });
  it("stay served while the source page is served", () => {
    for (const route of [
      "/markdown",
      "/markdown/install",
      "/markdown/evaluate",
      "/markdown/evaluate/agent-instructions",
      "/markdown/skills",
      "/markdown/skills/ensure-neotoma",
      "/markdown/privacy",
      "/markdown/terms",
      "/markdown/sandbox",
      "/markdown/meet",
    ]) {
      expect(isRetiredRoute(route), route).toBe(false);
    }
  });
});

describe("advanced capability boundaries", () => {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(NeotomaOnePager)))
  );
  const text = pageText(markup).replace(/\s+/g, " ");
  const advanced = text.slice(
    text.indexOf("Grow your use as advanced capabilities arrive"),
    text.indexOf("Evaluate the fit")
  );
  const cards = [
    ...markup.matchAll(
      /<div class="plan-vision-content"><p class="plan-label">([^<]+)<\/p><h3>([^<]+)<\/h3><p>([^<]+)<\/p>/g
    ),
  ].map(([, status, title, detail]) => ({ status, title, detail }));
  it("shows three supported and three planned visual capabilities", () => {
    expect(advanced).toContain("Grow your use as advanced capabilities arrive");
    expect(cards.map(({ status, title }) => ({ status, title }))).toEqual([
      { status: "Supported", title: "A shared system of record" },
      { status: "Supported", title: "Verified identity and scoped access" },
      { status: "Supported", title: "Selected record exchange" },
      { status: "Planned", title: "Bounded domain ownership" },
      { status: "Planned", title: "Retained positions" },
      { status: "Planned", title: "Inspectable explanations" },
    ]);
    expect(markup).toContain('data-paper-scene="peering"');
    expect(markup).toContain('data-paper-scene="visionDomain"');
  });
  it("keeps qualifications local to their capability", () => {
    const detail = (title: string) => cards.find((card) => card.title === title)?.detail;
    expect(detail("A shared system of record")).toContain(
      "configured access to one instance and data profile"
    );
    expect(detail("Verified identity and scoped access")).toContain(
      "active scoped grants determine permitted actions"
    );
    expect(detail("Verified identity and scoped access")).toContain(
      "Other paths may have self-reported or absent writer identity"
    );
    expect(detail("Selected record exchange")).toContain(
      "without claiming complete history, files or deletions"
    );
    for (const card of cards.slice(3)) expect(card.detail).toMatch(/^Planned /);
    expect(advanced).not.toMatch(
      /every agent can read all records|any signed request can act|all history, files and deletions/i
    );
    expect(advanced).not.toContain("Current scope and limits");
  });
});

describe("/install effects reader", () => {
  it("uses a semantic table in the passive source document", () => {
    const effects = read("docs", "topics", "install", "system-changes.md");
    expect(effects).toContain("| Created or changed | Path | Scope | `neotoma reset` behavior |");
    expect(effects).toContain("## Capture and network behavior");
    expect(effects).toContain("## Reset and verify");
  });
});

describe("served-page statement list", () => {
  it("is named, distinct from the docs and live lists, and every pattern matches its own example", () => {
    const names = new Set<string>();
    for (const p of [...LIVE_PAGE_CLAIM_PATTERNS, ...SERVED_PAGE_STATEMENTS]) {
      expect(names.has(p.name), `duplicate pattern name ${p.name}`).toBe(false);
      names.add(p.name);
    }
    const docs = new Set(DOCS_CLAIM_PATTERNS.map((p) => p.name));
    for (const p of SERVED_PAGE_STATEMENTS) {
      expect(p.name.startsWith("served-"), p.name).toBe(true);
      expect(docs.has(p.name), p.name).toBe(false);
    }
    const examples = [
      "Every modification records who made it",
      "$ neotoma store --observation-source import",
      "Agents connected to the same instance read the same record.",
      "Has built their own memory system",
      "see the Permissions pre-flight block above",
      "One operator per instance is the scope today.",
    ];
    for (const text of examples) {
      expect(findClaimProblems(text, SERVED_PAGE_STATEMENTS).length, text).toBeGreaterThan(0);
    }
    expect(
      findClaimProblems(
        "Agents connected to the same MCP entry read the same record.",
        SERVED_PAGE_STATEMENTS
      )
    ).toEqual([]);
  });
});

describe("telemetry wording on the shared list", () => {
  it("needs the npm_check_update sentence next to a no-telemetry claim", () => {
    const qualified =
      "No telemetry. The interactive CLI checks the npm registry (off with NO_UPDATE_NOTIFIER=1). The stdio MCP server checks when a session starts. Agents can also call the npm_check_update tool. The registry sees ordinary connection metadata.";
    expect(findClaimProblems(qualified, [])).toEqual([]);
    expect(
      findClaimProblems(qualified.replace("npm_check_update", "update tool"), []).map((f) => f.id)
    ).toContain("telemetry");
  });
});

describe("markdown mirror of a docs viewer page", () => {
  it("is a stub to the viewer page itself", () => {
    const route = [...DOCS_VIEWER_INDEX.byRoute.keys()][0];
    expect(route).toBeTruthy();
    expect(isRetiredRoute(route)).toBe(false);
    expect(isRetiredRoute(`/markdown${route}`)).toBe(true);
    expect(resolveDestination(`/markdown${route}`).url).toBe(`https://neotoma.io${route}/`);
  });
});

describe("linear HTML helpers", () => {
  const block = (n: number) =>
    `<script type="application/ld+json" data-rh="true">{"n":${n}}</script>`;
  it("remove a duplicated JSON-LD block and keep distinct ones", () => {
    const html = `<head>${block(1)}\n${block(2)}\n</head><body>x</body><script type="application/ld+json">{"n":1}</script>\n${block(3)}`;
    const out = dedupeJsonLd(html);
    expect(jsonLdBlocks(out).map((b) => b.trim())).toEqual(['{"n":1}', '{"n":2}', '{"n":3}']);
    expect(out).toContain("<body>x</body>");
    // A page with no duplicates is returned unchanged.
    const clean = `<head>${block(1)}${block(2)}</head>`;
    expect(dedupeJsonLd(clean)).toBe(clean);
  });
  it("stay fast on unterminated markup (the lazy script and style strip took seconds)", () => {
    const hostile =
      "<script>".repeat(8000) +
      "<style>".repeat(8000) +
      '<a href="x'.repeat(4000) +
      "<title>" +
      "x".repeat(40000);
    expect(hostile.length).toBeGreaterThan(150000);
    const t0 = performance.now();
    pageText(hostile);
    headMetaText(hostile);
    jsonLdBlocks(hostile);
    dedupeJsonLd(hostile);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
