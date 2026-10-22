/**
 * Linear helpers over the built neotoma.io HTML, shared by the static build and the export validator.
 *
 * Every function is one pass built on `indexOf` or on the docs viewer's scanner, so a broken or hostile
 * page (unterminated tags, thousands of opening script tags) cannot make the build or the validator
 * quadratic. A lazy `[\s\S]*?` between an opening tag and a closing tag is the pattern this replaces:
 * with no closing tag it rescans the rest of the document from every opening tag.
 */
import { scanHtml } from "./docs_viewer/validate_export";

const LD_MARKER = '<script type="application/ld+json"';
const LD_CLOSE = "</script>";

/** The text of each JSON-LD block, in document order. An unterminated block ends the scan. */
export function jsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const start = html.indexOf(LD_MARKER, i);
    if (start < 0) break;
    const gt = html.indexOf(">", start);
    if (gt < 0) break;
    const close = html.indexOf(LD_CLOSE, gt);
    if (close < 0) break;
    out.push(html.slice(gt + 1, close));
    i = close + LD_CLOSE.length;
  }
  return out;
}

/** Title, every meta tag's content and every JSON-LD block of a built page, as one string. */
export function headMetaText(html: string): string {
  const open = html.search(/<title[\s>]/i);
  let title = "";
  if (open >= 0) {
    const gt = html.indexOf(">", open);
    const end = gt < 0 ? -1 : html.indexOf("</title", gt);
    if (end >= 0) title = html.slice(gt + 1, end);
  }
  const metas = scanHtml(html)
    .tags.filter((t) => t.name === "meta" && !t.closing)
    .map((t) => t.attrs.find((a) => a.name === "content")?.value ?? "")
    .filter(Boolean);
  return [title, ...metas, ...jsonLdBlocks(html)].join("\n");
}

/**
 * The static head template and react-helmet both emit a route's JSON-LD, so a captured page carries every
 * block twice. Keep the first copy of each distinct block and drop the later copies.
 */
export function dedupeJsonLd(html: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const start = html.indexOf(LD_MARKER, i);
    if (start < 0) break;
    const gt = html.indexOf(">", start);
    if (gt < 0) break;
    const close = html.indexOf(LD_CLOSE, gt);
    if (close < 0) break;
    const end = close + LD_CLOSE.length;
    const body = html.slice(gt + 1, close).trim();
    parts.push(html.slice(i, start));
    if (seen.has(body)) {
      let k = end;
      while (k < html.length && /\s/.test(html[k])) k++;
      i = k;
    } else {
      seen.add(body);
      parts.push(html.slice(start, end));
      i = end;
    }
  }
  parts.push(html.slice(i));
  return parts.join("");
}
