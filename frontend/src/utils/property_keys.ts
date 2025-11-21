const ACRONYMS = new Set(['id', 'url', 'urls', 'api', 'opfs', 'csv', 'pdf', 'ai']);

function capitalize(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Humanizes property keys in the UI, mirroring the backend utility so column
 * labels stay consistent regardless of where the record originated.
 */
export function humanizePropertyKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== 'string') {
    return 'Property';
  }

  const normalized = rawKey
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .replace(/[_\-.]+/g, ' ') // delimiters -> spaces
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'Property';
  }

  return normalized
    .split(' ')
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

