/** Client-side token match aligned with backend entity search normalization. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

export function matchesSearchTokens(searchableText: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const normalized = normalizeSearchText(searchableText);
  return tokens.every((token) => normalized.includes(token));
}

export function matchesSearchQuery(searchableText: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return false;
  return matchesSearchTokens(searchableText, tokens);
}
