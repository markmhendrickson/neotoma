/** Strip YAML frontmatter (--- … ---) from markdown. */
function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/m, "").trimStart();
}

/**
 * Turn fetched SKILL.md (or install.md) into a short plain-text preview for the skill page.
 * Not full markdown rendering — avoids shipping a markdown parser for this use case.
 */
export function skillMarkdownToSnippet(markdown: string, maxLen = 560): string {
  let s = stripFrontmatter(markdown);
  s = s.replace(/^#{1,6}\s+[^\n]+\n+/gm, "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/[*_>#]+/g, " ");
  s = s.replace(/\r?\n+/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > maxLen * 0.45 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}
