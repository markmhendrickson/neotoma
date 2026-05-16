import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml } from "./markdown_render.js";

describe("escapeHtml", () => {
  it("escapes the standard set", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderMarkdown", () => {
  it("renders ATX headings with deterministic anchors", () => {
    expect(renderMarkdown("# Hello World")).toBe(`<h1 id="hello-world">Hello World</h1>`);
    expect(renderMarkdown("## A Subhead")).toBe(`<h2 id="a-subhead">A Subhead</h2>`);
  });

  it("renders paragraphs and joins wrapped lines with a space", () => {
    expect(renderMarkdown("This is\na paragraph.")).toBe("<p>This is a paragraph.</p>");
  });

  it("renders fenced code blocks with language class and escapes content", () => {
    const out = renderMarkdown("```ts\nconst x = `<a>`;\n```");
    expect(out).toContain('<pre><code class="language-ts">');
    expect(out).toContain("&lt;a&gt;");
  });

  it("renders inline code, bold, italic, and links", () => {
    const out = renderMarkdown("See `foo`, **bold**, *italic*, and [link](https://x.test).");
    expect(out).toContain("<code>foo</code>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain('<a href="https://x.test">link</a>');
  });

  it("rewrites docs/-relative .md links to /docs/ slugs", () => {
    const out = renderMarkdown("[here](docs/foundation/core_identity.md)");
    expect(out).toContain('href="/docs/foundation/core_identity"');
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- a\n- b\n")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b\n")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders horizontal rule and blockquote", () => {
    expect(renderMarkdown("---")).toBe("<hr />");
    expect(renderMarkdown("> quoted")).toBe("<blockquote>quoted</blockquote>");
  });

  it("is deterministic for identical input", () => {
    const src = "# H\n\n- a\n- b\n\n```\ncode\n```";
    expect(renderMarkdown(src)).toBe(renderMarkdown(src));
  });
});
