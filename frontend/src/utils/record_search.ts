import type { NeotomaRecord } from '@/types/record';

export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Normalize a string by removing hyphens, spaces, and other separators
 * for better fuzzy matching (e.g., "push-ups" -> "pushups")
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_\s]+/g, '') // Remove hyphens, underscores, spaces
    .replace(/[^a-z0-9]/g, ''); // Remove any remaining non-alphanumeric chars
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  
  // If one string is empty, return the length of the other
  if (m === 0) return n;
  if (n === 0) return m;
  
  // Create a matrix
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return d[m][n];
}

/**
 * Check if a token fuzzy matches a field string
 * Uses multiple strategies:
 * 1. Exact substring match (fastest)
 * 2. Normalized substring match (handles hyphens/spaces)
 * 3. Fuzzy match using Levenshtein distance (handles typos)
 */
function tokenFuzzyMatches(token: string, field: string): boolean {
  // Strategy 1: Exact substring match
  if (field.includes(token)) {
    return true;
  }
  
  // Strategy 2: Normalized substring match (handles "pushups" vs "push-ups")
  const normalizedToken = normalizeString(token);
  const normalizedField = normalizeString(field);
  if (normalizedField.includes(normalizedToken)) {
    return true;
  }
  
  // Strategy 3: Fuzzy match using Levenshtein distance
  // For short tokens, allow up to 1-2 character differences
  // For longer tokens, allow up to 20% difference
  const maxDistance = token.length <= 4 
    ? Math.max(1, Math.floor(token.length * 0.3)) // 1-2 chars for short words
    : Math.max(2, Math.floor(token.length * 0.2)); // 20% for longer words
  
  // Check against the full normalized field
  const distance = levenshteinDistance(normalizedToken, normalizedField);
  if (distance <= maxDistance) {
    return true;
  }
  
  // Also check if token matches any word in the field (split by spaces/hyphens)
  const fieldWords = field.split(/[-_\s]+/).filter(Boolean);
  for (const word of fieldWords) {
    const normalizedWord = normalizeString(word);
    const wordDistance = levenshteinDistance(normalizedToken, normalizedWord);
    if (wordDistance <= maxDistance) {
      return true;
    }
  }
  
  return false;
}

function collectSearchableStrings(value: unknown, acc: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    acc.push(String(value).toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchableStrings(item, acc));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      acc.push(key.toLowerCase());
      collectSearchableStrings(val, acc);
    });
  }
}

export function buildRecordSearchStrings(record: NeotomaRecord): string[] {
  const parts: string[] = [];
  [record.type, record.summary ?? '', record.id, ...(record.file_urls ?? [])].forEach((value) => {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value.toLowerCase());
    }
  });
  collectSearchableStrings(record.properties ?? {}, parts);
  return parts;
}

export function recordMatchesQuery(record: NeotomaRecord, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  const searchableStrings = buildRecordSearchStrings(record);
  if (searchableStrings.length === 0) {
    return false;
  }

  // Each token must match at least one field using fuzzy matching
  return tokens.every((token) => 
    searchableStrings.some((field) => tokenFuzzyMatches(token, field))
  );
}


