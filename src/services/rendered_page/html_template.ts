/**
 * Minimal HTML page template for serving `rendered_page` entities via
 * GET /entities/:id/html.
 *
 * Deliberately not reusing src/services/root_landing/html_template.ts —
 * that one is the landing-page renderer and embeds landing-specific context.
 * This is a generic shell suitable for any rendered_page.
 *
 * `htmlBody` is inserted verbatim (NOT escaped). `title`, `metaDescription`,
 * and `customCss` are sanitized as described inline.
 */

export interface RenderedPageHtmlInput {
  title: string;
  htmlBody: string;
  metaDescription?: string;
  customCss?: string;
}

const DEFAULT_STYLES = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 17px;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fafafa;
  padding: 2.5rem 1.25rem 4rem;
}
main { max-width: 720px; margin: 0 auto; }
h1, h2, h3, h4 { line-height: 1.25; margin-top: 2rem; margin-bottom: 0.75rem; }
h1 { font-size: 2.1rem; margin-top: 0; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.2rem; }
p { margin: 0 0 1rem; }
a { color: #0b66c2; text-decoration: underline; text-underline-offset: 2px; }
a:hover { color: #064a8a; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; background: #efeae3; padding: 0.1em 0.35em; border-radius: 3px; }
pre { background: #1a1a1a; color: #f4f1ec; padding: 1rem 1.1rem; border-radius: 6px; overflow-x: auto; }
pre code { background: transparent; color: inherit; padding: 0; }
blockquote { border-left: 3px solid #d4ccc2; margin: 1rem 0; padding: 0.3rem 0 0.3rem 1rem; color: #555; }
hr { border: none; border-top: 1px solid #e3ddd2; margin: 2rem 0; }
ul, ol { margin: 0 0 1rem 0; padding-left: 1.5rem; }
li { margin-bottom: 0.35rem; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e3ddd2; }
th { background: #f4f1ec; font-weight: 600; }
.footer-meta { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e3ddd2; font-size: 0.85rem; color: #777; }
`;

function escapeHtmlAttribute(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Conservative CSS sanitizer: blocks `</style>` (which would close the inline
 * style tag and let arbitrary HTML follow) and `<` more broadly. Authors are
 * trusted but we still strip the one escape vector that breaks the page shell.
 */
function sanitizeCss(css: string): string {
  return css.replace(/<\/?\s*style/gi, "");
}

export function renderRenderedPageHtml(input: RenderedPageHtmlInput): string {
  const title = escapeHtmlAttribute(input.title);
  const metaDescription = input.metaDescription ? escapeHtmlAttribute(input.metaDescription) : "";
  const customCss = input.customCss ? sanitizeCss(input.customCss) : "";

  const metaTag = metaDescription ? `<meta name="description" content="${metaDescription}">` : "";
  const customStyleTag = customCss ? `<style>${customCss}</style>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${metaTag}
<style>${DEFAULT_STYLES}</style>
${customStyleTag}
</head>
<body>
<main>
${input.htmlBody}
</main>
</body>
</html>`;
}
