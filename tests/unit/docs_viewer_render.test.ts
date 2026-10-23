import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
    slug: "",
    source: "docs/README.md",
    aliases: ["docs/"],
    title: "Documentation",
    group: "Start here",
    order: 0,
    status: "included",
  },
  {
    slug: "rest-api",
    source: "docs/api/rest_api.md",
    title: "REST API",
    group: "Start here",
    order: 40,
    status: "included",
  },
  {
    slug: "readme",
    source: "README.md",
    title: "README",
    group: "Start here",
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
      href: "/docs/rest-api/#authentication",
    });
    expect(resolveLink("../../README.md", ctx())).toMatchObject({
      kind: "viewer",
      href: "/docs/readme/",
    });
  });

  it("resolves per source file: root-relative README links and docs-relative links reach the same file", () => {
    expect(resolveLink("docs/api/rest_api.md", ctx("README.md")).href).toBe("/docs/rest-api/");
    expect(resolveLink("/docs/api/rest_api.md", ctx()).href).toBe("/docs/rest-api/");
  });

  it("maps an alias (the docs/ folder) to the docs index", () => {
    expect(resolveLink("docs/", ctx("README.md")).href).toBe("/docs/");
    expect(resolveLink("../", ctx()).href).toBe("/docs/");
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
        slug: "core",
        source: "docs/foundation/core_identity.md",
        title: "Core",
        group: "Start here",
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
      "/docs/rest-api/#errors"
    );
    expect(resolveLink("https://www.npmjs.com/package/neotoma", ctx())).toMatchObject({
      kind: "external",
    });
  });

  it("flags links to retired neotoma.io routes and keeps live and held ones", () => {
    expect(resolveLink("https://neotoma.io/integrations", ctx()).problem).toBe("retired-route");
    expect(resolveLink("https://neotoma.io/install", ctx()).problem).toBeUndefined();
    expect(resolveLink("https://neotoma.io/evaluate", ctx()).problem).toBeUndefined();
    // A published viewer route is a real page, not retired.
    expect(resolveLink("https://neotoma.io/docs/rest-api/", ctx()).problem).toBeUndefined();
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

  it("escapes attribute values built from document text", () => {
    const { html } = render('## Say "hi" <x> & bye');
    expect(html).toMatch(
      /aria-label="Link to this section: Say &quot;hi&quot; &lt;x&gt; &amp; bye"/
    );
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

  it("gives headings GitHub-compatible ids with anchors and de-duplicates them", () => {
    const { html, headings } = render(
      "## Access Policies\n\n## Access Policies\n\n### `neotoma setup` (MCP)\n"
    );
    expect(headings.map((h) => h.id)).toEqual([
      "access-policies",
      "access-policies-1",
      "neotoma-setup-mcp",
    ]);
    expect(html).toContain('<h2 id="access-policies-1">');
    expect(html).toContain('<a href="#access-policies" class="dv-anchor"');
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
    const entry = entries[1];
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
  const entry = entries[1];
  it("labels preview documents and keeps them noindex", () => {
    vi.stubEnv("SITE_PREVIEW", "1");
    const page = renderPage({
      entry,
      doc: render("# T\n\nA summary.\n"),
      nav: entries,
      commit: COMMIT,
    });
    expect(page).toContain('<meta name="robots" content="noindex,follow">');
    expect(page).toContain("Pre-release review");
  });
  it("uses the accepted solid logo lockup in the masthead, for light and dark", () => {
    const page = renderPage({
      entry,
      doc: render("# T\n\nA summary.\n"),
      nav: entries,
      commit: COMMIT,
    });
    expect(page).toContain('src="/brand/n2-nav-light.svg" alt="Neotoma"');
    expect(page).toContain('src="/brand/n2-nav-dark.svg" alt="Neotoma"');
    expect(page).not.toContain("<b>Neotoma</b>");
    // Dark mode swaps the files; the swap must come after (and outrank) the default rule.
    const hide = page.indexOf(".dv-brand .dv-logo-dark{display:none}");
    const swap = page.indexOf(
      "@media (prefers-color-scheme:dark){.dv-brand .dv-logo-light{display:none}.dv-brand .dv-logo-dark{display:block}}"
    );
    expect(hide).toBeGreaterThan(-1);
    expect(swap).toBeGreaterThan(hide);
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

  it("lists h3 headings in the on-page contents only on long pages", () => {
    const body = (words: number) =>
      `# T\n\nA summary.\n\n## One\n\n### Sub one\n\n${"text ".repeat(words)}\n\n## Two\n\n## Three\n`;
    const short = renderPage({ entry, doc: render(body(10)), nav: entries, commit: COMMIT });
    expect(short).toContain('<a href="#one">One</a>');
    expect(short).not.toContain('<a href="#sub-one">');
    const long = renderPage({
      entry,
      doc: render(body(CONTENTS_H3_WORDS + 50)),
      nav: entries,
      commit: COMMIT,
    });
    expect(long).toContain('<ol><li><a href="#sub-one">Sub one</a></li></ol>');
  });

  it("caps the body measure and gives small links a 24px target", () => {
    const page = renderPage({ entry, doc: render("# T\n"), nav: entries, commit: COMMIT });
    expect(page).toContain(".dv-body>*{max-width:72ch}");
    for (const sel of [
      ".dv-masthead nav a{",
      ".dv-side li a,.dv-mnav li a{",
      ".dv-meta a{",
      ".dv-foot a{",
    ]) {
      const rule = page.slice(page.indexOf(sel), page.indexOf("}", page.indexOf(sel)));
      expect(rule, sel).toContain("min-height:24px");
    }
  });
});
