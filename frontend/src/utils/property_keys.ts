const ACRONYMS = new Set(['id', 'url', 'urls', 'api', 'opfs', 'csv', 'pdf', 'ai']);

function capitalize(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function humanizePropertyKey(rawKey: string): string {
  if (!rawKey) {
    return 'Property';
  }

  const normalized = rawKey
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'Property';
  }

  return normalized
    .split(' ')
    .map(capitalize)
    .join(' ');
}


