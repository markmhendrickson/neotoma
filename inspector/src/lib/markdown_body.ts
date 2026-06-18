/**
 * True when a trimmed string looks like Markdown: ATX headings, lists (including
 * ordered and `*`), fenced blocks, inline code, `**bold**`, links `[text](url)`,
 * or long prose (>=200 chars).
 */
export function looksLikeMarkdownBodyString(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  return (
    t.length > 200 ||
    /^#{1,6} /m.test(t) ||
    /\*\*[^*]+\*\*/.test(t) ||
    /^- .+/m.test(t) ||
    /^\* .+/m.test(t) ||
    /^\d+\. .+/m.test(t) ||
    /^```/m.test(t) ||
    /`[^`]+`/.test(t) ||
    /\[[^\]]+\]\([^)]+\)/.test(t)
  );
}

/** Any snapshot field whose value is a string matching {@link looksLikeMarkdownBodyString}. */
export function isLikelyMarkdownFieldValue(value: unknown): value is string {
  return typeof value === "string" && looksLikeMarkdownBodyString(value);
}
