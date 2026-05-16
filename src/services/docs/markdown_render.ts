/**
 * Minimal, deterministic markdown → HTML renderer for the `/docs` route.
 *
 * Covers the subset used by Neotoma docs: ATX headings, paragraphs, fenced
 * code blocks (` ``` `), inline code, **bold** / *italic*, [links](url),
 * unordered / ordered lists, blockquotes, horizontal rules, hard line breaks.
 *
 * Output is HTML-escaped at every text boundary. Auto-anchors are derived
 * deterministically from heading text (slugified).
 *
 * This renderer is intentionally narrow. Docs that need richer markdown
 * (tables with alignment, footnotes, math) can be enhanced later or rendered
 * to a richer surface; the source markdown remains canonical.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Render inline span markup (code, bold, italic, links). */
function renderInline(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // Inline code
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    // Link [text](url)
    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket > i && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket) {
          const label = text.slice(i + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen);
          out += `<a href="${escapeHtml(rewriteHref(href))}">${renderInline(label)}</a>`;
          i = closeParen + 1;
          continue;
        }
      }
    }
    // Bold **x**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 1) {
        out += `<strong>${renderInline(text.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }
    // Italic *x*
    if (ch === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i && text[i + 1] !== " ") {
        out += `<em>${renderInline(text.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }
    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

/**
 * Rewrite an inline link href:
 *   - `docs/foo/bar.md` → `/docs/foo/bar`
 *   - `./bar.md` and `../sibling.md` are left as-is (best-effort; deep relative
 *     links are validated by gap-doc authoring rather than the renderer).
 *   - Anchors and absolute URLs pass through unchanged.
 */
function rewriteHref(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) return href;
  if (href.startsWith("docs/") && href.endsWith(".md")) {
    return "/docs/" + href.slice("docs/".length).replace(/\.md$/, "");
  }
  if (href.endsWith(".md")) {
    return href.replace(/\.md$/, "");
  }
  return href;
}

interface BlockState {
  out: string[];
  i: number;
  lines: string[];
}

export function renderMarkdown(source: string): string {
  // Normalize line endings, strip frontmatter if it leaked through.
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const state: BlockState = { out: [], i: 0, lines };

  while (state.i < state.lines.length) {
    const line = state.lines[state.i];

    // Fenced code block
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      state.i += 1;
      while (state.i < state.lines.length && !/^```\s*$/.test(state.lines[state.i])) {
        buf.push(state.lines[state.i]);
        state.i += 1;
      }
      state.i += 1; // skip closing fence
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      state.out.push(`<pre><code${langAttr}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const slug = slugifyHeading(text);
      state.out.push(
        `<h${level} id="${escapeHtml(slug)}">${renderInline(text)}</h${level}>`,
      );
      state.i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:-\s*){3,}\s*$|^\s*(?:\*\s*){3,}\s*$/.test(line)) {
      state.out.push("<hr />");
      state.i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (state.i < state.lines.length && /^\s*>/.test(state.lines[state.i])) {
        buf.push(state.lines[state.i].replace(/^\s*>\s?/, ""));
        state.i += 1;
      }
      state.out.push(`<blockquote>${renderInline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // Lists (unordered or ordered)
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      const matcher = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (state.i < state.lines.length && matcher.test(state.lines[state.i])) {
        const m = matcher.exec(state.lines[state.i])!;
        items.push(`<li>${renderInline(m[1])}</li>`);
        state.i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      state.out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      state.i += 1;
      continue;
    }

    // Paragraph (accumulate consecutive non-blank, non-block lines)
    const para: string[] = [];
    while (state.i < state.lines.length) {
      const l = state.lines[state.i];
      if (
        /^\s*$/.test(l) ||
        /^(#{1,6})\s+/.test(l) ||
        /^```/.test(l) ||
        /^\s*>/.test(l) ||
        /^\s*[-*+]\s+/.test(l) ||
        /^\s*\d+\.\s+/.test(l) ||
        /^\s*(?:-\s*){3,}\s*$|^\s*(?:\*\s*){3,}\s*$/.test(l)
      ) {
        break;
      }
      para.push(l);
      state.i += 1;
    }
    if (para.length > 0) {
      state.out.push(`<p>${renderInline(para.join(" "))}</p>`);
    }
  }

  return state.out.join("\n");
}
