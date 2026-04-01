import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export const SITE_MARKDOWN_ROOT_ATTR = "data-site-markdown-root";

export const SITE_MARKDOWN_ROOT_SELECTOR = `[${SITE_MARKDOWN_ROOT_ATTR}]`;

let turndownSingleton: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownSingleton) {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    td.use(gfm);
    turndownSingleton = td;
  }
  return turndownSingleton;
}

/**
 * Replace table cell contents with normalized plain text so Turndown emits readable GFM tables
 * (avoids link/tooltip/icon markup breaking rows).
 */
function flattenTableCellsForMarkdown(root: Element): void {
  root.querySelectorAll("table th, table td").forEach((cell) => {
    const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
    cell.innerHTML = "";
    cell.textContent = text;
  });
}

/**
 * Convert a live or parsed DOM subtree (the site page body root) to GitHub-flavored Markdown.
 */
export function htmlElementToMarkdown(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  flattenTableCellsForMarkdown(clone);
  return getTurndown().turndown(clone.innerHTML).replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove the generated HTML comment banner (used for preview-only rendering). */
export function stripMarkdownExportBanner(md: string): string {
  return md.replace(/^<!--[\s\S]*?-->\s*/u, "").trimStart();
}
