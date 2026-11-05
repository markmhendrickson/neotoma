import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DOCS_VIEWER_INDEX,
  DOCS_VIEWER_MANIFEST,
  buildDocsViewerIndex,
  type DocsViewerEntry,
} from "../../frontend/src/site/docs_viewer_manifest";
import {
  type RenderContext,
  Slugger,
  githubSlug,
  parseDoc,
  renderDoc,
  resolveLink,
} from "../../scripts/docs_viewer/render";
import { isSafeHref, serializeHast } from "../../scripts/docs_viewer/serialize";
import {
  CONTENTS_H3_WORDS,
  META_DESCRIPTION_MAX,
  metaDescription,
  renderPage,
} from "../../scripts/docs_viewer/page";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const GH = "https://github.com/markmhendrickson/neotoma";
afterEach(() => vi.unstubAllEnvs());

const entries: DocsViewerEntry[] = [
  {
    id: "rest-api",
    slug: "rest-api",
    source: "docs/api/rest_api.md",
    title: "REST API",
    group: "Start here",
    collection: "interfaces",
    order: 40,
    status: "included",
  },
  {
    id: "readme",
    slug: "readme",
    source: "README.md",
    title: "README",
    group: "Start here",
    collection: "start",
    order: 10,
    status: "included",
  },
];
const index = buildDocsViewerIndex(entries);
const files = new Set([
  "docs/developer/cli_reference.md",
  "docs/foundation/core_identity.md",
  "openapi.yaml",
  "README.md",
  "docs/api/rest_api.md",
  "docs/README.md",
]);
const dirs = new Set(["packages", "packages/client", "docs", "docs/developer"]);

function ctx(sourcePath = "docs/developer/mcp_overview.md"): RenderContext {
  return {
    sourcePath,
    commit: COMMIT,
    index,
    pathKind: (p) => (files.has(p) ? "file" : dirs.has(p) ? "dir" : null),
  };
}

function render(md: string, sourcePath?: string) {
  const c = ctx(sourcePath);
  return renderDoc(parseDoc(c.sourcePath, md), c);
}

describe("docs viewer link rewriting", () => {
  it("turns a link to a published document into its viewer route, keeping the anchor", () => {
    expect(resolveLink("../api/rest_api.md#authentication", ctx())).toMatchObject({
      kind: "viewer",
      href: "/rest-api/#authentication",
    });
    expect(resolveLink("../../README.md", ctx())).toMatchObject({
      kind: "viewer",
      href: "/readme/",
    });
  });

  it("resolves per source file: root-relative README links and docs-relative links reach the same file", () => {
    expect(resolveLink("docs/api/rest_api.md", ctx("README.md")).href).toBe("/rest-api/");
    expect(resolveLink("/docs/api/rest_api.md", ctx()).href).toBe("/rest-api/");
  });

  it("keeps the repository docs folder on GitHub without publishing an index", () => {
    expect(resolveLink("docs/", ctx("README.md")).href).toBe(`${GH}/tree/${COMMIT}/docs/`);
    expect(resolveLink("../", ctx()).href).toBe(`${GH}/tree/${COMMIT}/docs/`);
  });

  it("sends any other repository path to GitHub at the build commit, tree for folders", () => {
    expect(resolveLink("cli_reference.md#setup", ctx()).href).toBe(
      `${GH}/blob/${COMMIT}/docs/developer/cli_reference.md#setup`
    );
    expect(resolveLink("../../packages/client/", ctx()).href).toBe(
      `${GH}/tree/${COMMIT}/packages/client/`
    );
    expect(resolveLink("../../openapi.yaml", ctx()).href).toBe(`${GH}/blob/${COMMIT}/openapi.yaml`);
  });

  it("never renders foundation files: links to them go to GitHub", () => {
    const foundation = buildDocsViewerIndex([
      ...entries,
      {
        id: "core",
        slug: "core",
        source: "docs/foundation/core_identity.md",
        title: "Core",
        group: "Start here",
        collection: "start",
        order: 99,
        status: "included",
      },
    ]);
    const r = resolveLink("../foundation/core_identity.md", { ...ctx(), index: foundation });
    expect(r.kind).toBe("github");
    expect(r.href).toBe(`${GH}/blob/${COMMIT}/docs/foundation/core_identity.md`);
  });

  it("rewrites a GitHub URL of a published document to the viewer, and leaves other URLs alone", () => {
    expect(resolveLink(`${GH}/blob/main/docs/api/rest_api.md#errors`, ctx()).href).toBe(
      "/rest-api/#errors"
    );
    expect(resolveLink("https://www.npmjs.com/package/neotoma", ctx())).toMatchObject({
      kind: "external",
    });
  });

  it("flags links to retired neotoma.io routes and keeps live and held ones", () => {
    expect(resolveLink("https://neotoma.io/docs/integrations", ctx()).problem).toBe(
      "retired-route"
    );
    expect(resolveLink("https://neotoma.io/install", ctx()).problem).toBeUndefined();
    expect(resolveLink("https://neotoma.io/evaluate", ctx()).problem).toBeUndefined();
    // A published viewer route is a real page, not retired.
    expect(resolveLink("https://neotoma.io/rest-api/", ctx()).problem).toBeUndefined();
  });

  it("keeps published same-site article links local in previews, with query and hash", () => {
    const context = { ...ctx("docs/topics/trust/license.md"), index: DOCS_VIEWER_INDEX };
    const local = "https://neotoma.io/local-first/?q=x#control";
    expect(resolveLink(local, context).href).toBe("/local-first/?q=x#control");
    expect(resolveLink("https://other.example/local-first/?q=x#control", context).href).toBe(
      "https://other.example/local-first/?q=x#control"
    );
    const article = renderDoc(
      parseDoc(context.sourcePath, `# License\n\n[Privacy and local control](${local})`),
      context
    );
    expect(article.html).toContain('href="/local-first/?q=x#control"');
    expect(article.html).not.toContain(local);
  });

  it("reports dead and escaping relative links", () => {
    expect(resolveLink("../foundation/local_install.md", ctx())).toMatchObject({
      kind: "broken",
      problem: "dead-link",
    });
    expect(resolveLink("../../../etc/passwd", ctx())).toMatchObject({
      kind: "broken",
      problem: "outside-repo",
      href: null,
    });
    expect(resolveLink("%E0%A4%A", ctx())).toMatchObject({ problem: "dead-link", href: null });
  });

  it("keeps same-page anchors", () => {
    expect(resolveLink("#storing", ctx())).toMatchObject({ kind: "anchor", href: "#storing" });
  });
});

describe("docs viewer sanitizer", () => {
  it("shows a script tag as text and never emits a <script> element", () => {
    const { html } = render(
      "Hello <script>alert(1)</script> world\n\n<script>\nalert(2)\n</script>\n"
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript:, data:, vbscript: and protocol-relative hrefs, including obfuscated ones", () => {
    const md = [
      "[a](javascript:alert(1))",
      "[b](JaVaScRiPt:alert(1))",
      "[c](java&#09;script:alert(1))",
      "[d](data:text/html;base64,PHNjcmlwdD4=)",
      "[e](vbscript:msgbox)",
      "[f](//evil.example/x)",
      "[g]: javascript:alert(3)\n\n[ref][g]",
      "<javascript:alert(4)>",
    ].join("\n\n");
    const { html } = render(md);
    expect(html).not.toMatch(/href="[^"]*(javascript|data:|vbscript|\/\/evil)/i);
    expect(html).not.toMatch(/javascript:alert\(1\)"/);
  });

  it("drops images that are remote or use data: URLs", () => {
    const { html } = render("![x](https://evil.example/p.png) ![y](data:image/png;base64,AAAA)");
    expect(html).not.toMatch(/<img/);
  });

  it("shows raw HTML as text: no element, no event attribute, no style", () => {
    const { html } = render(
      '<img src=x onerror="alert(1)">\n\n<div style="position:fixed" onclick="x()">hi</div>\n\n<details><summary>s</summary>t</details>\n\n<iframe src="https://evil.example"></iframe>\n\nInline <b onmouseover="x()">bold</b> and `<command>`.'
    );
    expect(html).not.toMatch(/<(img|div style|details|iframe|b )/i);
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/i);
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    expect(html).toContain("&lt;img src=x onerror=");
    expect(html).toContain("<code>&lt;command&gt;</code>");
  });

  it("escapes heading markup while retaining literal quotation marks", () => {
    const { html } = render('## Say "hi" <x> & bye');
    expect(html).toContain('Say "hi" &lt;x&gt; &amp; bye');
    expect(html).not.toContain("<x>");
  });

  it("serializer drops elements and attributes outside the allow-list even if a tree carries them", () => {
    const el = (tagName: string, properties: Record<string, unknown>, text = "x") => ({
      type: "element" as const,
      tagName,
      properties,
      children: [{ type: "text" as const, value: text }],
    });
    const html = serializeHast({
      type: "root",
      children: [
        el("script", {}, "alert(1)"),
        el("iframe", { src: "https://evil.example" }),
        el("style", {}, "body{display:none}"),
        el("p", { onClick: "x()", onclick: "x()", style: "color:red", id: "ok" }),
        el("a", { href: "javascript:alert(1)", onMouseOver: "x()" }, "link"),
        el("img", { src: "https://evil.example/a.png", alt: "remote" }),
        el("img", { src: "/docs/_media/abc.png", alt: "", onError: "x()" }),
        el("div", { className: ["dv-table", 'bad"class'], role: "button", tabIndex: "1; x" }),
        { type: "comment" as const, value: "<script>" },
        { type: "raw" as const, value: "<script>alert(2)</script>" } as never,
      ],
    });
    expect(html).not.toMatch(/<(script|iframe|style)/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/javascript:|evil\.example|role="button"|tabindex="1/);
    expect(html).toContain("alert(1)"); // the script's text survives as escaped text, never as code
    expect(html).toContain("<p>x</p>");
    expect(html).toContain("<a>link</a>");
    expect(html).toContain("remote"); // a dropped image keeps its alt text
    expect(html).toContain(
      '<img src="/docs/_media/abc.png" alt="" loading="lazy" decoding="async">'
    );
    expect(html).toContain('<div class="dv-table">x</div>');
  });

  it("final href gate accepts only http, https, mailto, same-page and site-relative", () => {
    for (const ok of ["https://a.b", "http://a.b", "mailto:a@b.c", "#x", "/docs/"])
      expect(isSafeHref(ok)).toBe(true);
    for (const bad of [
      "javascript:x",
      " javascript:x",
      "java\nscript:x",
      "data:x",
      "//a.b",
      "",
      "file:///etc",
    ]) {
      expect(isSafeHref(bad)).toBe(false);
    }
  });
});

describe("docs viewer rendering", () => {
  it("renders GFM tables inside a keyboard-scrollable container with alignment classes", () => {
    const { html } = render("| a | b |\n|:--|--:|\n| 1 | 2 |\n");
    expect(html).toMatch(
      /<div class="dv-table" tabindex="0" role="region" aria-label="Table 1"><table>/
    );
    expect(html).toContain('<th class="dv-align-right">b</th>');
  });

  it("highlights fenced code at build time and labels the language; mermaid stays a plain code block", () => {
    const { html } = render(
      "```bash\nneotoma setup --tool cursor\n```\n\n```mermaid\nflowchart LR\n  a --> b\n```\n"
    );
    expect(html).toContain('<span class="dv-code-lang">bash</span>');
    expect(html).toMatch(/<span class="token [a-z ]+">--tool<\/span>/);
    expect(html).toContain('<code class="language-mermaid">flowchart LR');
    expect(html).toContain("a --&gt; b");
  });

  it("keeps deep-link heading IDs without visible hash controls", () => {
    const { html, headings } = render(
      "## Access Policies\n\n## Access Policies\n\n### `neotoma setup` (MCP)\n"
    );
    expect(headings.map((h) => h.id)).toEqual([
      "access-policies",
      "access-policies-1",
      "neotoma-setup-mcp",
    ]);
    expect(html).toContain('<h2 id="access-policies-1">');
    expect(html).not.toContain('class="dv-anchor"');
  });

  it("matches GitHub slugs for punctuation, emoji and unicode", () => {
    expect(githubSlug("Neotoma Architecture — Canonical Platform Definition")).toBe(
      "neotoma-architecture--canonical-platform-definition"
    );
    expect(githubSlug("1.2 What's new?")).toBe("12-whats-new");
    expect(githubSlug("Ünïcode_ok ✅")).toBe("ünïcode_ok-");
    const s = new Slugger();
    expect([s.slug("a"), s.slug("a"), s.slug("a-1"), s.slug("a")]).toEqual([
      "a",
      "a-1",
      "a-1-1",
      "a-2",
    ]);
  });

  it("moves the H1, summary sentence and applicability line into the page header", () => {
    const r = render(
      "# Title\n\nOne summary sentence.\n\nApplies to v0.25.0 and main.\n\n## Body\n\nText.\n"
    );
    expect(r.header).toMatchObject({
      h1: "Title",
      summary: "One summary sentence.",
      appliesTo: "Applies to v0.25.0 and main.",
    });
    expect(r.html).not.toContain("One summary sentence.");
    expect(r.html).not.toContain("<h1");
    expect(r.html).toContain("Text.");
  });

  it("prefers front matter summary and applies_to, and keeps a bold tagline in the body", () => {
    const r = render(
      "---\nsummary: From front matter.\napplies_to: main\n---\n# T\n\n**Bold tagline**\n\nBody.\n"
    );
    expect(r.header).toMatchObject({
      summary: "From front matter.",
      summarySource: "frontmatter",
      appliesTo: "main",
    });
    expect(r.html).toContain("<strong>Bold tagline</strong>");
  });

  it("does not show the summary or the applicability line twice when front matter repeats them", () => {
    const r = render(
      "---\nsummary: Same sentence.\napplies_to: main\n---\n# T\n\nSame sentence.\n\nApplies to main.\n\n## Body\n"
    );
    expect(r.html).not.toContain("Same sentence.");
    expect(r.html).not.toContain("Applies to main.");
  });
});

describe("docs viewer follow-up guards", () => {
  it("rejects backslash and percent-encoded backslash hrefs (browsers read them as slashes)", () => {
    for (const bad of [
      "/\\evil.example",
      "/%5Cevil.example",
      "/%5cevil.example",
      "\\\\evil.example",
      "https://neotoma.io/%5C",
    ]) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
    expect(resolveLink("/\\evil.example/x", ctx())).toMatchObject({ kind: "blocked", href: null });
    expect(resolveLink("/%5Cevil.example/x", ctx())).toMatchObject({ kind: "blocked", href: null });
    const { html } = render("[x](/\\evil.example) [y](/%5Cevil.example)");
    expect(html).not.toMatch(/href="[^"]*(\\|%5c)/i);
  });

  it("labels each table from the heading above it", () => {
    const { html } = render(
      "## Hosts\n\n| a |\n| - |\n| 1 |\n\n| b |\n| - |\n| 2 |\n\n## Flags\n\n| c |\n| - |\n| 3 |\n"
    );
    expect(html).toContain('aria-label="Hosts"');
    expect(html).toContain('aria-label="Hosts (table 2)"');
    expect(html).toContain('aria-label="Flags"');
    expect(render("| a |\n| - |\n| 1 |\n").html).toContain('aria-label="Table 1"');
  });

  it("drops a trailing Agent Instructions section from the page and says where it is", () => {
    const md =
      "# T\n\nA summary sentence.\n\n## Body\n\nText.\n\n## Agent Instructions\n\n### Forbidden patterns\n\n- Secret agent text\n";
    const r = render(md);
    expect(r.html).not.toContain("Secret agent text");
    expect(r.html).not.toContain("Agent Instructions");
    expect(r.agentInstructionsHeading).toBe("Agent Instructions");
    const entry = entries[0];
    const page = renderPage({ entry, doc: r, nav: entries, commit: COMMIT });
    expect(page).toContain(
      `${GH}/blob/${COMMIT}/docs/api/rest_api.md#agent-instructions">on GitHub</a>`
    );
    // A section that is not the last one is kept.
    expect(render("# T\n\n## Agent Instructions\n\nKept.\n\n## After\n\nText.\n").html).toContain(
      "Kept."
    );
  });
});

describe("docs viewer page chrome", () => {
  it("keeps full technical references in reader bodies on pinned GitHub sources", () => {
    const root = join(__dirname, "..", "..");
    for (const [source, reference] of [
      ["docs/topics/interfaces/rest-api.md", "docs/api/rest_api.md"],
      ["docs/topics/interfaces/cli.md", "docs/developer/cli_reference.md"],
      ["docs/topics/architecture/vocabulary.md", "docs/vocabulary/canonical_terms.md"],
    ]) {
      const context: RenderContext = {
        sourcePath: source,
        commit: COMMIT,
        index: DOCS_VIEWER_INDEX,
        pathKind: (repoPath) => {
          const path = join(root, repoPath);
          return existsSync(path) ? (statSync(path).isDirectory() ? "dir" : "file") : null;
        },
      };
      const markdown = readFileSync(join(root, source), "utf-8");
      const doc = renderDoc(parseDoc(source, markdown), context);
      expect(markdown, source).toContain(reference.split("/").at(-1));
      expect(doc.html, source).toContain(`${GH}/blob/${COMMIT}/${reference}`);
    }
  });

  it("renders collection breadcrumbs, useful related links and no script", () => {
    const entry = DOCS_VIEWER_MANIFEST.find((e) => e.slug === "mcp")!;
    const page = renderPage({
      entry,
      doc: render(
        "# MCP\n\nA short summary.\n\nApplies to main.\n",
        "docs/topics/interfaces/mcp.md"
      ),
      nav: DOCS_VIEWER_MANIFEST,
      commit: COMMIT,
    });
    expect(page).toContain('aria-label="Breadcrumb"');
    expect(page).toContain('<a href="/interfaces/">Interfaces</a>');
    expect(page).toContain('<li aria-current="page">MCP</li>');
    expect(page).toContain('aria-labelledby="dv-related-title"');
    expect(page).toContain('href="/integrations/"');
    expect(page.replace('<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>', "")).not.toContain("<script");
  });

  it("shows deep ancestors and meaningful small related galleries", () => {
    const snapshot = DOCS_VIEWER_MANIFEST.find((entry) => entry.id === "current-snapshot")!;
    const page = renderPage({
      entry: snapshot,
      doc: render("# Current snapshots\n"),
      nav: DOCS_VIEWER_MANIFEST,
      commit: COMMIT,
    });
    expect(page).toContain('<a href="/architecture/">How the system of record works</a>');
    expect(page).toContain('<a href="/record-model/">The record model</a>');
    expect(page).toContain('<li aria-current="page">Current snapshots</li>');
    const license = DOCS_VIEWER_MANIFEST.find((entry) => entry.id === "license")!;
    const licensePage = renderPage({
      entry: license,
      doc: render("# MIT license\n"),
      nav: DOCS_VIEWER_MANIFEST,
      commit: COMMIT,
    });
    expect(licensePage).toContain('aria-labelledby="dv-related-title"');
    expect(licensePage).toContain('href="/local-first/"');
    expect(license.relatedIds).not.toContain("license");
  });

  it("keeps curated related choices and excludes duplicate, self, and child cards", () => {
    const parent = { ...entries[0], relatedIds: ["readme", "readme", "rest-api", "child"] };
    const child = { ...entries[1], id: "child", slug: "child", parentId: parent.id };
    const peer = { ...entries[1], id: "peer", slug: "peer", collection: parent.collection };
    const page = renderPage({
      entry: parent,
      doc: render("# REST API\n"),
      nav: [parent, entries[1], child, peer],
      commit: COMMIT,
    });
    const related =
      /<section class="dv-topic-links" aria-labelledby="dv-related-title">([\s\S]*?)<\/section>/.exec(
        page
      )?.[1];
    expect(related).toContain('href="/readme/"');
    expect(related).not.toContain('href="/rest-api/"');
    expect(related?.match(/href="\/child\/"/g)).toHaveLength(1);
    expect(related).not.toContain('href="/peer/"');
    expect(related?.match(/href="\/readme\/"/g)).toHaveLength(1);
    expect(page).not.toContain('id="dv-collection-title"');
    expect(page.match(/class="dv-topic-grid"/g)).toHaveLength(1);
    expect(page).toContain('href="/child/"');
  });

  it("handles an empty related set without a duplicate or empty gallery", () => {
    const page = renderPage({
      entry: { ...entries[0], relatedIds: [] },
      doc: render("# REST API\n"),
      nav: [entries[0], { ...entries[0], id: "peer", slug: "peer", order: 41 }],
      commit: COMMIT,
    });
    expect(page).not.toContain('aria-labelledby="dv-related-title"');
    expect(page).not.toContain('aria-labelledby="dv-collection-title"');
  });

  it("gives every included reader related cards or a collection of its children", () => {
    for (const entry of DOCS_VIEWER_MANIFEST.filter((item) => item.status === "included")) {
      const page = renderPage({
        entry,
        doc: render(`# ${entry.title}\n`),
        nav: DOCS_VIEWER_MANIFEST,
        commit: COMMIT,
      });
      expect(
        page.includes('aria-labelledby="dv-related-title"') ||
          page.includes('aria-labelledby="dv-collection-title"'),
        entry.id
      ).toBe(true);
    }
  });

  it("renders optional static visual metadata with caption outside the image", () => {
    const entry = {
      ...entries[0],
      visual: {
        src: "/brand/october/example.webp",
        alt: "Paper record connected to a source",
        caption: "A source supports the current record.",
      },
    };
    const page = renderPage({ entry, doc: render("# T\n"), nav: entries, commit: COMMIT });
    expect(page).toContain(
      '<img src="/brand/october/example.webp" alt="Paper record connected to a source">'
    );
    expect(page).toContain("<figcaption>A source supports the current record.</figcaption>");
  });
  const entry = entries[0];
  it("keeps preview documents noindex without a review badge", () => {
    const page = renderPage({
      entry,
      doc: render("# T\n\nA summary.\n"),
      nav: entries,
      commit: COMMIT,
      sourceContext: "local-preview",
    });
    expect(page).toContain('<meta name="robots" content="noindex,follow">');
    expect(page).not.toContain("Pre-release review");
  });
  it("uses the accepted solid logo lockup in the masthead", () => {
    const page = renderPage({
      entry,
      doc: render("# T\n\nA summary.\n"),
      nav: entries,
      commit: COMMIT,
    });
    expect(page).toContain('class="plan-logo-light" src="/brand/n2-nav-light.svg"');
    expect(page).toContain('class="plan-logo-dark" src="/brand/n2-nav-dark.svg"');
    expect(page).not.toContain("<b>Neotoma</b>");
    // The current homepage's charcoal dark preference keeps its matching logo treatment.
    expect(page).toContain(".plan-site-footer .plan-logo-dark");
    expect(page).toContain(".dark .plan");
    expect(page).toContain('<nav class="plan-nav" aria-label="Site">');
    expect(page).toContain('<footer class="plan-site-footer"');
    expect(page).not.toContain('aria-label="Documentation"');
  });

  it("uses the homepage's local Instrument font files in static docs output", () => {
    const page = renderPage({
      entry,
      doc: render("# T\n\nA summary.\n"),
      nav: entries,
      commit: COMMIT,
    });
    for (const asset of [
      "/brand/october/instrument-sans-regular.ttf",
      "/brand/october/instrument-sans-semibold.ttf",
      "/brand/october/instrument-serif.ttf",
    ])
      expect(page).toContain(asset);
    expect(page).toContain('--serif:"Instrument Serif Docs",Georgia,serif');
    expect(page).toContain('--sans:"Instrument Sans Docs",system-ui,sans-serif');
  });

  it("truncates the meta description to about 155 characters at a word boundary", () => {
    const long = "word ".repeat(80).trim() + ".";
    expect(metaDescription(long).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(metaDescription(long).endsWith("…")).toBe(true);
    expect(metaDescription("Short and complete.")).toBe("Short and complete.");
    const page = renderPage({
      entry,
      doc: render(`# T\n\n${"A very long summary ".repeat(20)}end.\n`),
      nav: entries,
      commit: COMMIT,
    });
    const content = /<meta name="description" content="([^"]*)">/.exec(page)![1];
    expect(content.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it("removes engineering chrome while preserving provenance metadata and useful deep links", () => {
    const page = renderPage({
      entry,
      doc: render(
        "# T\n\nA summary.\n\nApplies to v0.25.0.\n\n## One\n\nFirst paragraph.\n\n## Two\n\nSecond paragraph.\n\n## Three\n"
      ),
      nav: entries,
      commit: COMMIT,
    });
    expect(page).toContain(`<meta name="docs-viewer-commit" content="${COMMIT}">`);
    expect(page).toContain('<h2 id="two">Two</h2>');
    expect(page).not.toMatch(/<(?:p|div|details)[^>]*class="dv-(?:applies|toc|source-foot)"/);
    expect(page).toContain('class="dv-meta"');
    expect(page).not.toContain('class="dv-anchor"');
    expect(page).toContain('rel="alternate" type="text/markdown"');
  });

  it("caps the body measure and preserves the shared navigation and footer link targets", () => {
    const page = renderPage({ entry, doc: render("# T\n"), nav: entries, commit: COMMIT });
    expect(page).toContain(".dv-body>*{max-width:72ch}");
    const nav = page.slice(
      page.indexOf(".plan-nav a {"),
      page.indexOf("}", page.indexOf(".plan-nav a {"))
    );
    const footer = page.slice(
      page.indexOf(".plan-deeper a {"),
      page.indexOf("}", page.indexOf(".plan-deeper a {"))
    );
    expect(nav).toContain("min-height: 2.75rem");
    expect(footer).toContain("min-height: 44px");
    expect(page).toContain(".dv-meta a{display:inline-block;min-height:32px");
  });
});
